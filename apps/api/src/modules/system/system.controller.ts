import { Controller, Get, Module, Query, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import Redis from 'ioredis';
import { SCREENS, SCREEN_FAMILIES, SCREEN_STATUS, PATTERN_PURPOSE } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { Public } from '../../common/context';
import { StorageService } from '../../common/adapters';
import { verifyDownload } from '../../common/crypto';
import { OPEN_LIST } from '../opportunities/opportunities.service';
import { config } from '../../config';

@ApiTags('system')
@Controller()
export class SystemController {
  constructor(@InjectDb() private db: Db, private storage: StorageService) {}

  @Public()
  @Get('health')
  async health() {
    const checks: Record<string, 'ok' | 'down' | 'skipped'> = {};
    try {
      await this.db.execute(sql`select 1`);
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
    if (config().NODE_ENV === 'test') checks.redis = 'skipped';
    else {
      const r = new Redis(config().REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1000 });
      try {
        await r.connect();
        checks.redis = (await r.ping()) === 'PONG' ? 'ok' : 'down';
      } catch {
        checks.redis = 'down';
      } finally {
        r.disconnect();
      }
    }
    const ok = checks.database === 'ok';
    return { status: ok ? 'ok' : 'degraded', service: 'collabiz-api', version: '0.1.0', checks, time: new Date().toISOString() };
  }

  /** Screen registry (001–165) with implementation status — powers the in-app registry and docs. */
  @Public()
  @Get('meta/screens')
  screens() {
    return {
      families: SCREEN_FAMILIES,
      patterns: PATTERN_PURPOSE,
      screens: SCREENS.map((s) => ({ ...s, status: SCREEN_STATUS[s.id]?.status ?? 'planned', tests: SCREEN_STATUS[s.id]?.tests ?? [] })),
    };
  }

  @Public()
  /** 001 — live platform figures for the public homepage. Aggregates only; nothing identifies an organization. */
  @Public()
  @Get('public/stats')
  async stats() {
    const r = await this.db.execute(sql`select
      (select count(*)::int from organizations where verification_status = 'verified' and type in ('partner_company','partner_individual')) as "verifiedPartners",
      (select count(*)::int from organizations where type = 'group_company') as "groupCompanies",
      (select count(*)::int from opportunities where listed and visibility = 'public' and status in ${OPEN_LIST}) as "openOpportunities",
      (select coalesce(sum(estimated_value),0)::bigint from opportunities where listed and visibility = 'public' and status in ${OPEN_LIST}) as "openValue",
      (select count(distinct sector)::int from opportunities where listed and status in ${OPEN_LIST}) as "activeSectors",
      (select count(*)::int from lead_claims where status in ('protected','upheld','released')) as "protectedLeads"`);
    const row = ((r as unknown as { rows?: Record<string, unknown>[] }).rows ?? (r as unknown as Record<string, unknown>[]))[0];
    return { ...row, openValue: Number(row.openValue), asOf: new Date().toISOString() };
  }

  @Get('meta/features')
  features() {
    return {
      demoMode: config().DEMO_MODE,
      investorDataRoom: config().FEATURE_INVESTOR_DATA_ROOM,
      financeIntroductions: config().FEATURE_FINANCE_INTRODUCTIONS,
      aiProvider: config().AI_PROVIDER,
      identityProvider: config().IDENTITY_PROVIDER,
    };
  }

  /** Signed, expiring download endpoint. Authorization happens when the URL is issued. */
  @Public()
  @Get('files/download')
  async download(@Query('key') key: string, @Query('expires') expires: string, @Query('sig') sig: string, @Res() res: Response) {
    if (!key || !sig) throw new BadRequestException('Missing parameters');
    if (!verifyDownload(key, Number(expires), sig)) throw new BadRequestException('Download link expired or invalid');
    try {
      const buf = await this.storage.get(key);
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buf);
    } catch {
      throw new NotFoundException('File not found');
    }
  }
}

@Module({ controllers: [SystemController] })
export class SystemModule {}

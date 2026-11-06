import { Global, Injectable, Module } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { InjectDb, type Db } from '../db/client';
import { auditEvents } from '../db/schema';
import { sha256 } from './crypto';
import type { RequestContext } from './context';

export interface AuditInput {
  action: string;
  objectType: string;
  objectId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  organizationId?: string | null;
}

const stable = (v: unknown): string => JSON.stringify(v ?? null, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort()) : val));
const REDACT = /(password|secret|token|account_?number|pan|mfa)/i;
function redact(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(redact);
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, REDACT.test(k) ? '[redacted]' : redact(val)]));
}

/** Append-only, hash-chained audit log (§6.3 audit_events: actor, tenant, object, before/after hash, timestamp). */
@Injectable()
export class AuditService {
  constructor(@InjectDb() private db: Db) {}

  async record(ctx: Pick<RequestContext, 'userId' | 'orgId' | 'ip' | 'requestId'> | null, e: AuditInput, tx: Db = this.db) {
    const before = e.before === undefined ? null : redact(e.before);
    const after = e.after === undefined ? null : redact(e.after);
    const run = async (t: Db) => {
      await t.execute(sql`select pg_advisory_xact_lock(7340211)`);
      const [last] = await t.select({ hash: auditEvents.hash }).from(auditEvents).orderBy(desc(auditEvents.seq)).limit(1);
      const at = new Date();
      const beforeHash = before == null ? null : sha256(stable(before));
      const afterHash = after == null ? null : sha256(stable(after));
      const prevHash = last?.hash ?? null;
      const hash = sha256([prevHash ?? '', at.toISOString(), ctx?.userId ?? '', e.action, e.objectType, e.objectId ?? '', beforeHash ?? '', afterHash ?? '', e.reason ?? ''].join('|'));
      const [row] = await t.insert(auditEvents).values({
        at, actorUserId: ctx?.userId ?? null, organizationId: e.organizationId ?? ctx?.orgId ?? null, action: e.action, objectType: e.objectType,
        objectId: e.objectId ?? null, reason: e.reason ?? null, before, after, beforeHash, afterHash, prevHash, hash, ip: ctx?.ip ?? null, requestId: ctx?.requestId ?? null,
      }).returning();
      return row;
    };
    // Join the caller's transaction if one is passed, otherwise open our own.
    return tx === this.db ? this.db.transaction((t) => run(t as unknown as Db)) : run(tx);
  }

  async forObject(objectType: string, objectId: string) {
    return this.db.select().from(auditEvents).where(and(eq(auditEvents.objectType, objectType), eq(auditEvents.objectId, objectId))).orderBy(auditEvents.seq);
  }

  /** Re-computes the chain; returns the first broken sequence number or null when intact. */
  async verifyChain(): Promise<{ intact: boolean; brokenAt: number | null; checked: number }> {
    const rows = await this.db.select().from(auditEvents).orderBy(auditEvents.seq);
    let prev: string | null = null;
    for (const r of rows) {
      const h = sha256([prev ?? '', new Date(r.at).toISOString(), r.actorUserId ?? '', r.action, r.objectType, r.objectId ?? '', r.beforeHash ?? '', r.afterHash ?? '', r.reason ?? ''].join('|'));
      if (r.prevHash !== prev || r.hash !== h) return { intact: false, brokenAt: r.seq, checked: rows.length };
      prev = r.hash;
    }
    return { intact: true, brokenAt: null, checked: rows.length };
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}

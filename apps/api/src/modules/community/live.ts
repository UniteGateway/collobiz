/**
 * Live updates (tested in test/live.e2e.ts). A database trigger announces every new notification on the 'collabiz_live'
 * channel; this service LISTENs once and pushes it to that user's open browser tabs over server-sent events, and to their
 * phones through Expo push when a push provider is configured. Every 30 seconds connected users also receive the number
 * of members online. Browsers fall back to their normal refresh if the stream drops.
 */
import { Controller, Get, HttpCode, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit, Post, Body, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Client } from 'pg';
import { Subject } from 'rxjs';
import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ONLINE_WINDOW_SECONDS } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { pushTokens, userPresence } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { config } from '../../config';

interface LiveEvent { type: 'notification' | 'presence' | 'ping'; data: unknown }

@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Live');
  private client: Client | null = null;
  private subs = new Map<string, Set<Subject<LiveEvent>>>();
  private timer: NodeJS.Timeout | null = null;
  constructor(@InjectDb() private db: Db) {}

  async onModuleInit() {
    try {
      this.client = new Client({ connectionString: config().DATABASE_URL });
      await this.client.connect();
      this.client.on('notification', (m) => { if (m.channel === 'collabiz_live' && m.payload) this.onNotification(m.payload).catch((e) => this.log.warn(String(e))); });
      this.client.on('error', (e) => this.log.warn(`listen connection: ${e.message}`));
      await this.client.query('LISTEN collabiz_live');
    } catch (e) { this.log.warn(`Live updates unavailable: ${(e as Error).message}`); this.client = null; }
    this.timer = setInterval(() => this.broadcastPresence().catch(() => undefined), 30_000);
    this.timer.unref?.();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    for (const set of this.subs.values()) for (const s of set) s.complete();
    this.subs.clear();
    await this.client?.end().catch(() => undefined);
  }

  connect(userId: string) {
    const s = new Subject<LiveEvent>();
    if (!this.subs.has(userId)) this.subs.set(userId, new Set());
    this.subs.get(userId)!.add(s);
    return { stream: s, close: () => { const set = this.subs.get(userId); set?.delete(s); if (set && !set.size) this.subs.delete(userId); } };
  }
  connections() { let n = 0; for (const s of this.subs.values()) n += s.size; return n; }

  private async onNotification(payload: string) {
    const n = JSON.parse(payload) as { u: string; k: string; t: string; l: string | null; id: string };
    for (const s of this.subs.get(n.u) ?? []) s.next({ type: 'notification', data: { id: n.id, kind: n.k, title: n.t, link: n.l } });
    await this.push(n.u, n.t, n.l);
  }
  private async broadcastPresence() {
    if (!this.subs.size) return;
    const [r] = await this.db.select({ n: sql<number>`count(*)::int` }).from(userPresence).where(and(gt(userPresence.lastSeenAt, new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000)), eq(userPresence.visible, true)));
    for (const set of this.subs.values()) for (const s of set) s.next({ type: 'presence', data: { online: r.n } });
  }
  /** Expo push, only when configured. Failures never affect the notification itself. */
  private async push(userId: string, title: string, link: string | null) {
    if (config().PUSH_PROVIDER !== 'expo') return;
    const tokens = await this.db.select({ token: pushTokens.token }).from(pushTokens).where(eq(pushTokens.userId, userId));
    if (!tokens.length) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const token = config().EXPO_ACCESS_TOKEN; if (token) headers.Authorization = `Bearer ${token}`;
    await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers, body: JSON.stringify(tokens.map((t) => ({ to: t.token, title: 'COLLABIZ', body: title, data: { link } }))) }).catch((e) => this.log.warn(`push failed: ${(e as Error).message}`));
  }
}

const TokenSchema = z.object({ token: z.string().regex(/^ExponentPushToken\[[A-Za-z0-9_-]{10,}\]$/, 'Not an Expo push token'), platform: z.enum(['ios', 'android']) });

@ApiTags('live')
@Controller()
export class LiveController {
  constructor(private live: LiveService, @InjectDb() private db: Db) {}

  /**
   * Server-sent events for the signed-in user: notifications as they happen, members-online counts and keep-alive pings.
   * Written straight to the response (the API and Nest resolve different rxjs copies, which breaks Nest's @Sse helper).
   */
  @Get('live')
  stream(@Ctx() ctx: RequestContext, @Req() req: Request, @Res() res: Response) {
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    let id = 0;
    const send = (e: LiveEvent) => { res.write(`event: ${e.type}\nid: ${++id}\ndata: ${JSON.stringify(e.data)}\n\n`); };
    res.write('retry: 5000\n\n');
    send({ type: 'ping', data: { ready: true } });
    const { stream, close } = this.live.connect(ctx.userId);
    const sub = stream.subscribe(send);
    const keepAlive = setInterval(() => send({ type: 'ping', data: {} }), 25_000);
    req.on('close', () => { clearInterval(keepAlive); sub.unsubscribe(); close(); res.end(); });
  }

  @Post('me/push-token')
  @HttpCode(200)
  async register(@Ctx() ctx: RequestContext, @Body(body(TokenSchema)) b: z.infer<typeof TokenSchema>) {
    await this.db.insert(pushTokens).values({ token: b.token, userId: ctx.userId, platform: b.platform }).onConflictDoUpdate({ target: pushTokens.token, set: { userId: ctx.userId, platform: b.platform, updatedAt: new Date() } });
    return { ok: true, delivery: config().PUSH_PROVIDER === 'expo' ? 'enabled' : 'not_configured' };
  }
  @Post('me/push-token/remove')
  @HttpCode(200)
  async remove(@Ctx() ctx: RequestContext, @Body(body(z.object({ token: z.string() }))) b: { token: string }) {
    await this.db.delete(pushTokens).where(and(eq(pushTokens.token, b.token), eq(pushTokens.userId, ctx.userId)));
    return { ok: true };
  }
  @Get('me/live/status')
  status() { return { connections: this.live.connections(), push: config().PUSH_PROVIDER }; }
}

@Module({ controllers: [LiveController], providers: [LiveService] })
export class LiveModule {}

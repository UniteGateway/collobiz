/** Live updates: a new notification reaches the user's open stream within a second; other users never see it; push tokens. */
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Live updates', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool; let base: string;
  beforeAll(async () => {
    await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await new Promise<void>((r) => app.getHttpServer().listen(0, r));
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/v1`;
  });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  /** Opens the stream and collects events until `until` matches or the time runs out. */
  async function listen(token: string, until: (e: { type: string; data: any }) => boolean, ms = 4000) {
    const ctl = new AbortController();
    const res = await fetch(`${base}/live`, { headers: { ...auth(token), Accept: 'text/event-stream' }, signal: ctl.signal });
    const events: { type: string; data: any }[] = [];
    const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = '';
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const type = /event: (.*)/.exec(chunk)?.[1] ?? 'message'; const data = /data: (.*)/.exec(chunk)?.[1];
          const e = { type, data: data ? JSON.parse(data) : null }; events.push(e);
          if (until(e)) { ctl.abort(); return events; }
          if (e.type === 'ping' && e.data?.ready) listen.ready?.();
        }
      }
    } catch { /* aborted */ } finally { clearTimeout(timer); }
    return events;
  }
  listen.ready = undefined as undefined | (() => void);

  it('delivers a new notification to the right user only, immediately', async () => {
    const asha = (await pool.query("select id from users where email = 'asha@voltepc.example'")).rows[0].id;
    const ready = new Promise<void>((r) => { listen.ready = r; });
    const ashaStream = listen(t.asha, (e) => e.type === 'notification');
    const meeraStream = listen(t.meera, () => false, 2500);
    await ready;
    await new Promise((r) => setTimeout(r, 200));
    const t0 = Date.now();
    await pool.query("insert into notifications (user_id, kind, title, link) values ($1, 'message', 'New message from Meera Iyer', '/chat/x')", [asha]);
    const got = await ashaStream;
    const n = got.find((e) => e.type === 'notification');
    expect(n?.data).toMatchObject({ kind: 'message', title: 'New message from Meera Iyer', link: '/chat/x' });
    expect(Date.now() - t0).toBeLessThan(1500);
    expect((await meeraStream).some((e) => e.type === 'notification')).toBe(false);
  });

  it('requires sign-in; push tokens are validated and stored, delivery off until configured', async () => {
    const r = await fetch(`${base}/live`); expect(r.status).toBe(401);
    await api(app).post('/v1/me/push-token').set(auth(t.asha)).send({ token: 'not-a-token', platform: 'ios' }).expect(400);
    expect((await api(app).post('/v1/me/push-token').set(auth(t.asha)).send({ token: 'ExponentPushToken[abcdefghijklmnop]', platform: 'android' }).expect(200)).body).toEqual({ ok: true, delivery: 'not_configured' });
    await api(app).post('/v1/me/push-token/remove').set(auth(t.asha)).send({ token: 'ExponentPushToken[abcdefghijklmnop]' }).expect(200);
  });
});

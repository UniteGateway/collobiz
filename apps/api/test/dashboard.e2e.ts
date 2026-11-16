/** Partner dashboard feed: domain theme, six-month trends, news, and admin-managed ads and videos (with house fallbacks). */
import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Dashboard feed', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(async () => { await app?.close(); });
  const form = (tok: string, path: string, f: Record<string, string>) => { const r = api(app).post(path).set(auth(tok)); for (const [k, v] of Object.entries(f)) r.field(k, v); return r; };

  it('themes by business domain, shows six months of trends and news, and falls back to Unite programmes in the ad slot', async () => {
    const f = (await api(app).get('/v1/me/home/feed').set(auth(t.asha)).expect(200)).body;
    expect(['energy', 'build', 'trade', 'industry', 'advisory', 'collabiz']).toContain(f.theme);
    expect(f.trend.months).toHaveLength(6);
    expect(f.trend.earnings).toHaveLength(6);
    expect(f.ads.length).toBeGreaterThan(0);
    expect(f.ads.every((a: { house: boolean; url: string }) => a.house && a.url.startsWith('/'))).toBe(true);
    expect(f.videos).toEqual([]);
    expect(Array.isArray(f.news)).toBe(true);
    await api(app).get('/v1/me/home/feed').expect(401);
  });

  it('admins book ads (optionally for one domain, within dates) and add YouTube/Vimeo videos; partners cannot', async () => {
    await form(t.asha, '/v1/admin/dashboard-content', { kind: 'ad', title: 'Mine', url: '/x' }).expect(403);
    await form(t.uniteAdmin, '/v1/admin/dashboard-content', { kind: 'video', title: 'Bad video', url: 'https://example.com/v.mp4' }).expect(400);
    await form(t.uniteAdmin, '/v1/admin/dashboard-content', { kind: 'ad', title: 'Past campaign', url: '/powertek', endsOn: '2020-01-31' }).expect(201);
    const theme = (await api(app).get('/v1/me/home/feed').set(auth(t.asha))).body.theme;
    const other = theme === 'trade' ? 'energy' : 'trade';
    await form(t.uniteAdmin, '/v1/admin/dashboard-content', { kind: 'ad', title: 'Other-domain offer', url: '/marketplace', theme: other }).expect(201);
    const ad = (await form(t.uniteAdmin, '/v1/admin/dashboard-content', { kind: 'ad', title: 'Powertek festive offer', body: 'Free site survey on orders above ₹5 lakh.', url: '/powertek', ctaLabel: 'Shop now', sortOrder: '1' }).expect(201)).body;
    const v = (await form(t.uniteAdmin, '/v1/admin/dashboard-content', { kind: 'video', title: 'How COLLABIZ works', url: 'https://youtu.be/dQw4w9WgXcQ' }).expect(201)).body;
    expect(v.embed).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    const f = (await api(app).get('/v1/me/home/feed').set(auth(t.asha)).expect(200)).body;
    expect(f.ads.map((a: { title: string }) => a.title)).toEqual(['Powertek festive offer']); // no past or other-domain ads, no house ads
    expect(f.videos[0]).toMatchObject({ title: 'How COLLABIZ works', embed: v.embed });
    await api(app).post(`/v1/me/home/content/${ad.id}/click`).set(auth(t.asha)).expect(200);
    expect((await api(app).get('/v1/admin/dashboard-content').set(auth(t.uniteAdmin)).expect(200)).body.find((c: { id: string }) => c.id === ad.id).clicks).toBe(1);
    await api(app).post(`/v1/admin/dashboard-content/${ad.id}/active`).set(auth(t.uniteAdmin)).send({ active: false }).expect(200);
    expect((await api(app).get('/v1/me/home/feed').set(auth(t.asha))).body.ads.every((a: { house?: boolean }) => a.house)).toBe(true);
  });
});

/** Home extras: live business news (parsing, de-duplication, failure reporting, caching) and the energy desk. */
import type { INestApplication } from '@nestjs/common';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { BusinessNewsService, parseFeed } from '../src/modules/home/business-news';

const RSS = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
const item = (title: string, link: string, date: string) => `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate><description>Body text that must not be copied</description></item>`;

describe('Home: business news and energy desk', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); });
  afterAll(async () => { await app?.close(); });

  it('parses RSS headlines only, keeps https links, drops unsafe ones', () => {
    const x = parseFeed(RSS(item('Solar tariffs fall to &amp; record low', 'https://example.com/a', 'Mon, 16 Nov 2026 08:00:00 GMT') + item('Bad link', 'javascript:alert(1)', 'Mon, 16 Nov 2026 07:00:00 GMT')), 'Example');
    expect(x).toEqual([{ title: 'Solar tariffs fall to & record low', link: 'https://example.com/a', source: 'Example', publishedAt: '2026-11-16T08:00:00.000Z' }]);
    expect(JSON.stringify(x)).not.toMatch(/Body text/);
  });

  it('merges feeds newest first, removes duplicates, reports unreachable feeds and caches', async () => {
    process.env.NEWS_FEEDS = 'Feed A|https://a.example/rss,Feed B|https://b.example/rss,Feed C|https://c.example/rss';
    const svc = new BusinessNewsService();
    let calls = 0;
    const fake = (async (url: string) => {
      calls++;
      if (url.includes('c.example')) throw new Error('getaddrinfo ENOTFOUND');
      const body = url.includes('a.example')
        ? RSS(item('Rupee steady as markets open', 'https://a.example/1', 'Tue, 17 Nov 2026 05:00:00 GMT') + item('Same story', 'https://a.example/2', 'Mon, 16 Nov 2026 05:00:00 GMT'))
        : RSS(item('Same story', 'https://b.example/9', 'Mon, 16 Nov 2026 05:00:00 GMT') + item('EV sales climb', 'https://b.example/3', 'Tue, 17 Nov 2026 06:00:00 GMT'));
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await svc.latest(fake);
    expect(r.items.map((i) => i.title)).toEqual(['EV sales climb', 'Rupee steady as markets open', 'Same story']);
    expect(r.live).toBe(true);
    expect(r.feeds.find((f) => f.label === 'Feed C')).toMatchObject({ ok: false, error: 'Not reachable from this server' });
    await svc.latest(fake);
    expect(calls).toBe(3); // cached for 15 minutes
    process.env.NEWS_FEEDS = 'off';
    const none = new BusinessNewsService();
    expect(await none.latest(fake)).toMatchObject({ items: [], live: false });
    delete process.env.NEWS_FEEDS;
  });

  it('news endpoint needs sign-in; energy desk returns six months and only own records', async () => {
    await api(app).get('/v1/me/home/business-news').expect(401);
    const e = (await api(app).get('/v1/me/home/energy').set(auth(t.asha)).expect(200)).body;
    expect(e.months).toHaveLength(6);
    expect(e.quotes).toHaveLength(6); expect(e.kw).toHaveLength(6);
    expect(e).toHaveProperty('opportunities.latest'); expect(e).toHaveProperty('tenders.open');
    const other = (await api(app).get('/v1/me/home/energy').set(auth(t.deepak)).expect(200)).body;
    expect(other.totals.quotes).toBe(0); // Deccan has no solar quotes of its own
  });
});

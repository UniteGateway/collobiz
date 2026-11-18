/**
 * Live business news for the Home page (tested in test/dashboard.e2e.ts with a stubbed feed).
 *
 * Reads public RSS feeds listed in NEWS_FEEDS ("Label|https://…", comma-separated) server-side, keeps headline, link,
 * source and time only (no article text is copied), caches for 15 minutes and serves the newest items. When a feed
 * cannot be reached the response says so — nothing is invented. Admin-published news on COLLABIZ is shown alongside.
 */
import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';

export interface NewsItem { title: string; link: string; source: string; publishedAt: string | null }
export interface FeedStatus { label: string; ok: boolean; items: number; error?: string }

export const DEFAULT_FEEDS = [
  'Economic Times — Markets|https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
  'Economic Times — Industry|https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms',
  'Economic Times — Energy|https://economictimes.indiatimes.com/industry/energy/rssfeeds/13358350.cms',
  'Business Standard — Latest|https://www.business-standard.com/rss/latest.rss',
];
const TTL = 15 * 60_000;
const clean = (s: unknown) => String(s ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

export function parseFeed(xml: string, source: string): NewsItem[] {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml);
  const raw = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((i: Record<string, unknown>) => {
    const link = typeof i.link === 'string' ? i.link : (i.link as { '@href'?: string } | undefined)?.['@href'] ?? '';
    const date = clean(i.pubDate ?? i.published ?? i.updated);
    const t = date ? new Date(date) : null;
    return { title: clean(i.title).slice(0, 220), link: String(link).trim(), source, publishedAt: t && !Number.isNaN(t.getTime()) ? t.toISOString() : null };
  }).filter((i) => i.title && /^https:\/\//.test(i.link));
}

@Injectable()
export class BusinessNewsService {
  private log = new Logger('BusinessNews');
  private cache: { at: number; items: NewsItem[]; feeds: FeedStatus[] } | null = null;
  private pending: Promise<{ items: NewsItem[]; feeds: FeedStatus[] }> | null = null;

  feeds() {
    const env = process.env.NEWS_FEEDS;
    if (env === 'off') return [];
    return (env ? env.split(',') : DEFAULT_FEEDS).map((x) => { const [label, url] = x.includes('|') ? x.split('|') : [new URL(x).hostname, x]; return { label: label.trim(), url: url.trim() }; }).filter((f) => /^https:\/\//.test(f.url));
  }

  async latest(fetcher: typeof fetch = fetch): Promise<{ items: NewsItem[]; feeds: FeedStatus[]; fetchedAt: string | null; live: boolean }> {
    if (!this.cache || Date.now() - this.cache.at > TTL) {
      this.pending ??= this.load(fetcher).finally(() => { this.pending = null; });
      const r = await this.pending;
      this.cache = { at: Date.now(), ...r };
    }
    const c = this.cache;
    return { items: c.items, feeds: c.feeds, fetchedAt: new Date(c.at).toISOString(), live: c.feeds.some((f) => f.ok) };
  }
  reset() { this.cache = null; }

  private async load(fetcher: typeof fetch) {
    const feeds = this.feeds();
    const results = await Promise.all(feeds.map(async (f): Promise<{ status: FeedStatus; items: NewsItem[] }> => {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
        const res = await fetcher(f.url, { signal: ctl.signal, headers: { 'user-agent': 'COLLABIZ news reader', accept: 'application/rss+xml, application/xml, text/xml' } }).finally(() => clearTimeout(t));
        if (!res.ok) return { status: { label: f.label, ok: false, items: 0, error: `HTTP ${res.status}` }, items: [] };
        const items = parseFeed(await res.text(), f.label).slice(0, 15);
        return { status: { label: f.label, ok: true, items: items.length }, items };
      } catch (e) {
        this.log.warn(`feed ${f.label} unavailable: ${(e as Error).message}`);
        return { status: { label: f.label, ok: false, items: 0, error: 'Not reachable from this server' }, items: [] };
      }
    }));
    const seen = new Set<string>();
    const items = results.flatMap((r) => r.items).filter((i) => { const k = i.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0, 30);
    return { items, feeds: results.map((r) => r.status) };
  }
}

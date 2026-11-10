/**
 * Offline outbox for site updates. When a site update cannot be sent (no signal on site), it is saved on the phone with its
 * photos and sent automatically when the connection returns. The server's own validation still applies: an update it
 * rejects is kept and marked for the person to fix, never retried in a loop or silently dropped.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@collabiz/types';

export type OutboxPhoto = { uri: string; name: string; type: string };
export interface SiteUpdateItem { id: string; kind: 'site_update'; projectId: string; projectLabel?: string; note: string; milestoneId?: string | null; progressPct?: string; photos: OutboxPhoto[]; createdAt: string; attempts: number; error?: string | null }
export interface OutboxStore { read(): Promise<string | null>; write(s: string): Promise<void>; keepPhoto(p: OutboxPhoto): Promise<OutboxPhoto>; dropPhoto(p: OutboxPhoto): void }
export type Sender = (item: SiteUpdateItem) => Promise<void>;

/** Network failures (no response) are retried; responses with an error status are not. */
export const isOffline = (e: unknown) => !(e instanceof ApiError) || e.status === 0 || e.status >= 500;

export class Outbox {
  constructor(private store: OutboxStore) {}
  async list(): Promise<SiteUpdateItem[]> {
    try { const s = await this.store.read(); return s ? (JSON.parse(s) as SiteUpdateItem[]) : []; } catch { return []; }
  }
  private save(items: SiteUpdateItem[]) { return this.store.write(JSON.stringify(items)); }
  async add(item: Omit<SiteUpdateItem, 'id' | 'createdAt' | 'attempts' | 'kind'>) {
    const photos = await Promise.all(item.photos.map((p) => this.store.keepPhoto(p)));
    const full: SiteUpdateItem = { ...item, photos, kind: 'site_update', id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), attempts: 0, error: null };
    await this.save([...(await this.list()), full]);
    return full;
  }
  async remove(id: string) {
    const items = await this.list();
    items.filter((i) => i.id === id).forEach((i) => i.photos.forEach((p) => this.store.dropPhoto(p)));
    await this.save(items.filter((i) => i.id !== id));
  }
  /** Sends in order. Stops at the first network failure (still offline); a rejected item is marked and skipped. */
  async flush(send: Sender) {
    const items = await this.list();
    let sent = 0;
    for (const it of items) {
      if (it.error) continue; // needs the person's attention
      try {
        await send(it);
        await this.remove(it.id);
        sent++;
      } catch (e) {
        const now = await this.list();
        const i = now.find((x) => x.id === it.id);
        if (i) { i.attempts++; if (!isOffline(e)) i.error = e instanceof Error ? e.message : 'Rejected'; await this.save(now); }
        if (isOffline(e)) break;
      }
    }
    return { sent, left: (await this.list()).length };
  }
}

/** Real storage in the app's documents folder (not the cache, which the system may clear). */
export function fileStore(): OutboxStore {
  // Loaded lazily so tests and web builds do not need the native module.
  const { File, Directory, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const dir = new Directory(Paths.document, 'outbox');
  const file = new File(Paths.document, 'outbox.json');
  return {
    read: async () => (file.exists ? file.text() : null),
    write: async (s) => { if (!file.exists) file.create(); await file.write(s); },
    keepPhoto: async (p) => {
      if (!dir.exists) dir.create({ intermediates: true });
      const dest = new File(dir, `${Date.now()}-${p.name.replace(/[^\w.-]/g, '_')}`);
      await new File(p.uri).copy(dest);
      return { ...p, uri: dest.uri };
    },
    dropPhoto: (p) => { try { const f = new File(p.uri); if (f.exists) f.delete(); } catch { /* already gone */ } },
  };
}

let shared: Outbox | null = null;
export const outbox = () => {
  if (!shared) {
    let store: OutboxStore;
    try { store = fileStore(); } catch { store = memoryStore(); } // no native file system (web preview, tests)
    shared = new Outbox(store);
  }
  return shared;
};
/** Replaces the shared outbox (tests use an in-memory store). */
export const setOutbox = (b: Outbox) => { shared = b; };
/** In-memory store: used by tests and as a fallback where no file system is available. */
export function memoryStore(): OutboxStore { let v: string | null = null; return { read: async () => v, write: async (s) => { v = s; }, keepPhoto: async (p) => p, dropPhoto: () => undefined }; }

/** Pending items, a manual "send now", and an automatic send when the phone comes back online. */
export function useOutbox(send: Sender, box: Outbox = outbox()) {
  const [items, setItems] = useState<SiteUpdateItem[]>([]);
  const [busy, setBusy] = useState(false);
  const sendRef = useRef(send);
  sendRef.current = send; // the latest sender, without re-subscribing on every render
  const refresh = useCallback(async () => setItems(await box.list()), [box]);
  const flush = useCallback(async () => { setBusy(true); try { return await box.flush((it) => sendRef.current(it)); } finally { setBusy(false); await refresh(); } }, [box, refresh]);
  useEffect(() => {
    refresh();
    let sub: { remove(): void } | undefined;
    try {
      const Network = require('expo-network') as typeof import('expo-network');
      sub = Network.addNetworkStateListener((s) => { if (s.isConnected && s.isInternetReachable !== false) flush(); });
    } catch { /* no native network module (tests, web) */ }
    return () => { if (typeof sub?.remove === 'function') sub.remove(); };
  }, [refresh, flush]);
  return { items, busy, flush, refresh, remove: async (id: string) => { await box.remove(id); await refresh(); } };
}

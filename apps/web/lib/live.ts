'use client';
/** Live updates from the API (server-sent events), shared by every screen through one connection in the app shell. */
import { useEffect, useRef } from 'react';

export interface LiveEvent { type: 'notification' | 'presence' | 'ping'; data: any } // eslint-disable-line @typescript-eslint/no-explicit-any
const EVENT = 'cz:live';

/** Opened once by the partner shell. The browser reconnects by itself; screens keep their own refresh as a fallback. */
export function openLiveStream() {
  if (typeof window === 'undefined' || !('EventSource' in window)) return () => undefined;
  const es = new EventSource('/api/v1/live', { withCredentials: true });
  const relay = (type: LiveEvent['type']) => (m: MessageEvent) => { try { window.dispatchEvent(new CustomEvent<LiveEvent>(EVENT, { detail: { type, data: JSON.parse(m.data) } })); } catch { /* ignore malformed */ } };
  es.addEventListener('notification', relay('notification') as EventListener);
  es.addEventListener('presence', relay('presence') as EventListener);
  return () => es.close();
}

/** Runs `handler` for every live event while the component is mounted. */
export function useLive(handler: (e: LiveEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e: Event) => ref.current((e as CustomEvent<LiveEvent>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
}

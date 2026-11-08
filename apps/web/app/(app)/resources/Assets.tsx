'use client';
import Link from 'next/link';
import { useState } from 'react';
import { sectorName } from '@collabiz/types';
import { Button, EmptyState, Icon, Skeleton } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

export interface Asset { id: string; kind: string; title: string; body: string | null; sector: string | null; channel: string | null; locked: boolean; minLevelName: string }
const CHANNEL: Record<string, string> = { linkedin: 'LinkedIn', whatsapp: 'WhatsApp', email: 'Email' };

/** Shared list for screens 113 and 115: approved copy you can use as-is; higher-level items show what unlocks them. */
export function AssetList({ kinds }: { kinds: string[] }) {
  const q = useQuery<Asset[]>('/marketing/assets');
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (a: Asset) => {
    try { await navigator.clipboard.writeText(a.body ?? ''); } catch { /* clipboard unavailable */ }
    await api.post(`/marketing/assets/${a.id}/use`, { kind: 'copy' }).catch(() => {});
    setCopied(a.id); setTimeout(() => setCopied(null), 2000);
  };
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Skeleton height={220} />;
  const list = q.data.filter((a) => kinds.includes(a.kind));
  if (!list.length) return <div className="cz-card"><EmptyState icon="documents" title="Nothing here yet">Unite Group adds approved material regularly.</EmptyState></div>;
  return (
    <ul className="cz-asset-grid">
      {list.map((a) => (
        <li key={a.id} className="cz-card cz-asset" data-locked={a.locked || undefined}>
          <div className="cz-asset-top">
            <span className="cz-route cz-route-unite">{a.channel ? CHANNEL[a.channel] ?? a.channel : a.kind === 'guide' ? 'Guideline' : 'Brochure copy'}</span>
            {a.sector && <span className="cz-muted" style={{ fontSize: 12 }}>{sectorName(a.sector)}</span>}
          </div>
          <strong>{a.title}</strong>
          {a.locked ? (
            <p className="cz-asset-locked"><Icon name="lock" size={14} />Available to {a.minLevelName}s and above. <Link href="/reputation/excellence">See how to get there</Link></p>
          ) : <p className="cz-asset-body">{a.body}</p>}
          {!a.locked && (
            <div className="cz-row" style={{ gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => copy(a)}><Icon name={copied === a.id ? 'check' : 'documents'} size={14} />{copied === a.id ? 'Copied' : 'Copy text'}</Button>
              {a.kind === 'brochure' && <Link href={`/resources/brochure?asset=${a.id}`} className="cz-btn cz-btn-ghost cz-btn-sm">Use in my brochure</Link>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

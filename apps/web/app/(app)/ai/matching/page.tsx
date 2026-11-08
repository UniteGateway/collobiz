'use client';
import Link from 'next/link';
import { useState } from 'react';
import { sectorName } from '@collabiz/types';
import { Button, EmptyState, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { MatchFactors, inr } from '@/components/Growth';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Item { opportunity: { id: string; code: string; title: string; sector: string; city: string | null; estimatedValue: number | null; deadline: string | null; publisher: string }; match: { score: number; factors: { factor: string; weight: number; score: number; detail: string }[]; uncertainty?: string[] } }

/** Screen 160 — AI opportunity matching: every match shows why, and what the assistant is unsure about. */
export default function AiMatching() {
  const q = useQuery<{ consent: boolean; items: Item[]; provider: string; promptVersion: string }>('/ai/matching');
  const [hidden, setHidden] = useState<string[]>([]);
  const dismiss = async (id: string) => { setHidden([...hidden, id]); await api.post(`/ai/matching/${id}/feedback`, { useful: false, reason: 'Not relevant' }).catch(() => {}); };
  const items = (q.data?.items ?? []).filter((i) => !hidden.includes(i.opportunity.id));
  return (
    <Screen id="160" title="AI matches" description="Opportunities ranked against your sectors, coverage, capacity and certifications. Every score shows its reasons; nothing is applied for on your behalf.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={260} /> : !q.data.consent ? (
        <div className="cz-card"><EmptyState icon="search" title="Matching is switched off for your company" action={<Link className="cz-btn cz-btn-secondary" href="/profile">Open profile settings</Link>}>Turn on “Allow matching” in your partner profile to receive explainable recommendations.</EmptyState></div>
      ) : !items.length ? <div className="cz-card"><EmptyState icon="search" title="No strong matches right now">We’ll show new opportunities here as they’re published.</EmptyState></div> : (
        <>
          <ul className="cz-ai-list">
            {items.map(({ opportunity: o, match: m }) => (
              <li key={o.id} className="cz-card cz-ai-item" data-opp={o.code}>
                <div className="cz-match" aria-label={`Match ${m.score} out of 100`}><strong>{m.score}</strong><span>match</span></div>
                <div className="cz-ai-main">
                  <Link href={`/opportunities/${o.id}`} className="cz-ai-title">{o.title}</Link>
                  <span className="cz-muted" style={{ fontSize: 13 }}>{sectorName(o.sector)}{o.city ? ` · ${o.city}` : ''} · {o.publisher}{o.estimatedValue ? ` · ${inr(o.estimatedValue)}` : ''}</span>
                  <MatchFactors factors={m.factors} />
                  {m.uncertainty && m.uncertainty.length > 0 && <p className="cz-ai-unsure"><Icon name="info" size={13} />Not sure about: {m.uncertainty.join('; ')}</p>}
                </div>
                <div className="cz-ai-side"><Link href={`/opportunities/${o.id}`} className="cz-btn cz-btn-secondary cz-btn-sm">View</Link><Button size="sm" variant="ghost" onClick={() => dismiss(o.id)}>Not relevant</Button></div>
              </li>
            ))}
          </ul>
          <p className="cz-ai-prov"><Icon name="info" size={13} />Ranked by the {q.data.provider === 'rules' ? 'COLLABIZ rules engine' : q.data.provider} · version {q.data.promptVersion}. “Not relevant” hides an item and is logged for review.</p>
        </>
      )}
    </Screen>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { REFERRAL_STATUS_LABELS, SOLAR_SEGMENT_LABELS } from '@collabiz/types';
import { Button, Card, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { SolarNav, rupees } from '@/components/Solar';
import { useQuery } from '@/lib/hooks';

interface R { code: string; referrals: { id: string; name: string; phone: string; city: string; segment: string; status: string; reward: number | null; createdAt: string }[] }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = { new: 'info', quoted: 'info', installed: 'warning', rewarded: 'success', lost: 'neutral' };

/** Your solar referral link and the people who used it. */
export default function SolarReferrals() {
  const q = useQuery<R>('/solar/referrals');
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const link = q.data ? `${origin}/refer/${q.data.code}` : '';
  const text = `I went solar with Unite Solar. Check what solar could save you (with government subsidy for homes): ${link}`;
  return (
    <Screen page={{ key: 'solar-referrals', title: 'Solar referrals', access: 'verified-partner' }} description="Share your link with friends, neighbours and business contacts. When their solar system is installed, you earn a referral reward.">
      <SolarNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : (
        <>
          <Card title="Your referral link">
            <p className="cz-code" data-referral-code={q.data.code} style={{ margin: '0 0 12px' }}>{q.data.code}</p>
            <p style={{ margin: '0 0 12px', overflowWrap: 'anywhere' }}><a href={link}>{link}</a></p>
            <div className="cz-row" style={{ gap: 8 }}>
              <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy link'}</Button>
              <a className="cz-btn cz-btn-accent" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp</a>
            </div>
            <p className="cz-muted" style={{ marginBottom: 0, fontSize: 13 }}>Share only with people who would welcome it. People who use your link agree to be called by Unite Solar.</p>
          </Card>
          <Card title={`People you referred (${q.data.referrals.length})`}>
            {!q.data.referrals.length ? <EmptyState icon="teams" title="No referrals yet">When someone fills in the form on your link, they appear here and Unite Solar calls them.</EmptyState> : (
              <ul className="cz-ws-list">{q.data.referrals.map((r) => (
                <li key={r.id} data-referral={r.name}><span><strong>{r.name}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>{SOLAR_SEGMENT_LABELS[r.segment]} · {r.city} · {r.phone}{r.reward ? ` · reward ${rupees(r.reward)}` : ''}</span></span>
                  <StatusBadge status={r.status} tone={TONE[r.status]} label={REFERRAL_STATUS_LABELS[r.status]} /></li>
              ))}</ul>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

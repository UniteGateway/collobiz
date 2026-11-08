'use client';
import Link from 'next/link';
import { useState } from 'react';
import { SECTORS } from '@collabiz/types';
import { Alert, Button, EmptyState, Icon } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { MatchFactors } from '@/components/Growth';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { INDIA_STATES } from '@/lib/regions';

interface Res { target: { sectorName: string }; suggestions: { partnerId: string; partnerName: string; score: number; reputation: number | null; factors: { factor: string; weight: number; score: number; detail: string }[] }[]; excludedForConsent: number; provider: string; promptVersion: string }

/** Screen 161 — AI recommended partners, weighted by verified reputation. Only partners who consented to matching appear. */
export default function AiPartners() {
  const [sector, setSector] = useState('solar');
  const [region, setRegion] = useState('');
  const m = useMutation(async () => api.post<Res>('/ai/partners', { sector, region: region || undefined }));
  return (
    <Screen id="161" title="Recommended partners" description="Find verified partners for a sector and region. Each suggestion shows why it ranks where it does, including verified reputation.">
      <form className="cz-ai-query" onSubmit={(e) => { e.preventDefault(); m.run(); }}>
        <label className="cz-sched-label">Sector<select className="cz-select" value={sector} onChange={(e) => setSector(e.target.value)}>{SECTORS.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
        <label className="cz-sched-label">Region (optional)<select className="cz-select" value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Anywhere</option>{INDIA_STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <Button type="submit" loading={m.pending}><Icon name="search" size={16} />Find partners</Button>
      </form>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {m.data && (!m.data.suggestions.length ? <div className="cz-card"><EmptyState icon="users" title="No matching partners">Try another region or sector.</EmptyState></div> : (
        <>
          <ul className="cz-ai-list">
            {m.data.suggestions.map((s) => (
              <li key={s.partnerId} className="cz-card cz-ai-item">
                <div className="cz-match"><strong>{s.score}</strong><span>match</span></div>
                <div className="cz-ai-main">
                  <Link href={`/partners/${s.partnerId}`} className="cz-ai-title">{s.partnerName}</Link>
                  <span className="cz-muted" style={{ fontSize: 13 }}>{s.reputation == null ? 'Not yet rated' : `Verified reputation ${s.reputation}/100`}</span>
                  <MatchFactors factors={s.factors} />
                </div>
                <div className="cz-ai-side"><Link href={`/partners/${s.partnerId}/reputation`} className="cz-btn cz-btn-secondary cz-btn-sm">Reputation</Link><Link href="/teams/new" className="cz-btn cz-btn-ghost cz-btn-sm">Invite to a team</Link></div>
              </li>
            ))}
          </ul>
          <p className="cz-ai-prov"><Icon name="info" size={13} />{m.data.excludedForConsent ? `${m.data.excludedForConsent} partner(s) are not shown because they haven’t agreed to matching. ` : ''}Ranked by the {m.data.provider === 'rules' ? 'COLLABIZ rules engine' : m.data.provider} · version {m.data.promptVersion}. Nobody is contacted automatically.</p>
        </>
      ))}
    </Screen>
  );
}

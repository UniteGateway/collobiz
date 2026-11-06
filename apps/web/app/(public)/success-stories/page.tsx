'use client';
import { useState } from 'react';
import { SECTORS, sectorName } from '@collabiz/types';
import { EmptyState, ErrorState, Kpi, LoadingState, Select } from '@collabiz/ui';
import { PublicScreen } from '@/components/PublicScreen';
import { useQuery } from '@/lib/hooks';

/** Screen 008 — Success Stories & Case Studies (published only with partner consent). */
export default function StoriesPage() {
  const [sector, setSector] = useState('');
  const q = useQuery<any[]>('/public/success-stories', { sector });
  return (
    <PublicScreen id="008" description="Verified collaborations delivered through COLLABIZ, published with every named partner's consent.">
      <div style={{ maxWidth: 320 }}><Select label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} /></div>
      {q.loading ? <LoadingState /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="No case studies in this sector yet" /> : q.data.map((s) => (
        <article key={s.id} className="cz-card">
          <p className="cz-breadcrumb">{sectorName(s.sector)}</p>
          <h2>{s.title}</h2>
          <p><strong>{s.summary}</strong></p>
          <p>{s.body}</p>
          <div className="cz-grid cz-grid-3">{s.metrics.map((m: any) => <Kpi key={m.label} label={m.label} value={m.value} />)}</div>
        </article>
      ))}
    </PublicScreen>
  );
}

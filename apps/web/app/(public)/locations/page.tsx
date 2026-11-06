'use client';
import { DataTable, ErrorState, Grid, Kpi, LoadingState } from '@collabiz/ui';
import { PublicScreen } from '@/components/PublicScreen';
import { useQuery } from '@/lib/hooks';
import { regionName } from '@/lib/regions';

/** Screen 009 — Global Partner Locations (aggregate counts only; no partner identities). */
export default function LocationsPage() {
  const q = useQuery<{ coverage: { region: string; partners: number }[]; offices: { brandName: string; city: string | null; country: string }[]; openByRegion: { region: string; open: number }[] }>('/public/locations');
  if (q.loading) return <PublicScreen id="009"><LoadingState /></PublicScreen>;
  if (q.error) return <PublicScreen id="009"><ErrorState error={q.error} onRetry={q.reload} /></PublicScreen>;
  const d = q.data!;
  const open = Object.fromEntries(d.openByRegion.map((r) => [r.region, r.open]));
  return (
    <PublicScreen id="009" description="Where verified COLLABIZ partners deliver. Counts include only KYB-verified organizations.">
      <Grid cols={3}>
        <Kpi label="Regions covered" value={d.coverage.length} accent />
        <Kpi label="Verified partner coverage points" value={d.coverage.reduce((s, c) => s + c.partners, 0)} />
        <Kpi label="Unite Group offices" value={d.offices.length} />
      </Grid>
      <div className="cz-grid cz-grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <section className="cz-card"><h2>Partner coverage</h2>
          <DataTable caption="Partner coverage by region" rows={d.coverage.map((c) => ({ ...c, id: c.region }))} columns={[
            { key: 'region', header: 'Region', render: (c) => regionName(c.region) },
            { key: 'partners', header: 'Verified partners' },
            { key: 'open', header: 'Open public opportunities', render: (c) => open[c.region] ?? 0 },
          ]} />
        </section>
        <section className="cz-card"><h2>Unite Group offices</h2>
          <ul>{d.offices.map((o) => <li key={o.brandName}><strong>{o.brandName}</strong> — {[o.city, o.country].filter(Boolean).join(', ')}</li>)}</ul>
        </section>
      </div>
    </PublicScreen>
  );
}

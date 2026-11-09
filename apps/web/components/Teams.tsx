'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { sectorName, TEAM_ROLE_LABELS } from '@collabiz/types';
import { FactorBars, Money, StatusBadge } from '@collabiz/ui';
import { regionName } from '@/lib/regions';

export const TEAM_ROLES = ['lead', 'origination', 'execution', 'procurement', 'finance', 'management', 'specialist'];
export const teamRoleLabel = (r: string) => TEAM_ROLE_LABELS[r] ?? r;

export function TeamTabs({ id }: { id: string }) {
  const path = usePathname();
  const tabs = [['workspace', 'Workspace'], ['members', 'Members & roles'], ['invite', 'Invite'], ['nda', 'NDA'], ['sharing', 'Commercial sharing'], ['activation', 'Activation']];
  return <nav aria-label="Team sections" className="cz-tabs">{tabs.map(([p, l]) => <Link key={p} href={`/teams/${id}/${p}`} aria-current={path === `/teams/${id}/${p}` ? 'page' : undefined}>{l}</Link>)}</nav>;
}

export function PartnerCard({ p, actions }: { p: any; actions?: React.ReactNode }) {
  return (
    <section className="cz-card" data-partner={p.name}>
      <div className="cz-row" style={{ justifyContent: 'space-between' }}><Link href={`/partners/${p.id}`}><h2 style={{ margin: 0 }}>{p.name}</h2></Link><StatusBadge status={p.level} tone="brand" /></div>
      <p className="cz-muted" style={{ fontSize: 13 }}>{p.partnerTypes?.join(', ')} · {[p.city, p.country].filter(Boolean).join(', ')}</p>
      {p.headline && <p style={{ fontSize: 14 }}>{p.headline}</p>}
      <p style={{ fontSize: 13, margin: 0 }}><strong>Sectors:</strong> {p.sectors.map(sectorName).join(', ')}</p>
      <p style={{ fontSize: 13, margin: 0 }}><strong>Coverage:</strong> {p.regions.map(regionName).join(', ')}</p>
      {p.certifications?.length > 0 && <p style={{ fontSize: 13, margin: 0 }}><strong>Certifications:</strong> {p.certifications.join(', ')}</p>}
      {p.capacityMax != null && <p style={{ fontSize: 13 }}><strong>Capacity:</strong> <Money minor={p.capacityMax} /></p>}
      {actions}
    </section>
  );
}

export function MatchCard({ s, actions }: { s: any; actions?: React.ReactNode }) {
  return (
    <section className="cz-card" data-match={s.partnerName}>
      <div className="cz-row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>{s.partnerName}</h2><strong>{s.score}/100</strong></div>
      <StatusBadge status={s.confidence} tone={s.confidence === 'high' ? 'success' : s.confidence === 'medium' ? 'warning' : 'neutral'} label={`${s.confidence} confidence`} />
      <div style={{ marginTop: 8 }}><FactorBars factors={s.factors} /></div>
      {s.uncertainty.length > 0 && <p className="cz-muted" style={{ fontSize: 12 }}>Uncertainty: {s.uncertainty.join('; ')}</p>}
      <p className="cz-muted" style={{ fontSize: 12 }}>{s.disclaimer}</p>
      {actions}
    </section>
  );
}

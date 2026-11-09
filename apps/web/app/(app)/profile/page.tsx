'use client';
import { certLabel, levelLabel, PARTNER_TYPE_LABELS, sectorName } from '@collabiz/types';
import { ButtonLink, Card, DescriptionList, Grid, Kpi, LoadingState, Money, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';
import { regionName } from '@/lib/regions';
import { DOC_LABEL } from '@/lib/labels';

/** Screen 143 — My Partner Profile (atlas: mobile-first). */
export default function MyProfilePage() {
  const q = useQuery<any>('/profile');
  if (q.loading) return <Screen id="143"><LoadingState /></Screen>;
  if (q.error) return <Screen id="143"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const { organization: o, profile: p, bankTax: b, documents, agreements } = q.data;
  return (
    <Screen id="143" title={o.displayName} actions={<ButtonLink href="/onboarding/profile" variant="secondary">Edit profile</ButtonLink>}>
      <Grid cols={4}>
        <Kpi label="Verification" value={<StatusBadge status={o.verificationStatus} />} />
        <Kpi label="Membership level" value={levelLabel(o.membershipLevel)} accent />
        <Kpi label="Sectors" value={p.sectors.length} />
        <Kpi label="Capacity" value={<Money minor={p.capacityMax} />} />
      </Grid>
      <div className="cz-grid cz-grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <Card title="Business profile">
          {p.headline && <p><strong>{p.headline}</strong></p>}
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.about ?? 'No description yet.'}</p>
          <DescriptionList items={[
            ['Legal name', o.legalName], ['Location', [o.city, o.country && o.country !== 'IN' ? regionName(o.country) : 'India'].filter(Boolean).join(', ')], ['Business types', o.partnerTypes.map((t: string) => PARTNER_TYPE_LABELS[t] ?? t).join(', ')],
            ['Sectors', p.sectors.map(sectorName).join(', ') || '—'], ['Skills', p.skills.join(', ') || '—'], ['Certifications', p.certifications.map(certLabel).join(', ') || '—'],
            ['Coverage', p.regions.map(regionName).join(', ') || '—'], ['Services', p.services.join(', ') || '—'], ['AI matching consent', p.consentToMatch ? 'Granted' : 'Withdrawn'],
          ]} />
        </Card>
        <div className="cz-stack">
          <Card title="Bank & tax">{b ? <DescriptionList items={[['Account', `${b.bankName} ${b.accountMasked}`], ['PAN', b.panMasked], ['GST', b.gstRegistered ? b.gstin : 'Not registered'], ['Status', <StatusBadge key="s" status={b.verified ? 'verified' : 'pending'} />]]} /> : <p className="cz-muted">Not provided. <a href="/onboarding/bank-tax">Add details</a></p>}</Card>
          <Card title="Documents">{documents.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{documents.map((d: any) => <li key={d.id}>{DOC_LABEL[d.docType] ?? d.docType} — <StatusBadge status={d.status} /></li>)}</ul> : <p className="cz-muted">None uploaded.</p>}</Card>
          <Card title="Agreements">{agreements.map((a: any) => <div key={a.code}>{a.title} v{a.version}: <StatusBadge status={a.accepted ? 'signed' : 'pending'} /></div>)}</Card>
          {p.pastProjects.length > 0 && <Card title="Past projects">{p.pastProjects.map((x: any, i: number) => <div key={i}>{x.name} ({x.year}){x.value ? <> · <Money minor={x.value} /></> : null}</div>)}</Card>}
        </div>
      </div>
    </Screen>
  );
}

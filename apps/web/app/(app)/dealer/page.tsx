'use client';
import Link from 'next/link';
import { useState } from 'react';
import { channelRoleLabel, type ChannelMatch } from '@collabiz/types';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, StatusBadge, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Channel { slug: string; name: string; roleLabel: string; territory: string | null; won: number; pipeline: { stage: string; count: number; value: number }[]; recent: { id: string; title: string; customer: string; stage: string; value: number | null }[] }
interface AppRow { id: string; code: string; productName: string; roleLabel: string; status: string; statusLabel: string; createdAt: string; approvedTerritory: string | null; decisionNote: string | null }
interface Dash { channels: Channel[]; applications: AppRow[]; recommendations: ChannelMatch[] }
const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
const STAGE: Record<string, string> = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Quotation', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };

/** Dealer dashboard — sales CRM for each Unite product the business is approved to sell. */
export default function Dealer() {
  const q = useQuery<Dash>('/brand-products/dashboard');
  const [lead, setLead] = useState<Channel | null>(null);
  const d = q.data;
  return (
    <Screen page={{ key: 'dealer', title: 'Dealer dashboard', access: 'partner' }} eyebrow="UNITE BRAND PRODUCTS"
      description="Your Unite products, territory and sales pipeline. Leads you add are ordinary COLLABIZ CRM deals tagged with the product — only your business sees them.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          {!d.channels.length && <Card><EmptyState icon="briefcase" title="No approved products yet">Apply to sell Unite Cement, Steel, Ply, Carpets or Furniture. Applications made with your email appear here automatically. <Link href="/partner-with-unite">Apply now</Link></EmptyState></Card>}
          {d.channels.map((c) => (
            <Card key={c.slug}>
              <div data-dealer-channel={c.slug}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div><h2 style={{ margin: 0 }}>{c.name}</h2><p className="cz-muted" style={{ margin: '4px 0 0' }}>{c.roleLabel} · {c.territory}</p></div>
                  <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => setLead(c)}>Add a lead</Button><Link className="cz-btn cz-btn-secondary" href="/crm/pipeline">Open pipeline</Link></div>
                </div>
                <div className="cz-gp-stats" style={{ marginTop: 12 }}>
                  {c.pipeline.filter((p) => p.stage !== 'lost').map((p) => <div key={p.stage} data-stage={p.stage}><strong>{p.count}</strong><span>{STAGE[p.stage]}{p.value ? ` · ${inr(p.value)}` : ''}</span></div>)}
                </div>
                {c.recent.length > 0 && <ul className="cz-board-list" style={{ marginTop: 12 }}>{c.recent.map((x) => <li key={x.id}><strong>{x.title}</strong> — {x.customer} · {STAGE[x.stage]}{x.value ? ` · ${inr(x.value)}` : ''}</li>)}</ul>}
              </div>
            </Card>
          ))}
          {d.applications.length > 0 && (
            <Card>
              <h2 style={{ marginTop: 0 }}>My applications</h2>
              <ul className="cz-board-list">{d.applications.map((a) => (
                <li key={a.id} data-application={a.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span><strong>{a.productName}</strong> — {a.roleLabel} · {a.code}{a.decisionNote && a.status === 'declined' ? ` · ${a.decisionNote}` : ''}</span>
                  <StatusBadge status={a.status} label={a.statusLabel} tone={a.status === 'approved' ? 'success' : a.status === 'declined' ? 'neutral' : 'info'} />
                </li>
              ))}</ul>
            </Card>
          )}
          {d.recommendations.length > 0 && (
            <Card>
              <h2 style={{ marginTop: 0 }}>Also a fit for your business</h2>
              <ul className="cz-gp-list">{d.recommendations.slice(0, 4).map((r) => (
                <li key={r.slug}><div><strong>{r.name} — {channelRoleLabel(r.role)}</strong> <span className="cz-match-score">{r.score}% fit</span><p>{r.reasons.join(' · ')}</p></div><Link className="cz-btn cz-btn-secondary cz-btn-sm" href={`/partner-with-unite?product=${r.slug}&role=${r.role}`}>Apply</Link></li>
              ))}</ul>
              <p className="cz-muted" style={{ fontSize: 13, marginBottom: 0 }}>Matching agent — rules-based suggestions with their reasons.</p>
            </Card>
          )}
        </div>
      )}
      <Dialog open={!!lead} onClose={() => setLead(null)} title={lead ? `New ${lead.name} lead` : 'New lead'}>{lead && <LeadForm c={lead} onDone={() => { setLead(null); q.reload(); }} />}</Dialog>
    </Screen>
  );
}

function LeadForm({ c, onDone }: { c: Channel; onDone: () => void }) {
  const [f, setF] = useState({ customer: '', contactName: '', phone: '', city: '', title: '', value: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const m = useMutation(async () => { await api.post('/brand-products/leads', { productSlug: c.slug, customer: f.customer, contactName: f.contactName, phone: f.phone, city: f.city, title: f.title, value: f.value ? Math.round(Number(f.value) * 100) : undefined }); onDone(); return true; });
  const fe = m.fieldErrors;
  return (
    <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="dealer-lead">
      <TextInput label="Customer (business or person)" value={f.customer} onChange={set('customer')} error={fe.customer} />
      <div className="cz-grid cz-grid-2">
        <TextInput label="Contact name (optional)" value={f.contactName} onChange={set('contactName')} />
        <TextInput label="Phone (optional)" type="tel" value={f.phone} onChange={set('phone')} />
        <TextInput label="City (optional)" value={f.city} onChange={set('city')} />
        <TextInput label="Expected value in ₹ (optional)" inputMode="decimal" value={f.value} onChange={set('value')} />
      </div>
      <TextInput label="What they need" placeholder="For example: 600 bags for a G+4 building" value={f.title} onChange={set('title')} error={fe.title} />
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <Button type="submit" loading={m.pending}>Add lead</Button>
    </form>
  );
}

'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PT_MODELS, PT_MODEL_KEYS, type PtModel } from '@collabiz/types';
import { Alert, Button, EmptyState, Select, Skeleton, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PtHeader, PtNav, PtStatusBadge, rupees, toPaise } from '@/components/Powertrade';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface C { id: string; code: string; title: string; model: PtModel; status: string; counterparty: string | null; owner: string; mine: boolean; supplyValuePaise: number | null; benefitValuePaise: number | null; required: { status: string }[] }
interface Contact { orgId: string; org: string }

function Inner() {
  const sp = useSearchParams();
  const q = useQuery<{ items: C[] }>('/powertrade/collaborations');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ model: (sp.get('model') as PtModel) ?? 'product_for_power', title: '', summary: '', counterpartyOrgId: sp.get('with') ?? '', supply: '', benefit: '', tariff: '', units: '' });
  useEffect(() => { if (sp.get('model') || sp.get('with')) setOpen(true); }, [sp]);
  const contacts = useQuery<{ userId: string; name: string; org: string; orgId: string }[]>('/chat/contacts', { q: '' });
  const orgs: Contact[] = [...new Map((contacts.data ?? []).map((c) => [c.orgId, { orgId: c.orgId, org: c.org }])).values()];
  const m = useMutation(async () => {
    const r = await api.post<{ id: string }>('/powertrade/collaborations', { model: f.model, title: f.title, summary: f.summary, counterpartyOrgId: f.counterpartyOrgId || undefined,
      supplyValuePaise: f.supply ? toPaise(f.supply) : undefined, benefitValuePaise: f.benefit ? toPaise(f.benefit) : undefined, powerTariffPaisePerKwh: f.tariff ? Math.round(Number(f.tariff) * 100) : undefined, powerUnitsPerMonth: f.units ? Math.round(Number(f.units)) : undefined });
    window.location.href = `/powertrade/collaborations/${r.id}`; return true;
  });
  return (
    <Screen page={{ key: 'powertrade-collabs', title: 'My collaborations', access: 'partner' }} header={false}>
      <PtHeader title="My collaborations" lead="Every collaboration keeps its legs, documents, tax review and approvals together — and who did what, when." />
      <PtNav />
      {open ? (
        <form className="cz-card cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="pt-collab">
          <h2 style={{ margin: 0 }}>Propose a collaboration</h2>
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          <div className="cz-grid cz-grid-2">
            <Select label="Model" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value as PtModel })} options={PT_MODEL_KEYS.map((k) => ({ value: k, label: PT_MODELS[k].label }))} />
            <Select label="With" value={f.counterpartyOrgId} onChange={(e) => setF({ ...f, counterpartyOrgId: e.target.value })} options={[{ value: '', label: 'Unite Group' }, ...orgs.map((o) => ({ value: o.orgId, label: o.org }))]} />
          </div>
          <p className="cz-muted" style={{ margin: 0 }}>{PT_MODELS[f.model].text}</p>
          <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={m.fieldErrors.title} />
          <TextArea label="What each side does" rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} error={m.fieldErrors.summary} />
          {(f.model === 'product_for_power' || f.model === 'solar_integration') && <div className="cz-grid cz-grid-2">
            <TextInput label="Supply value (₹)" inputMode="numeric" value={f.supply} onChange={(e) => setF({ ...f, supply: e.target.value })} error={m.fieldErrors.supplyValuePaise} />
            <TextInput label="Separately agreed benefit (₹)" inputMode="numeric" value={f.benefit} onChange={(e) => setF({ ...f, benefit: e.target.value })} error={m.fieldErrors.benefitValuePaise} hint="A rebate or value adjustment in its own agreement — not the product value" />
          </div>}
          {(f.model === 'product_for_power' || f.model === 'discounted_ppa' || f.model === 'group_captive') && <div className="cz-grid cz-grid-2">
            <TextInput label="Power tariff in the separate PPA (₹/kWh)" inputMode="decimal" value={f.tariff} onChange={(e) => setF({ ...f, tariff: e.target.value })} />
            <TextInput label="Power units per month" inputMode="numeric" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} />
          </div>}
          {f.model === 'product_for_power' && <Alert tone="info">Product supply and power supply stay two separate contracts. The benefit can support power-related costs only through an approved settlement agreement after tax review.</Alert>}
          <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={m.pending}>Save as draft</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      ) : <div><Button variant="accent" onClick={() => setOpen(true)}>Propose a collaboration</Button></div>}
      <section style={{ marginTop: 16 }}>
        {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={160} /> : !q.data.items.length ? <EmptyState title="No collaborations yet">Start from a match, or propose one above.</EmptyState> : (
          <ul className="cz-umeet-list">{q.data.items.map((c) => {
            const done = c.required.filter((d) => d.status === 'accepted').length;
            return <li key={c.id} data-collab={c.code}><div><strong>{c.code} · {c.title}</strong><span>{PT_MODELS[c.model].label} · {c.mine ? `with ${c.counterparty ?? 'Unite Group'}` : `from ${c.owner}`}{c.supplyValuePaise ? ` · supply ${rupees(c.supplyValuePaise)}` : ''}{c.benefitValuePaise ? ` · benefit ${rupees(c.benefitValuePaise)}` : ''} · documents {done}/{c.required.length}</span></div><div className="cz-row" style={{ gap: 8, flexWrap: 'nowrap' }}><PtStatusBadge s={c.status} /><Link className="cz-btn cz-btn-secondary cz-btn-sm" href={`/powertrade/collaborations/${c.id}`}>Open</Link></div></li>;
          })}</ul>
        )}
      </section>
    </Screen>
  );
}
export default function PtCollaborations() { return <Suspense><Inner /></Suspense>; }

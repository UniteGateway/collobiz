'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CE_CATEGORIES, CE_MODELS, CE_TRIGGERS, CE_TYPES, cePotential, type CeCategory, type CeModel, type CeTrigger, type CeType } from '@collabiz/types';
import { Alert, Button, Card, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { CeHeader, CeNav, rupees, toPaise } from '@/components/Comearn';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

/** Offer commissions — create an earning opportunity. Saved as a draft; publishing needs a verified business. */
export default function ComearnPost() {
  const router = useRouter();
  const [f, setF] = useState({ title: '', type: 'sales_conversion' as CeType, category: 'solar' as CeCategory, description: '', idealEarner: '', territory: '', value: '', model: 'percent' as CeModel, pct: '', fixed: '', recurringMonths: '', trigger: 'customer_payment' as CeTrigger, paymentDays: '30', maxEarners: '', licenceNote: '' });
  const [ms, setMs] = useState([{ label: 'Order confirmed', pct: '40' }, { label: 'Project completed', pct: '60' }]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const rateBps = f.pct ? Math.round(Number(f.pct) * 100) : undefined;
  const potential = cePotential({ model: f.model, rateBps, fixedPaise: f.fixed ? toPaise(f.fixed) : undefined, milestones: [], trigger: f.trigger, paymentDays: 30 }, f.value ? toPaise(f.value) : null);
  const save = useMutation(async (publish: boolean) => {
    const r = await api.post<{ id: string }>('/comearn/opportunities', { title: f.title, type: f.type, category: f.category, description: f.description, idealEarner: f.idealEarner || undefined, territory: f.territory,
      estimatedValuePaise: f.value ? toPaise(f.value) : undefined, model: f.model, rateBps: f.model === 'fixed' ? undefined : rateBps, fixedPaise: f.model === 'fixed' && f.fixed ? toPaise(f.fixed) : undefined,
      milestones: f.model === 'milestone' ? ms.map((m) => ({ label: m.label, pct: Number(m.pct) })) : [], recurringMonths: f.model === 'recurring' && f.recurringMonths ? Number(f.recurringMonths) : undefined,
      trigger: f.trigger, paymentDays: Number(f.paymentDays || 30), maxEarners: f.maxEarners ? Number(f.maxEarners) : undefined, licenceNote: f.licenceNote || undefined });
    if (publish) {
      try { await api.post(`/comearn/opportunities/${r.id}/status`, { status: 'live' }); }
      catch (e) { router.push(`/comearn/offer?unpublished=${encodeURIComponent((e as Error).message)}`); return true; }
    }
    router.push(publish ? `/comearn/opportunities/${r.id}` : '/comearn/offer'); return true;
  });
  const fe = save.fieldErrors;
  return (
    <Screen page={{ key: 'comearn-post', title: 'Create earning opportunity', access: 'partner' }} header={false}>
      <CeHeader title="Offer commissions" lead="Post what you will pay for — an introduction, an order, a dealer, an export deal. Members across COLLABIZ work to earn it." />
      <CeNav />
      <p className="ce-muted"><Link href="/comearn/offer">My posted opportunities →</Link></p>
      <form className="cz-stack" style={{ gap: 16 }} data-form="ce-post" onSubmit={(e) => { e.preventDefault(); save.run(true); }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Card title="Create earning opportunity">
          <TextInput label="Opportunity title" value={f.title} onChange={set('title')} error={fe.title} />
          <div className="vai-grid">
            <Select label="Opportunity type" value={f.type} onChange={set('type')} options={Object.entries(CE_TYPES).map(([value, t]) => ({ value, label: t.label }))} hint={CE_TYPES[f.type].earn} />
            <Select label="Category" value={f.category} onChange={set('category')} options={Object.entries(CE_CATEGORIES).map(([value, label]) => ({ value, label }))} />
            <TextInput label="Territory" value={f.territory} onChange={set('territory')} error={fe.territory} hint="e.g. Telangana, South India, UAE" />
            <TextInput label="Estimated business value (₹)" inputMode="decimal" value={f.value} onChange={set('value')} hint="Typical deal size — used only to show an estimate" />
          </div>
          <TextArea label="Describe the opportunity" value={f.description} onChange={set('description')} error={fe.description} rows={4} />
          <TextInput label="Who does well here (optional)" value={f.idealEarner} onChange={set('idealEarner')} />
          {f.category === 'real_estate' && <TextInput label="Licence / registration (e.g. RERA number)" value={f.licenceNote} onChange={set('licenceNote')} error={fe.licenceNote} />}
        </Card>
        <Card title="Commission">
          <div className="vai-grid">
            <Select label="Commission model" value={f.model} onChange={set('model')} options={Object.entries(CE_MODELS).map(([value, label]) => ({ value, label }))} />
            {f.model === 'fixed' ? <TextInput label="Commission amount (₹)" inputMode="decimal" value={f.fixed} onChange={set('fixed')} error={fe.fixedPaise} />
              : <TextInput label="Commission percentage" inputMode="decimal" value={f.pct} onChange={set('pct')} error={fe.rateBps} />}
            {f.model === 'recurring' && <TextInput label="Repeat business paid for (months)" inputMode="numeric" value={f.recurringMonths} onChange={set('recurringMonths')} error={fe.recurringMonths} />}
            <Select label="Commission payment milestone" value={f.trigger} onChange={set('trigger')} options={Object.entries(CE_TRIGGERS).map(([value, label]) => ({ value, label }))} />
            <TextInput label="Pay within (days of approval)" inputMode="numeric" value={f.paymentDays} onChange={set('paymentDays')} />
            <TextInput label="Maximum members (optional)" inputMode="numeric" value={f.maxEarners} onChange={set('maxEarners')} />
          </div>
          {f.model === 'milestone' && (
            <div className="cz-stack" style={{ gap: 6 }}>
              {ms.map((m, i) => <div key={i} className="vai-row"><TextInput label={`Milestone ${i + 1}`} value={m.label} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /><TextInput label="Share of commission %" inputMode="decimal" value={m.pct} onChange={(e) => setMs(ms.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} /></div>)}
              {fe.milestones && <Alert tone="danger">{fe.milestones}</Alert>}
              <div><Button type="button" size="sm" variant="secondary" onClick={() => setMs([...ms, { label: '', pct: '' }])}>Add milestone</Button></div>
            </div>
          )}
          <div className="ce-potential" data-ce-potential><span>Potential commission</span><strong>{potential != null ? rupees(potential) : '—'}</strong><small>Estimate per deal. Actual commission is calculated from the amount you verify.</small></div>
        </Card>
        <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={save.pending}>Generate opportunity &amp; agreement</Button><Button type="button" variant="ghost" onClick={() => save.run(false)}>Save as draft</Button></div>
        <p className="ce-muted">Publishing needs a verified business. Posting is free. Members accept a commission agreement generated from these terms; changing terms later creates a new version and does not change what members already accepted.</p>
      </form>
    </Screen>
  );
}

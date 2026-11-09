'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COUNTRIES, GROWTH_AUDIENCES, GROWTH_AUDIENCE_LABELS, GROWTH_CADENCES, GROWTH_CADENCE_LABELS, INDIA_STATES, SECTORS, blockedClaimsIn } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect, PageHeader, Select, TextArea, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Venture { id: string; name: string; tagline: string; sector: string; open: boolean; regulated: boolean; cleared: boolean }

/** New Growth Desk agent: what it promotes, to whom, where, and the approved pitch it may use. */
export default function NewAgent() {
  const router = useRouter();
  const ventures = useQuery<Venture[]>('/admin/ventures');
  const [f, setF] = useState({ name: '', ventureId: '', product: '', audience: 'buyers', sectors: [] as string[], regions: [] as string[], countries: ['IN'], pitch: '', callToAction: '', cadence: 'weekly', minScore: '45', maxLeadsPerRun: '25', dailySendCap: '40' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const usable = (ventures.data ?? []).filter((v) => !v.regulated || v.cleared);
  const claims = blockedClaimsIn(`${f.product}\n${f.pitch}\n${f.callToAction}`);
  const save = useMutation(async () => {
    const a = await api.post<{ id: string }>('/admin/growth/agents', {
      ...f, ventureId: f.ventureId || null, minScore: Number(f.minScore), maxLeadsPerRun: Number(f.maxLeadsPerRun), dailySendCap: Number(f.dailySendCap),
    });
    router.push(`/growth/agents/${a.id}`);
    return a;
  });
  const chooseVenture = (id: string) => {
    const v = usable.find((x) => x.id === id);
    setF((p) => ({ ...p, ventureId: id, ...(v && !p.product ? { product: `${v.name}: ${v.tagline}`, name: p.name || `${v.name} — customers`, sectors: p.sectors.length ? p.sectors : [v.sector] } : {}) }));
  };
  const e = save.fieldErrors;
  return (
    <div>
      <PageHeader title="New agent" breadcrumb="Growth Desk" description="An agent looks for one product or service. It uses only the pitch you approve here — it never invents prices, promises or facts." />
      <form className="cz-stack" style={{ gap: 16, maxWidth: 860 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Card title="What it promotes">
          <div className="cz-stack" style={{ gap: 12 }}>
            <Select label="Unite business (optional)" value={f.ventureId} onChange={(ev) => chooseVenture(ev.target.value)} placeholder="Not linked to a business" options={usable.map((v) => ({ value: v.id, label: `${v.name}${v.open ? '' : ' (coming soon)'}` }))} hint="Finance and investment businesses appear here only after regulatory clearance." />
            <TextInput label="Agent name" value={f.name} onChange={(ev) => set('name', ev.target.value)} error={e.name} placeholder="e.g. SOLCART — factory rooftop solar" />
            <TextInput label="Product or service" value={f.product} onChange={(ev) => set('product', ev.target.value)} error={e.product} />
            <TextArea label="Approved pitch" rows={5} value={f.pitch} onChange={(ev) => set('pitch', ev.target.value)} error={e.pitch} hint="What the product is and why it helps. Facts only — no guarantees, assured returns or pressure wording." />
            <TextInput label="What you want them to do" value={f.callToAction} onChange={(ev) => set('callToAction', ev.target.value)} error={e.callToAction} placeholder="e.g. Reply with a convenient time for a 15-minute call." />
            {claims.length > 0 && <Alert tone="warning">Remove wording that is not allowed: {claims.join(', ')}.</Alert>}
          </div>
        </Card>
        <Card title="Who and where">
          <div className="cz-stack" style={{ gap: 12 }}>
            <Select label="Audience" value={f.audience} onChange={(ev) => set('audience', ev.target.value)} options={GROWTH_AUDIENCES.map((a) => ({ value: a, label: GROWTH_AUDIENCE_LABELS[a] }))}
              hint={f.audience === 'investors' ? 'Investor agents reach only investors who opted in, and need a super admin’s clearance before they run.' : undefined} />
            <ChipSelect legend="Sectors to look in" value={f.sectors} onChange={(v) => set('sectors', v)} max={8} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
            {e.sectors && <span className="cz-error-text">{e.sectors}</span>}
            <ChipSelect legend="Countries" value={f.countries} onChange={(v) => set('countries', v)} options={COUNTRIES.map(([c, n]) => ({ value: c, label: n }))} />
            {f.countries.includes('IN') && <ChipSelect legend="Indian states (leave empty for all)" value={f.regions} onChange={(v) => set('regions', v)} options={INDIA_STATES.map(([c, n]) => ({ value: c, label: n }))} />}
          </div>
        </Card>
        <Card title="How it works">
          <div className="cz-growth-kpis">
            <Select label="Runs" value={f.cadence} onChange={(ev) => set('cadence', ev.target.value)} options={GROWTH_CADENCES.map((c) => ({ value: c, label: GROWTH_CADENCE_LABELS[c] }))} />
            <TextInput label="Lowest score to keep (10–95)" inputMode="numeric" value={f.minScore} onChange={(ev) => set('minScore', ev.target.value.replace(/\D/g, ''))} error={e.minScore} />
            <TextInput label="Most new leads per run" inputMode="numeric" value={f.maxLeadsPerRun} onChange={(ev) => set('maxLeadsPerRun', ev.target.value.replace(/\D/g, ''))} error={e.maxLeadsPerRun} />
            <TextInput label="Most e-mails per day" inputMode="numeric" value={f.dailySendCap} onChange={(ev) => set('dailySendCap', ev.target.value.replace(/\D/g, ''))} error={e.dailySendCap} />
          </div>
        </Card>
        <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={save.pending} disabled={claims.length > 0}>Create agent</Button><span className="cz-muted">It starts as a draft. Run it to preview leads, then switch it on.</span></div>
      </form>
    </div>
  );
}

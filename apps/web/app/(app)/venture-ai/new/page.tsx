'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { VAI_EVIDENCE_KINDS, VAI_OPP_TYPES, VAI_ROLES, type VaiEvidenceKind, type VaiOppType, type VaiRole } from '@collabiz/types';
import { Alert, Button, Card, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { VaiHeader, VaiNav, lakh } from '@/components/VentureAi';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

interface RoleRow { role: VaiRole; count: number; categories: string }
interface EvRow { kind: VaiEvidenceKind; statement: string; source: string; sourceDate: string }
const ROLE_OPTS = Object.entries(VAI_ROLES).map(([value, label]) => ({ value, label }));
const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Propose a product: problem → gap → solution, the roles it needs and the evidence behind it. Saved as a private draft. */
export default function VaiNew() {
  const router = useRouter();
  const [f, setF] = useState({ title: '', type: 'combination' as VaiOppType, problem: '', marketGap: '', targetCustomers: '', proposedSolution: '', competitors: '', technology: '', manufacturing: '', investmentLakh: '', marginPct: '', countries: 'IN', risks: '', regulatory: '' });
  const [roles, setRoles] = useState<RoleRow[]>([{ role: 'manufacturer', count: 1, categories: '' }]);
  const [ev, setEv] = useState<EvRow[]>([{ kind: 'assumption', statement: '', source: '', sourceDate: '' }]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation(async () => {
    const r = await api.post<{ id: string }>('/venture-ai/opportunities', {
      title: f.title, type: f.type, problem: f.problem, marketGap: f.marketGap, targetCustomers: f.targetCustomers, proposedSolution: f.proposedSolution,
      competitors: f.competitors || undefined, technology: f.technology || undefined, manufacturing: f.manufacturing || undefined, risks: f.risks || undefined, regulatory: f.regulatory || undefined,
      investmentPaise: f.investmentLakh ? lakh(f.investmentLakh) : undefined, marginPct: f.marginPct ? Number(f.marginPct) : undefined, countries: split(f.countries).map((c) => c.toUpperCase()),
      roles: roles.map((r) => ({ role: r.role, count: r.count, categories: split(r.categories) })),
      evidence: ev.filter((e) => e.statement.trim()).map((e) => ({ kind: e.kind, statement: e.statement, source: e.source || undefined, sourceDate: e.sourceDate || undefined })),
    });
    router.push(`/venture-ai/opportunities/${r.id}`); return true;
  });
  const fe = save.fieldErrors;
  return (
    <Screen page={{ key: 'venture-ai-new', title: 'Propose a product', access: 'partner' }} header={false}>
      <VaiHeader title="Propose a product" lead="Start from a real problem. Your proposal stays private until you submit it to Unite for review." />
      <VaiNav />
      <form className="cz-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Card title="1 · Opportunity">
          <div className="vai-grid">
            <TextInput label="Product or business name" value={f.title} onChange={set('title')} error={fe.title} required />
            <Select label="Type" value={f.type} onChange={set('type')} options={Object.entries(VAI_OPP_TYPES).map(([value, label]) => ({ value, label }))} />
          </div>
          <TextArea label="Customer problem" value={f.problem} onChange={set('problem')} error={fe.problem} rows={3} required />
          <TextArea label="Market gap — why existing options fall short" value={f.marketGap} onChange={set('marketGap')} error={fe.marketGap} rows={3} required />
          <TextInput label="Target customers" value={f.targetCustomers} onChange={set('targetCustomers')} error={fe.targetCustomers} required />
          <TextArea label="Proposed solution" value={f.proposedSolution} onChange={set('proposedSolution')} error={fe.proposedSolution} rows={3} required />
          <div className="vai-grid">
            <TextInput label="Investment needed (₹ lakh)" inputMode="decimal" value={f.investmentLakh} onChange={set('investmentLakh')} hint="Your estimate — leave blank if unknown" />
            <TextInput label="Expected gross margin %" inputMode="decimal" value={f.marginPct} onChange={set('marginPct')} />
            <TextInput label="Countries (ISO codes)" value={f.countries} onChange={set('countries')} hint="e.g. IN, AE" error={fe.countries} />
          </div>
          <details><summary>More detail (competitors, technology, manufacturing, risks, regulation)</summary>
            <TextArea label="Competitors" value={f.competitors} onChange={set('competitors')} rows={2} />
            <TextArea label="Technology" value={f.technology} onChange={set('technology')} rows={2} />
            <TextArea label="Manufacturing" value={f.manufacturing} onChange={set('manufacturing')} rows={2} />
            <TextArea label="Risks" value={f.risks} onChange={set('risks')} rows={2} />
            <TextArea label="Regulatory approvals" value={f.regulatory} onChange={set('regulatory')} rows={2} />
          </details>
        </Card>
        <Card title="2 · Roles this business needs" subtitle="Members are matched to each role from their capability profiles.">
          {roles.map((r, i) => (
            <div key={i} className="vai-row" data-role-row={i}>
              <Select label="Role" value={r.role} onChange={(e) => setRoles(roles.map((x, j) => (j === i ? { ...x, role: e.target.value as VaiRole } : x)))} options={ROLE_OPTS} />
              <TextInput label="How many" type="number" min={1} max={20} value={r.count} onChange={(e) => setRoles(roles.map((x, j) => (j === i ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x)))} />
              <TextInput label="Categories" hint="comma separated, e.g. Conveyors" value={r.categories} onChange={(e) => setRoles(roles.map((x, j) => (j === i ? { ...x, categories: e.target.value } : x)))} />
              <Button type="button" size="sm" variant="ghost" onClick={() => setRoles(roles.filter((_, j) => j !== i))} aria-label="Remove role">Remove</Button>
            </div>))}
          <div><Button type="button" size="sm" variant="secondary" onClick={() => setRoles([...roles, { role: 'distributor', count: 1, categories: '' }])}>Add role</Button></div>
        </Card>
        <Card title="3 · Evidence" subtitle="Label every statement honestly. A verified fact needs its source and date; anything else is an assumption or forecast.">
          {ev.map((e, i) => (
            <div key={i} className="vai-row">
              <Select label="Kind" value={e.kind} onChange={(x) => setEv(ev.map((y, j) => (j === i ? { ...y, kind: x.target.value as VaiEvidenceKind } : y)))} options={Object.entries(VAI_EVIDENCE_KINDS).map(([value, label]) => ({ value, label }))} />
              <TextInput label="Statement" value={e.statement} onChange={(x) => setEv(ev.map((y, j) => (j === i ? { ...y, statement: x.target.value } : y)))} />
              {e.kind === 'verified' && <><TextInput label="Source" value={e.source} onChange={(x) => setEv(ev.map((y, j) => (j === i ? { ...y, source: x.target.value } : y)))} /><TextInput label="Source date" type="date" value={e.sourceDate} onChange={(x) => setEv(ev.map((y, j) => (j === i ? { ...y, sourceDate: x.target.value } : y)))} /></>}
            </div>))}
          <div><Button type="button" size="sm" variant="secondary" onClick={() => setEv([...ev, { kind: 'assumption', statement: '', source: '', sourceDate: '' }])}>Add evidence</Button></div>
        </Card>
        <div><Button type="submit" loading={save.pending}>Save draft</Button></div>
      </form>
    </Screen>
  );
}

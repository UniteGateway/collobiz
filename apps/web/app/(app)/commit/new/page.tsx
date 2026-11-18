'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONDITION_KINDS } from '@collabiz/types';
import { Alert, Button, Card, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { addDays } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Org { id: string; name: string; city: string | null }

export default function NewCommitment() {
  const router = useRouter();
  const me = useSession().me;
  const myOrg = me?.activeOrg?.id ?? '';
  const dir = useQuery<Org[]>('/launch/directory');
  const others = (dir.data ?? []).filter((o) => o.id !== myOrg);
  const [f, setF] = useState({ title: '', purpose: '', deadline: addDays(30), myRole: '', myPledge: '' });
  const [parties, setParties] = useState([{ orgId: '', role: '', pledge: '' }]);
  const [conds, setConds] = useState([{ kind: 'buyer_order', text: '', ownerOrgId: '' }]);
  const save = useMutation(async () => { const r = await api.post<{ id: string }>('/commit', { ...f, parties, conditions: conds.map((c) => ({ ...c, ownerOrgId: c.ownerOrgId || myOrg })) }); router.push(`/commit/${r.id}`); return r; });
  const owners = [{ value: myOrg, label: `${me?.activeOrg?.name ?? 'My business'} (us)` }, ...parties.filter((p) => p.orgId).map((p) => ({ value: p.orgId, label: others.find((o) => o.id === p.orgId)?.name ?? 'Party' }))];
  const e = save.fieldErrors;
  return (
    <Screen page={{ key: 'commit-new', title: 'New commitment', access: 'partner' }} eyebrow="Commit" description="Set the parties, what each pledges, and the conditions that must be verified before the deadline. Nothing binds until all of it is in place.">
      <form noValidate className="cz-stack" style={{ gap: 16 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Card title="The deal">
          <TextInput label="Title" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} error={e.title} placeholder="e.g. Kurnool 2 MW rooftop cluster" />
          <TextArea label="What happens if everything lines up" rows={3} value={f.purpose} onChange={(ev) => setF({ ...f, purpose: ev.target.value })} error={e.purpose} />
          <div className="cz-grid cz-grid-2">
            <TextInput label="Deadline" type="date" value={f.deadline} onChange={(ev) => setF({ ...f, deadline: ev.target.value })} error={e.deadline} />
            <TextInput label="Our role" value={f.myRole} onChange={(ev) => setF({ ...f, myRole: ev.target.value })} error={e.myRole} placeholder="EPC, buyer, financier…" />
          </div>
          <TextInput label="What we pledge" value={f.myPledge} onChange={(ev) => setF({ ...f, myPledge: ev.target.value })} error={e.myPledge} />
        </Card>
        <Card title="Other parties" subtitle="Verified businesses on COLLABIZ. Each must pledge (or decline) before the deadline.">
          {parties.map((p, i) => (
            <fieldset key={i} className="cz-commit-row"><legend>Party {i + 1}</legend>
              <Select label="Business" value={p.orgId} onChange={(ev) => setParties(parties.map((x, j) => (j === i ? { ...x, orgId: ev.target.value } : x)))} options={[{ value: '', label: dir.data ? 'Choose' : 'Loading…' }, ...others.map((o) => ({ value: o.id, label: `${o.name}${o.city ? ` · ${o.city}` : ''}` }))]} />
              <TextInput label="Role" value={p.role} onChange={(ev) => setParties(parties.map((x, j) => (j === i ? { ...x, role: ev.target.value } : x)))} />
              <TextInput label="What they pledge" value={p.pledge} onChange={(ev) => setParties(parties.map((x, j) => (j === i ? { ...x, pledge: ev.target.value } : x)))} />
              {parties.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setParties(parties.filter((_, j) => j !== i))}>Remove</Button>}
            </fieldset>
          ))}
          {e.parties && <p className="cz-error-text">{e.parties}</p>}
          <Button type="button" size="sm" variant="secondary" onClick={() => setParties([...parties, { orgId: '', role: '', pledge: '' }])}>Add a party</Button>
        </Card>
        <Card title="Conditions" subtitle="The business responsible posts evidence; a different party verifies it.">
          {conds.map((c, i) => (
            <fieldset key={i} className="cz-commit-row"><legend>Condition {i + 1}</legend>
              <Select label="Type" value={c.kind} onChange={(ev) => setConds(conds.map((x, j) => (j === i ? { ...x, kind: ev.target.value } : x)))} options={CONDITION_KINDS.map((k) => ({ value: k.code, label: k.label }))} />
              <TextInput label="Condition" value={c.text} onChange={(ev) => setConds(conds.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)))} placeholder="e.g. Purchase orders from five factories" />
              <Select label="Responsible" value={c.ownerOrgId || myOrg} onChange={(ev) => setConds(conds.map((x, j) => (j === i ? { ...x, ownerOrgId: ev.target.value } : x)))} options={owners} />
              {conds.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setConds(conds.filter((_, j) => j !== i))}>Remove</Button>}
            </fieldset>
          ))}
          {e.conditions && <p className="cz-error-text">{e.conditions}</p>}
          <Button type="button" size="sm" variant="secondary" onClick={() => setConds([...conds, { kind: 'other', text: '', ownerOrgId: '' }])}>Add a condition</Button>
        </Card>
        <div><Button type="submit" loading={save.pending}>Create and request pledges</Button></div>
      </form>
    </Screen>
  );
}

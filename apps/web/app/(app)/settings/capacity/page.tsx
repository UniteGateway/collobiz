'use client';
import { useEffect, useState } from 'react';
import { LOOKING_FOR, LOOKING_FOR_LABELS } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, ChipSelect, LoadingState, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Capacity { hasOffice: boolean; officeLocations: string[]; totalManpower: number; idleManpower: number; idleSkills: string[]; availableFrom: string | null; lookingFor: string[]; notes: string | null; updatedAt: string | null }
const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

/** Your capacity — offices, people and spare capacity Unite Group can see when choosing who receives direct offers. */
export default function CapacityPage() {
  const q = useQuery<Capacity>('/me/capacity');
  const [f, setF] = useState({ hasOffice: false, offices: '', total: '', idle: '', skills: '', from: '', lookingFor: [] as string[], notes: '' });
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const c = q.data; if (!c) return;
    setF({ hasOffice: c.hasOffice, offices: c.officeLocations.join(', '), total: String(c.totalManpower), idle: String(c.idleManpower), skills: c.idleSkills.join(', '), from: c.availableFrom ?? '', lookingFor: c.lookingFor, notes: c.notes ?? '' });
  }, [q.data]);
  const save = useMutation(async () => {
    setSaved(false);
    await api.put('/me/capacity', { hasOffice: f.hasOffice, officeLocations: f.hasOffice ? list(f.offices) : [], totalManpower: Number(f.total || 0), idleManpower: Number(f.idle || 0), idleSkills: list(f.skills), availableFrom: f.from || undefined, lookingFor: f.lookingFor, notes: f.notes || undefined });
    setSaved(true); q.reload(); return true;
  });
  const e = save.fieldErrors;
  return (
    <Screen page={{ key: 'capacity', title: 'Your capacity', access: 'partner' }}
      description="Tell Unite Group what you can take on: offices, people who are free, and the kind of work you want. It is used to choose who receives direct offers and is never shown to other partners.">
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <form noValidate onSubmit={(ev) => { ev.preventDefault(); save.run(); }} className="cz-stack">
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          {saved && <Alert tone="success">Saved. Unite Group will see your updated capacity on the next offer.</Alert>}
          <Card title="Office and setup">
            <Checkbox label="We have an existing office, warehouse or setup that can serve new work" checked={f.hasOffice} onChange={(ev) => setF({ ...f, hasOffice: ev.target.checked })} />
            {f.hasOffice && <TextInput label="Locations (comma-separated)" value={f.offices} onChange={(ev) => setF({ ...f, offices: ev.target.value })} error={e.officeLocations} hint="e.g. Pune, Nashik, Dubai (Jebel Ali)" />}
          </Card>
          <Card title="People">
            <div className="cz-grid cz-grid-2">
              <TextInput label="Total team" inputMode="numeric" value={f.total} onChange={(ev) => setF({ ...f, total: ev.target.value })} error={e.totalManpower} />
              <TextInput label="People free now (idle)" inputMode="numeric" value={f.idle} onChange={(ev) => setF({ ...f, idle: ev.target.value })} error={e.idleManpower} />
              <TextInput label="Skills of the free people (comma-separated)" value={f.skills} onChange={(ev) => setF({ ...f, skills: ev.target.value })} />
              <TextInput label="Available from" type="date" value={f.from} onChange={(ev) => setF({ ...f, from: ev.target.value })} />
            </div>
          </Card>
          <Card title="What you are looking for">
            <ChipSelect legend="Kinds of work you want" options={LOOKING_FOR.map((k) => ({ value: k, label: LOOKING_FOR_LABELS[k] }))} value={f.lookingFor} onChange={(lookingFor) => setF({ ...f, lookingFor })} />
            <TextArea label="Anything else (optional)" value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} />
          </Card>
          <div><Button type="submit" loading={save.pending}>Save capacity</Button></div>
          {q.data?.updatedAt && <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Last updated {new Date(q.data.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
        </form>
      )}
    </Screen>
  );
}

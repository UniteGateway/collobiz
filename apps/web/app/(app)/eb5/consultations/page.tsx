'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, Dialog, LoadingState, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, useEb5, when } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface C { id: string; leadId: string; lead: string; name: string; host: string; scheduledAt: string; timezone: string; mode: string; kind: string; status: string; attendance: string | null; notes: string | null; location: string | null }
const inZone = (iso: string, tz: string) => { try { return new Date(iso).toLocaleString('en-IN', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return when(iso); } };

/** Consultations — India and USA scheduling, attorney appointments, outcomes and follow-ups. Book new ones from a lead. */
export default function Eb5Consultations() {
  const { has } = useEb5();
  const q = useQuery<C[]>('/eb5/consultations');
  const [open, setOpen] = useState<C | null>(null);
  const [f, setF] = useState({ status: 'completed', attendance: '', notes: '', rescheduleAt: '', followTitle: '', followDue: '' });
  const save = useMutation(async () => {
    await api.post(`/eb5/consultations/${open!.id}`, { status: f.rescheduleAt ? 'scheduled' : f.status, attendance: f.attendance || undefined, notes: f.notes || undefined, scheduledAt: f.rescheduleAt ? new Date(f.rescheduleAt).toISOString() : undefined, followUp: f.followTitle ? { title: f.followTitle, dueOn: f.followDue } : undefined });
    setOpen(null); q.reload(); return true;
  });
  const staff = has('citrus_admin', 'business_manager', 'immigration_consultant', 'attorney', 'super_admin');
  return (
    <Screen page={{ key: 'eb5-consultations', title: 'Consultations', access: 'authenticated' }} eyebrow="GO EB5" description="Times are shown in the meeting's time zone and in India and U.S. Eastern time. Reminders go only through the channels each person has allowed.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data} caption="Consultations" empty={<p className="cz-muted">{staff ? 'Book a consultation from a lead.' : 'No consultations booked yet.'}</p>} columns={[
          { key: 'w', header: 'When', render: (c) => <span>{inZone(c.scheduledAt, c.timezone)} <span className="cz-muted">({c.timezone})</span><br /><span className="cz-muted" style={{ fontSize: 12 }}>IST {inZone(c.scheduledAt, 'Asia/Kolkata')} · ET {inZone(c.scheduledAt, 'America/New_York')}</span></span> },
          { key: 'c', header: 'Client', render: (c) => (staff ? <Link href={`/eb5/leads/${c.leadId}`}>{c.name}</Link> : c.name) },
          { key: 'k', header: 'With', render: (c) => `${c.kind} · ${c.host}` }, { key: 'm', header: 'Mode', render: (c) => c.mode },
          { key: 's', header: 'Status', render: (c) => <Badge s={c.status} /> },
          ...(staff ? [{ key: 'x', header: '', render: (c: C) => <Button size="sm" variant="secondary" onClick={() => { setOpen(c); setF({ status: 'completed', attendance: c.attendance ?? '', notes: c.notes ?? '', rescheduleAt: '', followTitle: '', followDue: '' }); }}>Update</Button> }] : []),
        ]} />
      )}
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open ? `Consultation with ${open.name}` : 'Consultation'}>
        {open && <form noValidate className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <Select label="Outcome" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={[{ value: 'completed', label: 'Completed' }, { value: 'no_show', label: 'Client did not attend' }, { value: 'cancelled', label: 'Cancelled' }]} />
          <TextInput label="Attendance" value={f.attendance} onChange={(e) => setF({ ...f, attendance: e.target.value })} />
          <TextArea label="Meeting notes (staff only)" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <TextInput label="Or reschedule to" type="datetime-local" value={f.rescheduleAt} onChange={(e) => setF({ ...f, rescheduleAt: e.target.value })} />
          <div className="cz-grid cz-grid-2"><TextInput label="Follow-up task (optional)" value={f.followTitle} onChange={(e) => setF({ ...f, followTitle: e.target.value })} /><TextInput label="Due" type="date" value={f.followDue} onChange={(e) => setF({ ...f, followDue: e.target.value })} /></div>
          <div><Button type="submit" loading={save.pending}>Save</Button></div>
        </form>}
      </Dialog>
      <Card className="cz-mt"><p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Eligibility questions are answered only by the client's U.S. immigration attorney.</p></Card>
    </Screen>
  );
}

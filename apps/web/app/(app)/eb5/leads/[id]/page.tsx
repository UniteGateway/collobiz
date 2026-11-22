'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { EB5_DOC_CATEGORIES } from '@collabiz/types';
import { Alert, Button, Card, LoadingState, Select, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day, useEb5, when } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Lead {
  id: string; code: string; fullName: string; country: string; relation: string; status?: string; duplicate: boolean; createdAt: string;
  city?: string | null; contact?: { email: string | null; phone: string | null }; familyMembers?: string | null; readiness?: string; timeline?: string; contactPreference?: string; source?: string;
  consentAt?: string; consentText?: string; stage?: number; stageLabel?: string; caseStage?: number; followUpOn?: string | null; notes?: string | null; history?: { at: string; stage: number; note: string }[];
  assignedManagerId?: string | null; attorneyUserId?: string | null; clientUserId?: string | null; projectId?: string | null; closedReason?: string | null; stages: string[]; systemStages: number[]; staff?: { id: string; name: string; role: string }[];
}

/** One lead: details, pipeline stage, assignment, client invitation and the next actions. */
export default function Eb5Lead() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { has } = useEb5();
  const q = useQuery<Lead>(`/eb5/leads/${id}`);
  const projects = useQuery<{ id: string; name: string }[]>(has('citrus_admin', 'business_manager', 'immigration_consultant', 'super_admin') ? '/eb5/projects' : null);
  const [st, setSt] = useState({ stage: '', note: '', closedReason: '' });
  const [as, setAs] = useState<{ managerId?: string; attorneyId?: string; followUpOn?: string; projectId?: string }>({});
  const [cons, setCons] = useState({ at: '', kind: 'Consultant', mode: 'Online', timezone: 'Asia/Kolkata' });
  const [doc, setDoc] = useState({ category: 'Passport', title: '' });
  const [msg, setMsg] = useState('');
  const act = useMutation(async (fn: () => Promise<unknown>, ok: string) => { await fn(); setMsg(ok); q.reload(); return true; });
  const l = q.data;
  const staffOpts = (role: string[]) => [{ value: '', label: 'Unassigned' }, ...(l?.staff ?? []).filter((s) => role.includes(s.role)).map((s) => ({ value: s.id, label: s.name }))];
  return (
    <Screen page={{ key: 'eb5-lead', title: l ? l.fullName : 'GO EB5 lead', access: 'authenticated' }} eyebrow={l ? `GO EB5 · ${l.code}` : 'GO EB5'}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !l ? <LoadingState /> : l.relation !== 'staff' ? (
        <Card title="Introduction">
          <dl className="cz-dl"><dt>Reference</dt><dd>{l.code}</dd><dt>Prospect</dt><dd>{l.fullName} · {l.country}</dd><dt>Status</dt><dd><Badge s={l.status ?? l.stageLabel ?? ''} label={l.status ?? l.stageLabel} /></dd><dt>Introduced</dt><dd>{day(l.createdAt)}</dd></dl>
          <p className="cz-muted" style={{ fontSize: 13, marginBottom: 0 }}>Partners see the introduction and a general status only. {l.relation === 'client' && <Link href="/eb5/portal">Open your portal</Link>}</p>
        </Card>
      ) : <>
        {msg && <Alert tone="success">{msg}</Alert>}{act.error && <Alert tone="danger">{act.error}</Alert>}
        {l.duplicate && <Alert tone="warning" title="Ownership under compliance review">This record matches an existing prospect. It stays closed until compliance decides.</Alert>}
        <ol className="cz-eb5-steps" aria-label="Pipeline">{l.stages.map((s, i) => <li key={s} className={i === l.stage ? 'now' : i < (l.stage ?? 0) ? 'done' : ''}>{s}</li>)}</ol>
        <div className="cz-grid cz-grid-2 cz-mt">
          <Card title="Prospect">
            <dl className="cz-dl">
              <dt>Name</dt><dd>{l.fullName}</dd><dt>Location</dt><dd>{[l.city, l.country].filter(Boolean).join(', ')}</dd>
              <dt>Email</dt><dd>{l.contact?.email ?? '—'}</dd><dt>Phone</dt><dd>{l.contact?.phone ?? '—'}</dd><dt>Preferred contact</dt><dd>{l.contactPreference}</dd>
              <dt>Family</dt><dd>{l.familyMembers ?? '—'}</dd><dt>Readiness</dt><dd>{l.readiness}</dd><dt>Timeline</dt><dd>{l.timeline}</dd>
              <dt>Source</dt><dd>{l.source?.replace('_', ' ')}</dd><dt>Consent</dt><dd>{when(l.consentAt)} — {l.consentText}</dd><dt>Notes</dt><dd>{l.notes ?? '—'}</dd>
            </dl>
          </Card>
          <Card title="Stage & assignment">
            {!l.duplicate && <form noValidate className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); act.run(() => api.post(`/eb5/leads/${id}/stage`, { stage: Number(st.stage), note: st.note, closedReason: st.closedReason || undefined }), 'Stage updated'); }}>
              <Select label="Move to stage" value={st.stage} onChange={(e) => setSt({ ...st, stage: e.target.value })} options={[{ value: '', label: 'Choose' }, ...l.stages.map((s, i) => ({ value: String(i), label: l.systemStages.includes(i) ? `${s} (set by the record)` : s }))]} />
              <TextInput label="Note" value={st.note} onChange={(e) => setSt({ ...st, note: e.target.value })} />
              {st.stage === '15' && <TextInput label="Reason for closing" value={st.closedReason} onChange={(e) => setSt({ ...st, closedReason: e.target.value })} />}
              <div><Button type="submit" size="sm" disabled={!st.stage}>Update stage</Button></div>
            </form>}
            <div className="cz-grid cz-grid-2" style={{ marginTop: 12 }}>
              <Select label="Manager" value={as.managerId ?? l.assignedManagerId ?? ''} onChange={(e) => setAs({ ...as, managerId: e.target.value })} options={staffOpts(['business_manager', 'citrus_admin'])} />
              <Select label="U.S. immigration attorney" value={as.attorneyId ?? l.attorneyUserId ?? ''} onChange={(e) => setAs({ ...as, attorneyId: e.target.value })} options={staffOpts(['attorney'])} />
              <TextInput label="Follow up on" type="date" value={as.followUpOn ?? l.followUpOn ?? ''} onChange={(e) => setAs({ ...as, followUpOn: e.target.value })} />
              <Select label="EB-5 project" value={as.projectId ?? l.projectId ?? ''} onChange={(e) => setAs({ ...as, projectId: e.target.value })} options={[{ value: '', label: 'None' }, ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
            </div>
            <div className="cz-row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Button size="sm" variant="secondary" onClick={() => act.run(() => api.post(`/eb5/leads/${id}/assign`, { managerId: as.managerId === '' ? null : as.managerId, attorneyId: as.attorneyId === '' ? null : as.attorneyId, followUpOn: as.followUpOn || undefined, projectId: as.projectId === '' ? null : as.projectId }), 'Assignment saved')}>Save assignment</Button>
              {!l.clientUserId && !l.duplicate && <Button size="sm" variant="secondary" onClick={() => act.run(() => api.post(`/eb5/leads/${id}/invite-client`), 'Client invited to the portal (the invitation is in the outbox)')}>Invite client to portal</Button>}
              {l.clientUserId && <Badge s="active" label="Client portal access" />}
            </div>
          </Card>
        </div>
        <div className="cz-grid cz-grid-2 cz-mt">
          <Card title="Book a consultation">
            <form noValidate className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); act.run(() => api.post('/eb5/consultations', { leadId: id, scheduledAt: new Date(cons.at).toISOString(), timezone: cons.timezone, mode: cons.mode, kind: cons.kind, durationMin: 45 }), 'Consultation scheduled'); }}>
              <div className="cz-grid cz-grid-2">
                <TextInput label="Date and time" type="datetime-local" value={cons.at} onChange={(e) => setCons({ ...cons, at: e.target.value })} />
                <Select label="Time zone" value={cons.timezone} onChange={(e) => setCons({ ...cons, timezone: e.target.value })} options={['Asia/Kolkata', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Europe/London'].map((x) => ({ value: x, label: x }))} />
                <Select label="With" value={cons.kind} onChange={(e) => setCons({ ...cons, kind: e.target.value })} options={[{ value: 'Consultant', label: 'Consultant' }, { value: 'Attorney', label: 'Assigned attorney' }]} />
                <Select label="Mode" value={cons.mode} onChange={(e) => setCons({ ...cons, mode: e.target.value })} options={[{ value: 'Online', label: 'Online' }, { value: 'In person', label: 'In person' }]} />
              </div>
              <div><Button type="submit" size="sm" disabled={!cons.at}>Schedule</Button></div>
            </form>
          </Card>
          <Card title="Request a document & next steps">
            <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); act.run(() => api.post('/eb5/documents/request', { leadId: id, category: doc.category, title: doc.title || doc.category }), 'Document requested from the client'); }}>
              <div style={{ flex: '1 1 180px' }}><Select label="Category" value={doc.category} onChange={(e) => setDoc({ ...doc, category: e.target.value })} options={EB5_DOC_CATEGORIES.map((c) => ({ value: c, label: c }))} /></div>
              <div style={{ flex: '1 1 180px' }}><TextInput label="Title" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} /></div>
              <Button type="submit" size="sm" variant="secondary">Request</Button>
            </form>
            <div className="cz-row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {has('citrus_admin', 'business_manager', 'super_admin') && <Button size="sm" onClick={async () => { const r = await api.post<{ id: string }>('/eb5/agreements', { leadId: id }); router.push(`/eb5/agreements/${r.id}`); }}>Draft consultancy agreement</Button>}
              <Link className="cz-btn cz-btn-ghost cz-btn-sm" href={`/eb5/cases/${id}`}>Case tracking</Link>
              <Link className="cz-btn cz-btn-ghost cz-btn-sm" href={`/eb5/documents?leadId=${id}`}>Documents</Link>
            </div>
          </Card>
        </div>
        <Card title="History" className="cz-mt"><Timeline items={[...(l.history ?? [])].reverse().map((h, i) => ({ id: String(i), at: h.at, title: l.stages[h.stage], detail: h.note }))} /></Card>
      </>}
    </Screen>
  );
}

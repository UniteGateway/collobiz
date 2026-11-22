'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Eb5Notice } from '@/components/Eb5';
import { EMPTY_APPLICATION, Eb5ApplicationForm, type AppData } from '@/components/Eb5ApplicationForm';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Mine { lead: { code: string; fullName: string }; application: { id: string; code: string; status: string; data: AppData; hasPhoto: boolean } | null }

/** GO EB5 Preliminary Consultancy Application in the client portal — save as you go, submit when complete. */
export default function Eb5Apply() {
  const q = useQuery<Mine>('/eb5/applications/mine');
  const s = useQuery<{ entity: string }>('/eb5/public/info');
  const [d, setD] = useState<AppData>(EMPTY_APPLICATION);
  const [savedAt, setSavedAt] = useState('');
  useEffect(() => { if (q.data) setD(q.data.application ? { ...EMPTY_APPLICATION, ...q.data.application.data } : { ...EMPTY_APPLICATION, fullName: q.data.lead.fullName }); }, [q.data]);
  const save = useMutation(async () => { const r = await api.put<{ at: string }>('/eb5/applications/mine', { data: d }); setSavedAt(r.at); q.reload(); return r; });
  const photo = useMutation(async (file: File) => { const fd = new FormData(); fd.append('file', file); await api.upload('/eb5/applications/mine/photo', fd); q.reload(); return true; });
  const submit = useMutation(async () => { await api.put('/eb5/applications/mine', { data: d }); await api.post('/eb5/applications/mine/submit'); q.reload(); return true; });
  const ap = q.data?.application; const locked = !!ap && ap.status !== 'draft';
  const photoSlot = (
    <div className="cz-eb5-photo-slot">
      {ap?.hasPhoto ? <img src={`/api/v1/eb5/applications/${ap.id}/photo`} alt="Your passport-size photograph" /> : <span>Recent passport-size photograph<br />35 × 45 mm (optional)</span>}
      {!locked && (ap ? <label className="cz-btn cz-btn-ghost cz-btn-sm" style={{ cursor: 'pointer' }}>{ap.hasPhoto ? 'Change photo' : 'Add photo'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Passport-size photograph" onChange={(e) => { const f = e.target.files?.[0]; if (f) photo.run(f); }} /></label>
        : <small className="cz-muted">Save the draft first, then add a photo.</small>)}
      {photo.error && <small className="cz-error-text">{photo.error}</small>}
    </div>
  );
  return (
    <Screen page={{ key: 'eb5-apply', title: 'Preliminary consultancy application', access: 'authenticated' }} eyebrow="GO EB5" description="Your answers are encrypted and seen only by your GO EB5 manager and the advisors assigned to you.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : <>
        {locked && <Alert tone="success" title={`Application ${ap?.code} submitted`}>Thank you. Your manager will review it. <Link href={`/eb5/applications/${ap?.id}/print`}>View or print</Link> · <Link href="/eb5/portal">Back to your portal</Link></Alert>}
        {submit.error && <Alert tone="danger" title={submit.error}>{Object.keys(submit.fieldErrors).length ? 'Please complete the highlighted answers.' : null}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); submit.run(); }}>
          <Eb5ApplicationForm value={d} onChange={setD} errors={submit.fieldErrors} locked={locked} photoSlot={photoSlot} entity={s.data?.entity ?? 'GO EB5'} />
          {!locked && <div className="cz-row cz-eb5-actions">
            <Button type="button" variant="secondary" onClick={() => save.run()} loading={save.pending}>Save draft</Button>
            <Button type="submit" loading={submit.pending}>Submit application</Button>
            {savedAt && <span className="cz-muted" style={{ fontSize: 13 }}>Draft saved</span>}{save.error && <span className="cz-error-text">{save.error}</span>}
          </div>}
        </form>
        <Eb5Notice compact />
      </>}
    </Screen>
  );
}

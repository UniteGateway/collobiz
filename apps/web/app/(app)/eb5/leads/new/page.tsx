'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Card } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { Eb5LeadForm, leadBody, type LeadInput } from '@/components/Eb5LeadForm';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

/** Introduce a consented prospect. Duplicates are not re-registered; your claim goes to compliance. */
export default function Eb5NewLead() {
  const [done, setDone] = useState<{ id: string; code: string; duplicate: boolean; message?: string } | null>(null);
  const save = useMutation(async (f: LeadInput) => { const r = await api.post<{ id: string; code: string; duplicate: boolean; message?: string }>('/eb5/leads', leadBody(f)); setDone(r); return r; });
  return (
    <Screen page={{ key: 'eb5-lead-new', title: 'Introduce a prospect', access: 'authenticated' }} eyebrow="GO EB5 · Leads" description="Only introduce people who agreed to be contacted. Your introduction is time-stamped; you will see a general status, never their documents or finances.">
      {done ? (
        <Alert tone={done.duplicate ? 'warning' : 'success'} title={done.duplicate ? 'Already registered' : `Lead ${done.code} registered`}>
          {done.duplicate ? done.message : <>The introduction is protected from now. <Link href={`/eb5/leads/${done.id}`}>Open the lead</Link></>}
        </Alert>
      ) : <Card><Eb5LeadForm onSubmit={(f) => save.run(f)} pending={save.pending} error={save.error} fieldErrors={save.fieldErrors} submitLabel="Register introduction" /></Card>}
      <Alert tone="info">Never promise visa approval, timelines or investment returns. Any partner compensation is a separate arrangement approved by compliance.</Alert>
    </Screen>
  );
}

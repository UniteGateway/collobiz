'use client';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, DescriptionList, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useOnboarding } from '@/lib/onboarding';

interface Bank { accountHolder: string; accountMasked: string; ifsc: string; bankName: string; panMasked: string; gstRegistered: boolean; gstin: string | null; tdsSection: string | null; verified: boolean }

/** Screen 020 — Bank & Tax Profile. Account number and PAN are encrypted at rest and masked in every response. */
export default function BankTaxPage() {
  const { goNext, locked } = useOnboarding();
  const cur = useQuery<Bank | null>('/onboarding/bank-tax');
  const [f, setF] = useState({ accountHolder: '', accountNumber: '', ifsc: '', bankName: '', pan: '', gstRegistered: false, gstin: '', tdsSection: '194H' });
  const m = useMutation(async () => { await api.put('/onboarding/bank-tax', { ...f, gstin: f.gstRegistered ? f.gstin : undefined }); goNext('bank_tax'); return true; });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: k === 'ifsc' || k === 'pan' || k === 'gstin' ? e.target.value.toUpperCase() : e.target.value });
  return (
    <Screen id="020" description="Used only for approved commission settlements and statutory tax records (TDS/GST). COLLABIZ does not hold stored-value wallets.">
      {cur.data && (
        <Card title="Current details" actions={<StatusBadge status={cur.data.verified ? 'verified' : 'pending'} label={cur.data.verified ? 'Verified' : 'Pending verification'} />}>
          <DescriptionList items={[['Account holder', cur.data.accountHolder], ['Account', cur.data.accountMasked], ['Bank / IFSC', `${cur.data.bankName} · ${cur.data.ifsc}`], ['PAN', cur.data.panMasked], ['GST', cur.data.gstRegistered ? cur.data.gstin : 'Not registered'], ['TDS section', cur.data.tdsSection]]} />
        </Card>
      )}
      <Card title={cur.data ? 'Update bank & tax details' : 'Add bank & tax details'}>
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          <div className="cz-grid cz-grid-2">
            <TextInput label="Account holder name" value={f.accountHolder} onChange={set('accountHolder')} error={m.fieldErrors.accountHolder} autoComplete="off" />
            <TextInput label="Account number" inputMode="numeric" value={f.accountNumber} onChange={set('accountNumber')} error={m.fieldErrors.accountNumber} autoComplete="off" />
            <TextInput label="IFSC" value={f.ifsc} onChange={set('ifsc')} error={m.fieldErrors.ifsc} />
            <TextInput label="Bank name" value={f.bankName} onChange={set('bankName')} error={m.fieldErrors.bankName} />
            <TextInput label="PAN" value={f.pan} onChange={set('pan')} error={m.fieldErrors.pan} />
            <TextInput label="TDS section (optional)" value={f.tdsSection} onChange={set('tdsSection')} hint="194H (commission) by default — confirm with your tax advisor" />
          </div>
          <Checkbox label="My business is GST registered" checked={f.gstRegistered} onChange={(e) => setF({ ...f, gstRegistered: e.target.checked })} />
          {f.gstRegistered && <TextInput label="GSTIN" value={f.gstin} onChange={set('gstin')} error={m.fieldErrors.gstin} />}
          <div style={{ marginTop: 12 }}><Button type="submit" loading={m.pending} disabled={locked}>Save and continue</Button></div>
        </form>
      </Card>
    </Screen>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface P { saved: boolean; gstin: string; legalName: string; tradeName: string | null; address1: string; address2: string | null; city: string; pincode: string; state?: string; einvoiceApplicable: boolean; udyamNumber?: string | null }
interface Check { valid: boolean; state: string | null; pan: string | null; live: { connected: boolean; note: string } }

/** Tax profile — the GSTIN and registered address that go on GST e-invoices and e-way bills. */
export default function TaxProfile() {
  const q = useQuery<P>('/tax/profile');
  const [f, setF] = useState({ gstin: '', legalName: '', tradeName: '', address1: '', address2: '', city: '', pincode: '', einvoiceApplicable: false, udyamNumber: '' });
  const [chk, setChk] = useState<Check | null>(null);
  useEffect(() => { if (q.data) setF({ gstin: q.data.gstin ?? '', legalName: q.data.legalName ?? '', tradeName: q.data.tradeName ?? '', address1: q.data.address1 ?? '', address2: q.data.address2 ?? '', city: q.data.city ?? '', pincode: q.data.pincode ?? '', einvoiceApplicable: q.data.einvoiceApplicable, udyamNumber: q.data.udyamNumber ?? '' }); }, [q.data]);
  useEffect(() => {
    const g = f.gstin.trim();
    if (g.length !== 15) { setChk(null); return; }
    let live = true;
    api.get<Check>(`/tax/gstin/${encodeURIComponent(g)}`).then((r) => { if (live) setChk(r); }).catch(() => undefined);
    return () => { live = false; };
  }, [f.gstin]);
  const save = useMutation(async () => { const r = await api.put<P>('/tax/profile', { ...f, tradeName: f.tradeName || undefined, address2: f.address2 || undefined }); q.reload(); return r; });
  const e = save.fieldErrors;
  return (
    <Screen page={{ key: 'tax-profile', title: 'Tax profile', access: 'partner' }} description="Your GSTIN and registered address exactly as on the GST portal. They are used on e-invoices and e-way bills.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <Card>
          <form className="cz-stack" style={{ gap: 4, maxWidth: 640 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
            {save.error && <Alert tone="danger">{save.error}</Alert>}
            {!!save.data && <Alert tone="success">Saved.</Alert>}
            <TextInput label="GSTIN" value={f.gstin} maxLength={15} onChange={(ev) => setF({ ...f, gstin: ev.target.value.toUpperCase() })} error={e.gstin}
              hint={chk ? (chk.valid ? `Valid format and check digit · ${chk.state} · PAN ${chk.pan}. ${chk.live.note}` : 'Not a valid GSTIN — check the 15 characters') : '15 characters, e.g. 27ABCDE1234F1Z5'} />
            <TextInput label="Legal name (as registered)" value={f.legalName} onChange={(ev) => setF({ ...f, legalName: ev.target.value })} error={e.legalName} />
            <TextInput label="Trade name (optional)" value={f.tradeName} onChange={(ev) => setF({ ...f, tradeName: ev.target.value })} />
            <TextInput label="Registered address" value={f.address1} onChange={(ev) => setF({ ...f, address1: ev.target.value })} error={e.address1} />
            <TextInput label="Address line 2 (optional)" value={f.address2} onChange={(ev) => setF({ ...f, address2: ev.target.value })} />
            <div className="cz-grid cz-grid-2">
              <TextInput label="City" value={f.city} onChange={(ev) => setF({ ...f, city: ev.target.value })} error={e.city} />
              <TextInput label="PIN code" inputMode="numeric" maxLength={6} value={f.pincode} onChange={(ev) => setF({ ...f, pincode: ev.target.value.replace(/\D/g, '') })} error={e.pincode} />
            </div>
            <TextInput label="Udyam registration number (MSMEs, optional)" value={f.udyamNumber} onChange={(ev) => setF({ ...f, udyamNumber: ev.target.value.toUpperCase() })} error={e.udyamNumber} hint="UDYAM-XX-00-0000000 — needed to discount invoices on TReDS" />
            <label className="cz-check" style={{ margin: '6px 0 10px' }}><input type="checkbox" checked={f.einvoiceApplicable} onChange={(ev) => setF({ ...f, einvoiceApplicable: ev.target.checked })} /> Our aggregate turnover is above the e-invoicing limit (₹5 crore), so we must e-invoice B2B sales</label>
            <div><Button type="submit" loading={save.pending}>Save tax profile</Button></div>
          </form>
        </Card>
      )}
    </Screen>
  );
}

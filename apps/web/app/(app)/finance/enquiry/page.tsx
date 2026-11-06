'use client';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, LoadingState, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

/** Screen 103 — Project Finance Enquiry (consent-based introduction; disabled until regulatory review, B-09). */
export default function FinanceEnquiry() {
  const f = useQuery<any>('/meta/features');
  const [v, setV] = useState({ purpose: '', amount: '', tenor: '', consent: false });
  const m = useMutation(async () => api.post('/finance/enquiries', { purpose: v.purpose, amount: toMinor(v.amount), tenorMonths: Number(v.tenor) || undefined, consentToShare: v.consent }));
  return (
    <Screen id="103">
      {f.loading ? <LoadingState /> : !f.data?.financeIntroductions ? (
        <Alert tone="info" title="Not available yet">Project finance enquiries open after regulatory review. Nothing you enter here is shared until then.</Alert>
      ) : (
        <Card title="Tell us what you need">
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          {m.data ? <Alert tone="success">Enquiry submitted. A regulated partner will contact you with your consent.</Alert> : (
            <>
              <TextArea label="Purpose" rows={3} value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} error={m.fieldErrors.purpose} />
              <TextInput label="Amount (₹)" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} error={m.fieldErrors.amount} />
              <TextInput label="Tenor (months, optional)" inputMode="numeric" value={v.tenor} onChange={(e) => setV({ ...v, tenor: e.target.value })} />
              <Checkbox label="I consent to COLLABIZ sharing these details with a regulated finance partner" checked={v.consent} onChange={(e) => setV({ ...v, consent: e.target.checked })} />
              <Button onClick={() => m.run()} disabled={!v.consent} loading={m.pending}>Submit enquiry</Button>
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}

'use client';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, DescriptionList, Grid, Select, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { EarningsTabs, inr } from '@/components/Finance';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

/** Screen 097 — Commission Calculator (server-side calculation with the same rules as the ledger; illustration only). */
export default function Calculator() {
  const policies = useQuery<any[]>('/commissions/policies');
  const [f, setF] = useState({ dealValue: '1000000', policyId: '', rate: '2', share: '100', gst: false });
  const calc = useMutation(async () => api.post<any>('/commissions/calculate', f.policyId ? { dealValue: toMinor(f.dealValue), policyId: f.policyId, shareBps: Math.round(Number(f.share) * 100), gstRegistered: f.gst } : { dealValue: toMinor(f.dealValue), basis: 'percent', rateBps: Math.round(Number(f.rate) * 100), shareBps: Math.round(Number(f.share) * 100), gstRegistered: f.gst }));
  const r = calc.data;
  return (
    <Screen id="097">
      <EarningsTabs />
      <Card title="Calculate">
        <Grid cols={2}>
          <TextInput label="Deal value (₹)" inputMode="decimal" value={f.dealValue} onChange={(e) => setF({ ...f, dealValue: e.target.value })} error={calc.fieldErrors.dealValue} />
          <Select label="Commission policy" value={f.policyId} onChange={(e) => setF({ ...f, policyId: e.target.value })} placeholder="Custom rate" options={(policies.data ?? []).filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: `${p.name} (v${p.version})` }))} />
          {!f.policyId && <TextInput label="Rate (%)" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />}
          <TextInput label="Your share (%)" inputMode="decimal" value={f.share} onChange={(e) => setF({ ...f, share: e.target.value })} hint="For team splits; 100% if you are the sole introducer." />
        </Grid>
        <Checkbox label="My organization is GST-registered (18% GST added)" checked={f.gst} onChange={(e) => setF({ ...f, gst: e.target.checked })} />
        <Button onClick={() => calc.run()} loading={calc.pending}>Calculate</Button>
        {calc.error && <Alert tone="danger">{calc.error}</Alert>}
      </Card>
      {r && (
        <Card title="Breakdown">
          <DescriptionList items={[['Gross commission', inr(r.gross)], ['Your share', inr(r.share)], ...r.deductions.map((d: any) => [d.label, `− ${inr(d.amount)}`] as [string, string]), ['Taxable value', inr(r.taxable)], ['GST', `+ ${inr(r.gst)}`], ['TDS withheld', `− ${inr(r.tds)}`], ['Net payable to you', <strong key="n">{inr(r.payable)}</strong>]]} />
          <Alert tone="warning">{r.disclaimer}</Alert>
        </Card>
      )}
    </Screen>
  );
}

'use client';
import { Alert, Card, DataTable, DescriptionList, EmptyState, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { EarningsTabs, inr } from '@/components/Finance';
import { useQuery } from '@/lib/hooks';

/** Screen 101 — Tax / TDS / GST Records (by financial-year quarter, from settled commission). */
export default function TaxRecords() {
  const q = useQuery<any>('/tax-records');
  return (
    <Screen id="101">
      <EarningsTabs />
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          {q.data.profile ? (
            <Card title="Tax profile"><DescriptionList items={[['PAN', `•••••${q.data.profile.panLast4}`], ['GST', q.data.profile.gstRegistered ? q.data.profile.gstin ?? 'Registered' : 'Not registered'], ['TDS section', q.data.profile.tdsSection]]} /></Card>
          ) : <Alert tone="warning">Add your bank and tax details in onboarding to receive payouts.</Alert>}
          <Card title="By quarter">
            <DataTable caption="Tax by quarter" rows={q.data.quarters.map((x: any) => ({ ...x, id: x.quarter }))} empty={<EmptyState title="No settled commission yet" />} columns={[
              { key: 'quarter', header: 'Quarter' }, { key: 'taxable', header: 'Taxable value', render: (x: any) => inr(x.taxable) }, { key: 'gst', header: 'GST charged', render: (x: any) => inr(x.gst) },
              { key: 'tds', header: 'TDS deducted', render: (x: any) => inr(x.tds) }, { key: 'paid', header: 'Net received', render: (x: any) => inr(x.paid) }, { key: 'invoices', header: 'Your invoices', render: (x: any) => x.invoices.join(', ') },
            ]} />
            <p className="cz-muted" style={{ fontSize: 13 }}>{q.data.quarters[0]?.tdsCertificate ?? 'Form 16A is issued after the quarterly TDS return is filed.'}</p>
          </Card>
        </>
      )}
    </Screen>
  );
}

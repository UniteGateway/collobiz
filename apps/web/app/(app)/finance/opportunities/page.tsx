'use client';
import { Alert, Card, DataTable, LoadingState } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Screen 102 — Finance & Funding Opportunities (introductions only; disabled until regulatory review, B-09). */
export default function FinanceOpportunities() {
  const f = useQuery<any>('/meta/features');
  const q = useQuery<any[]>(f.data?.financeIntroductions ? '/finance/opportunities' : null);
  return (
    <Screen id="102">
      {f.loading ? <LoadingState /> : !f.data?.financeIntroductions ? (
        <Alert tone="info" title="Not available yet">Finance and funding introductions open after regulatory review. COLLABIZ will only introduce you to regulated lenders; it does not lend, arrange or advise on credit.</Alert>
      ) : (
        <Card title="Programmes">{q.loading ? <LoadingState /> : <DataTable caption="Finance programmes" rows={q.data ?? []} columns={[{ key: 'title', header: 'Programme' }, { key: 'provider', header: 'Provider' }, { key: 'note', header: 'Note' }]} />}</Card>
      )}
    </Screen>
  );
}

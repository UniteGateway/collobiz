'use client';
import { useParams } from 'next/navigation';
import { Button, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ReceiptSheet } from '@/components/Eb5Docs';
import { useQuery } from '@/lib/hooks';

/** A4 invoice or receipt — print or save as PDF. */
export default function Eb5Receipt() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Parameters<typeof ReceiptSheet>[0]['inv']>(`/eb5/invoices/${id}`);
  return (
    <Screen page={{ key: 'eb5-receipt', title: 'Invoice / receipt (A4)', access: 'authenticated' }} eyebrow="GO EB5" actions={<Button variant="secondary" onClick={() => window.print()}>Print / save as PDF</Button>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : <ReceiptSheet inv={q.data} />}
    </Screen>
  );
}

'use client';
import { useParams } from 'next/navigation';
import { Button, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { AgreementSheet } from '@/components/Eb5Docs';
import { useQuery } from '@/lib/hooks';

/** A4 agreement — print or save as PDF from the browser. */
export default function Eb5AgreementPrint() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Parameters<typeof AgreementSheet>[0]['ag']>(`/eb5/agreements/${id}`);
  return (
    <Screen page={{ key: 'eb5-agreement-print', title: 'Agreement (A4)', access: 'authenticated' }} eyebrow="GO EB5" actions={<Button variant="secondary" onClick={() => window.print()}>Print / save as PDF</Button>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : <AgreementSheet ag={q.data} />}
    </Screen>
  );
}

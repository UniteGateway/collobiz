'use client';
import { useParams } from 'next/navigation';
import { Button, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ApplicationSheet } from '@/components/Eb5Docs';
import { useQuery } from '@/lib/hooks';

/** A4 application — print or save as PDF from the browser. */
export default function Eb5ApplicationPrint() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Parameters<typeof ApplicationSheet>[0]['a']>(`/eb5/applications/${id}`);
  return (
    <Screen page={{ key: 'eb5-application-print', title: 'Application (A4)', access: 'authenticated' }} eyebrow="GO EB5" actions={<Button variant="secondary" onClick={() => window.print()}>Print / save as PDF</Button>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : <ApplicationSheet a={q.data} />}
    </Screen>
  );
}

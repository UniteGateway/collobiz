'use client';
import { ButtonLink, Card, DataTable, LoadingState } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { ProofHeader, type ProofMeasure } from '@/components/Ops';
import { useQuery } from '@/lib/hooks';

interface Line { key: string; label: string; count: number; detail: string; evidence: string[] }
interface Proof { name: string; city: string | null; verified: boolean; since: string; level: string; records: number; measures: ProofMeasure[]; sections: { title: string; lines: Line[] }[]; note: string }

/** Proof — performance passport built only from records both sides confirmed. */
export default function ProofPage() {
  const q = useQuery<Proof>('/proof');
  const p = q.data;
  return (
    <Screen page={{ key: 'proof', title: 'Proof — performance passport', access: 'partner' }} eyebrow="Proof"
      description="Your track record, built only from what both sides confirmed on COLLABIZ: certified milestones, paid invoices, signed contracts, accepted deliveries and micro-contracts. Nothing self-declared."
      actions={<ButtonLink href="/business-qr" variant="accent">Share via Business QR</ButtonLink>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <LoadingState /> : <>
        <ProofHeader {...p} />
        {p.sections.map((s) => (
          <Card key={s.title} title={s.title} className="cz-mt">
            <DataTable rows={s.lines.map((l) => ({ ...l, id: l.key }))} caption={s.title} columns={[
              { key: 'l', header: 'Record', render: (l) => l.label }, { key: 'c', header: 'Count', render: (l) => <strong>{l.count}</strong> },
              { key: 'd', header: 'Detail', render: (l) => l.detail }, { key: 'e', header: 'Evidence', render: (l) => (l.evidence.length ? <span className="cz-proof-ev">{l.evidence.map((e) => <code key={e}>{e}</code>)}</span> : '—') },
            ]} />
          </Card>
        ))}
        <p className="cz-muted" style={{ fontSize: 13 }}>{p.note}</p>
      </>}
    </Screen>
  );
}

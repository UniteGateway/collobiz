'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, LoadingState } from '@collabiz/ui';
import { ProofHeader, type ProofMeasure } from '@/components/Ops';
import { api } from '@/lib/api';

interface Pub { name: string; city: string | null; verified: boolean; since: string; level: string; records: number; measures: ProofMeasure[]; sections: { title: string; lines: { label: string; count: number }[] }[]; note: string }

/** Public Proof summary behind a Business QR. */
export default function PublicProof() {
  const { token } = useParams<{ token: string }>();
  const [p, setP] = useState<Pub | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.get<Pub>(`/proof/public/${encodeURIComponent(token)}`).then(setP).catch(() => setErr('This Proof link is not active. The business may have stopped sharing it.')); }, [token]);
  return (
    <div className="cz-public-proof">
      <p className="cz-muted" style={{ fontSize: 13 }}>COLLABIZ Proof · public summary</p>
      {err ? <Alert tone="warning">{err}</Alert> : !p ? <LoadingState /> : <>
        <ProofHeader {...p} />
        <div className="cz-public-proof-grid">{p.sections.map((s) => (
          <section key={s.title} aria-label={s.title}><h3>{s.title}</h3><ul>{s.lines.map((l) => <li key={l.label}><span>{l.label}</span><strong>{l.count}</strong></li>)}</ul></section>
        ))}</div>
        <p className="cz-muted" style={{ fontSize: 12.5 }}>{p.note}</p>
      </>}
      <p style={{ fontSize: 13 }}><Link href="/">What is COLLABIZ?</Link></p>
    </div>
  );
}

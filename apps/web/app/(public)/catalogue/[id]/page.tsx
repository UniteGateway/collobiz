'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { sectorName } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, ErrorState, LoadingState, Money, TextArea, TextInput } from '@collabiz/ui';
import { PublicScreen } from '@/components/PublicScreen';
import { api } from '@/lib/api';
import { useMutation, useQuery, isNotFound } from '@/lib/hooks';
import { useSession } from '@/lib/session';

/** Screen 039 — Product & Service Detail with price request. */
export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const q = useQuery<any>(`/catalog/${id}`);
  const [f, setF] = useState({ quantity: '', message: '' });
  const [ref, setRef] = useState<string | null>(null);
  const req = useMutation(async () => { const r = await api.post<{ reference: string }>(`/catalog/${id}/price-request`, f); setRef(r.reference); return r; });
  if (q.loading) return <PublicScreen id="039"><LoadingState /></PublicScreen>;
  if (q.error) return <PublicScreen id="039">{isNotFound(q.error) ? <ErrorState error="This item does not exist or is not available to your account." /> : <ErrorState error={q.error} onRetry={q.reload} />}</PublicScreen>;
  const i = q.data;
  return (
    <PublicScreen id="039" title={i.name} description={`${i.ownerName} · ${sectorName(i.sector)} · ${i.kind}`}>
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <Card title="Description">
          <p style={{ whiteSpace: 'pre-wrap' }}>{i.description}</p>
          {Object.keys(i.specs ?? {}).length > 0 && <DescriptionList items={Object.entries(i.specs).map(([k, v]) => [k, String(v)])} />}
        </Card>
        <Card title="Commercial">
          <p style={{ fontSize: 24, fontWeight: 700 }}>{i.listPrice != null ? <><Money minor={i.listPrice} currency={i.currency} />{i.unit ? <span className="cz-muted" style={{ fontSize: 14 }}> / {i.unit}</span> : null}</> : <span className="cz-muted" style={{ fontSize: 16 }}>{i.priceNote}</span>}</p>
          <p className="cz-muted" style={{ fontSize: 13 }}>Sold by {i.ownerName}. Final pricing, taxes and terms are confirmed in a written quotation.</p>
          {ref ? <Alert tone="success">Request sent. Reference <strong className="cz-mono">{ref}</strong>.</Alert> : me?.activeOrg ? (
            <form noValidate onSubmit={(e) => { e.preventDefault(); req.run(); }}>
              {req.error && <Alert tone="danger">{req.error}</Alert>}
              <TextInput label="Quantity / capacity" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} error={req.fieldErrors.quantity} />
              <TextArea label="Message (optional)" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
              <Button type="submit" loading={req.pending}>Request price / quotation</Button>
            </form>
          ) : <Link href={`/login?next=/catalogue/${id}`} className="cz-btn cz-btn-accent">Sign in to request a quotation</Link>}
        </Card>
      </div>
      {i.related?.length > 0 && <Card title="Related">{i.related.map((r: any) => <div key={r.id}><Link href={`/catalogue/${r.id}`}>{r.name}</Link></div>)}</Card>}
    </PublicScreen>
  );
}

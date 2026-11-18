'use client';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, LoadingState } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Business QR — one QR for counter, truck or card that opens the public summary of your Proof record. */
export default function BusinessQr() {
  const q = useQuery<{ name: string; level: string; records: number; share: { token: string; enabled: boolean } | null }>('/proof');
  const [qr, setQr] = useState<string | null>(null);
  const set = useMutation(async (enabled: boolean) => { await api.post('/proof/share', { enabled }); q.reload(); return true; });
  const s = q.data?.share;
  const url = s && typeof window !== 'undefined' ? `${window.location.origin}/b/${s.token}` : '';
  useEffect(() => { if (url && s?.enabled) QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#011E48' } }).then(setQr).catch(() => setQr(null)); else setQr(null); }, [url, s?.enabled]);
  return (
    <Screen page={{ key: 'business-qr', title: 'Business QR', access: 'partner' }} eyebrow="Proof" description="One QR for your counter, truck or visiting card. It opens a public summary of your Proof record — level and counts only, no amounts, customers or contact details.">
      {set.error && <Alert tone="danger">{set.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <div className="cz-grid cz-grid-2">
          <Card title={s?.enabled ? 'Your Business QR' : 'Publish your Business QR'}>
            {s?.enabled && qr ? <div className="cz-qr-card">
              <img src={qr} alt={`QR code linking to the COLLABIZ Proof record of ${q.data.name}`} width={240} height={240} />
              <p><strong>{q.data.name}</strong><br /><span className="cz-muted">{q.data.level} record · {q.data.records} confirmed records</span></p>
              <p className="cz-qr-url"><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>
              <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <a className="cz-btn cz-btn-primary" href={qr} download={`business-qr-${q.data.name.replace(/\W+/g, '-').toLowerCase()}.png`}>Download PNG</a>
                <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(url)}>Copy link</Button>
                <Button variant="ghost" onClick={() => set.run(false)} loading={set.pending}>Stop sharing</Button>
              </div>
            </div> : <div className="cz-stack" style={{ gap: 12 }}>
              <p style={{ margin: 0 }}>Publishing creates a public link to your Proof summary. You can stop sharing at any time — the link then stops working.</p>
              <div><Button onClick={() => set.run(true)} loading={set.pending}>Publish my Business QR</Button></div>
            </div>}
          </Card>
          <Card title="What people see">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Your business name, city and whether it is verified</li><li>Your Proof level and the number of confirmed records by type</li><li>On-time delivery and payment percentages</li>
            </ul>
            <p className="cz-muted" style={{ fontSize: 13 }}>Never shown: amounts, project or invoice numbers, customers, people or contact details.</p>
          </Card>
        </div>
      )}
    </Screen>
  );
}

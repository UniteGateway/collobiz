'use client';
import { Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Disclaimer } from '@/components/Energy';
import { useQuery } from '@/lib/hooks';

interface T { id: string; name: string; licenceNo: string; authority: string; state: string | null; category: string; validUntil: string; website: string | null; status: string; demo: boolean }

/** Licensed electricity traders directory. */
export default function Traders() {
  const q = useQuery<T[]>('/energy/traders');
  return (
    <Screen page={{ key: 'energy-traders', title: 'Licensed electricity traders', access: 'partner' }} eyebrow="Unite Green Park"
      description="Trading licensees with licence number, issuing authority, category and validity. Purchase of electricity for resale needs a licensed trader or an exemption.">
      <Disclaimer />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : (
        <div className="cz-card" style={{ overflowX: 'auto' }}>
          <table className="cz-table" aria-label="Licensed traders"><thead><tr><th>Trader</th><th>Licence</th><th>Authority</th><th>Category</th><th>Valid until</th><th>Status</th></tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id}><td>{t.website ? <a href={t.website} target="_blank" rel="noopener noreferrer">{t.name}</a> : t.name}</td><td className="cz-mono">{t.licenceNo}</td><td>{t.authority}{t.state ? ` · IN-${t.state}` : ''}</td><td>{t.category}</td><td>{t.validUntil}</td>
              <td><span className={`cz-badge ${t.status.startsWith('Valid') ? 'cz-badge-ok' : 'cz-badge-warn'}`}>{t.status}</span></td></tr>)}</tbody></table>
          {!q.data.length && <p className="cz-muted">No traders listed yet.</p>}
        </div>
      )}
    </Screen>
  );
}

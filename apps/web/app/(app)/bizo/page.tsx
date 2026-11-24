'use client';
import Link from 'next/link';
import { useState } from 'react';
import { appBrand, sectorName } from '@collabiz/types';
import { Alert, Button, Card, Icon, LoadingState } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Status { customers: number; restricted: number; lastExportAt: string | null; canExport: boolean; columns: string[] }

/** BIZO inside COLLABIZ — open the BIZO app, see BIZO for your industry, and move leads both ways by file. */
export default function BizoPage() {
  const b = appBrand('bizo')!;
  const s = useQuery<Status>('/bizo/status');
  const j = useQuery<{ industry: string | null }>('/join/profile');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const industry = j.data?.industry ?? null;
  const industryUrl = industry ? b.industryPages?.[industry] : undefined;
  async function download() {
    setBusy(true); setErr(null);
    try {
      const text = await api.get<string>('/bizo/export.csv');
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `collabiz-customers-for-bizo-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
      s.reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not export'); } finally { setBusy(false); }
  }
  return (
    <Screen page={{ key: 'bizo', title: 'BIZO', access: 'partner' }} eyebrow="UNITE BUSINESS INTELLIGENCE"
      description="BIZO finds buyers, markets and opportunities for your business. Use it alongside COLLABIZ and move leads between the two."
      actions={<a className="cz-btn cz-btn-accent" href={b.app!.signup} target="_blank" rel="noopener noreferrer">Start free on BIZO <Icon name="external" size={14} /></a>}>
      <div className="cz-stack" style={{ gap: 16 }}>
        <div className="cz-board-grid">
          <Card>
            <div className="cz-board-card" data-bizo-card="open">
              <h2 style={{ margin: 0 }}>Open BIZO</h2>
              <p className="cz-muted">Sign in to your BIZO workspace, or create one free.</p>
              <div className="cz-board-links">
                <a className="cz-btn cz-btn-primary cz-btn-sm" href={b.app!.login} target="_blank" rel="noopener noreferrer">Log in to BIZO</a>
                <a className="cz-btn cz-btn-ghost cz-btn-sm" href={b.website} target="_blank" rel="noopener noreferrer">bizo.one ↗</a>
              </div>
            </div>
          </Card>
          <Card>
            <div className="cz-board-card" data-bizo-card="industry">
              <h2 style={{ margin: 0 }}>BIZO for your industry</h2>
              <p className="cz-muted">{industryUrl ? `See what BIZO does for ${sectorName(industry!)}.` : 'Tell the Industry Club your industry to get a direct link.'}</p>
              <div className="cz-board-links">{industryUrl ? <a className="cz-btn cz-btn-secondary cz-btn-sm" href={industryUrl} target="_blank" rel="noopener noreferrer">Open the industry page ↗</a> : <Link className="cz-btn cz-btn-secondary cz-btn-sm" href="/board">Set my industry</Link>}</div>
            </div>
          </Card>
          <Card>
            <div className="cz-board-card" data-bizo-card="partners">
              <h2 style={{ margin: 0 }}>Offer BIZO to your clients</h2>
              <p className="cz-muted">Promote BIZO with your personal COLLABIZ partner link, or join BIZO’s own partner programme.</p>
              <div className="cz-board-links">
                <Link className="cz-btn cz-btn-secondary cz-btn-sm" href="/ventures/bizo">My BIZO partner link</Link>
                <a className="cz-btn cz-btn-ghost cz-btn-sm" href="https://bizo.one/partners" target="_blank" rel="noopener noreferrer">BIZO partners ↗</a>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <h2 style={{ marginTop: 0 }}>Move leads between BIZO and COLLABIZ</h2>
          <ol className="cz-join-how" style={{ marginTop: 8 }}>
            <li><span>1</span><strong>BIZO → COLLABIZ</strong><p>In BIZO, export your leads or buyers as CSV. In COLLABIZ, import the file as customers: you check the column mapping, duplicates are skipped, and you record the consent basis for each contact.</p><Link className="cz-btn cz-btn-secondary cz-btn-sm" href="/settings/import">Import a BIZO file</Link></li>
            <li><span>2</span><strong>COLLABIZ → BIZO</strong><p>Download your COLLABIZ customers in a BIZO-ready file ({s.data?.columns.join(', ') ?? '…'}) and import it in BIZO’s CRM.</p>
              {s.error ? <ApiErrorView error={s.error} onRetry={s.reload} /> : !s.data ? <LoadingState /> : s.data.canExport
                ? <Button size="sm" variant="secondary" onClick={download} disabled={busy}>{busy ? 'Preparing…' : `Download ${s.data.customers} customers`}</Button>
                : <p className="cz-muted">Your business owner or an admin downloads this file.</p>}
            </li>
          </ol>
          {s.data && s.data.restricted > 0 && <Alert tone="info">{s.data.restricted} of your customers have no outreach consent recorded. They are included without personal contact details, because BIZO is used for outreach.</Alert>}
          {s.data?.lastExportAt && <p className="cz-muted" style={{ fontSize: 13.5 }}>Last download {new Date(s.data.lastExportAt).toLocaleString('en-IN')}.</p>}
          {err && <Alert tone="danger">{err}</Alert>}
          <p className="cz-muted" style={{ fontSize: 13.5, marginBottom: 0 }}>Automatic sync and single sign-on will follow when BIZO’s public API launches — BIZO lists it as planned. Until then nothing moves between the two without you.</p>
        </Card>
      </div>
    </Screen>
  );
}

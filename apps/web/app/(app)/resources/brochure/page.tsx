'use client';
import { useEffect, useState } from 'react';
import { SECTORS } from '@collabiz/types';
import { Alert, Button, Icon } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import type { Asset } from '../Assets';

/** Screen 114 — Co-branded brochure generator. Your details; Unite Group branding and the footer are fixed. */
export default function Brochure() {
  const [f, setF] = useState({ headline: 'Rooftop solar for your factory', sector: 'Solar & Renewable Energy', services: 'Site survey and design\nSupply and installation\nCommissioning and net-metering' });
  const [assetId, setAssetId] = useState<string | undefined>();
  const assets = useQuery<Asset[]>('/marketing/assets', { kind: 'brochure' });
  useEffect(() => { const a = new URLSearchParams(window.location.search).get('asset'); if (a) setAssetId(a); }, []);
  useEffect(() => { const a = assets.data?.find((x) => x.id === assetId); if (a?.body) setF((x) => ({ ...x, headline: a.title.split(' — ')[0] })); }, [assetId, assets.data]);
  const gen = useMutation(async () => api.post<{ html: string; fileName: string }>('/marketing/brochure', { headline: f.headline, sector: f.sector, services: f.services.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6), assetId }));
  const download = () => {
    if (!gen.data) return;
    const url = URL.createObjectURL(new Blob([gen.data.html], { type: 'text/html' }));
    const a = document.createElement('a'); a.href = url; a.download = gen.data.fileName; a.click(); URL.revokeObjectURL(url);
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Screen id="114" title="Co-branded brochure" description="A one-page brochure with your company and verified partner badge alongside Unite Group. Open it in your browser and print or save as PDF.">
      <div className="cz-brochure">
        <form className="cz-card cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); gen.run(); }}>
          {gen.error && <Alert tone="danger">{gen.error}</Alert>}
          <label className="cz-sched-label">Headline<input className="cz-input" value={f.headline} onChange={set('headline')} maxLength={120} /></label>
          <label className="cz-sched-label">Sector<select className="cz-select" value={f.sector} onChange={set('sector')}>{SECTORS.map((s) => <option key={s.code}>{s.name}</option>)}</select></label>
          <label className="cz-sched-label">Services — one per line (up to 6)<textarea className="cz-input" rows={5} value={f.services} onChange={set('services')} /></label>
          <p className="cz-muted" style={{ fontSize: 12.5, margin: 0 }}><Icon name="lock" size={12} /> The Unite Group line and legal footer are added automatically and can’t be edited.</p>
          <Button type="submit" loading={gen.pending} disabled={f.headline.trim().length < 5 || !f.services.trim()}>{gen.data ? 'Update preview' : 'Create preview'}</Button>
        </form>
        <section className="cz-brochure-preview" aria-label="Preview">
          {gen.data ? (
            <>
              <iframe title="Brochure preview" srcDoc={gen.data.html} sandbox="" />
              <Button variant="accent" onClick={download}><Icon name="download" size={16} />Download brochure</Button>
            </>
          ) : <div className="cz-brochure-empty"><Icon name="documents" size={28} /><p>Your preview appears here.</p></div>}
        </section>
      </div>
    </Screen>
  );
}

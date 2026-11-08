'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Regional { preferences: { language: string; currency: string; timezone: string; dateStyle: string }; languages: { code: string; name: string; available: boolean }[]; rates: { currency: string; inrPerUnit: number; asOf: string; source: string }[]; note: string }
const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Africa/Nairobi', 'Africa/Lagos', 'Asia/Dhaka', 'Asia/Colombo', 'Asia/Kathmandu', 'Asia/Singapore', 'Europe/London', 'America/New_York'];

/** Screen 146 — Languages, currencies and regions. Display preferences only; money is always settled in INR. */
export default function RegionalSettings() {
  const q = useQuery<Regional>('/me/regional');
  const [p, setP] = useState<Regional['preferences'] | null>(null);
  useEffect(() => { if (q.data) setP(q.data.preferences); }, [q.data]);
  const save = useMutation(async () => { await api.put('/me/regional', p); await q.reload(); return true; });
  const d = q.data;
  const sample = p && new Date(Date.UTC(2026, 10, 18, 9, 30));
  const fmt = (dt: Date) => p!.dateStyle === 'ymd' ? dt.toISOString().slice(0, 10) : p!.dateStyle === 'mdy' ? dt.toLocaleDateString('en-US', { timeZone: p!.timezone }) : dt.toLocaleDateString('en-GB', { timeZone: p!.timezone });
  const rate = d?.rates.find((r) => r.currency === p?.currency);
  return (
    <Screen id="146" title="Language & region" description="How dates, times and amounts are shown to you.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d || !p ? <Skeleton height={300} /> : (
        <div className="cz-help">
          <form className="cz-card cz-sched" onSubmit={(e) => { e.preventDefault(); save.run(); }} style={{ gridTemplateColumns: '1fr 1fr' }}>
            {save.data && <div className="cz-sched-wide"><Alert tone="success">Saved.</Alert></div>}
            {save.error && <div className="cz-sched-wide"><Alert tone="danger">{save.error}{Object.values(save.fieldErrors).length ? ` — ${Object.values(save.fieldErrors).join('; ')}` : ''}</Alert></div>}
            <label>Language<select className="cz-select" value={p.language} onChange={(e) => setP({ ...p, language: e.target.value })}>{d.languages.map((l) => <option key={l.code} value={l.code} disabled={!l.available}>{l.name}{l.available ? '' : ' — coming soon'}</option>)}</select></label>
            <label>Show amounts in<select className="cz-select" value={p.currency} onChange={(e) => setP({ ...p, currency: e.target.value })}><option value="INR">Indian rupee (INR)</option>{d.rates.map((r) => <option key={r.currency} value={r.currency}>{r.currency}</option>)}</select></label>
            <label>Time zone<select className="cz-select" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></label>
            <label>Date format<select className="cz-select" value={p.dateStyle} onChange={(e) => setP({ ...p, dateStyle: e.target.value })}><option value="dmy">18/11/2026</option><option value="mdy">11/18/2026</option><option value="ymd">2026-11-18</option></select></label>
            <div className="cz-sched-wide"><Button type="submit" loading={save.pending} disabled={JSON.stringify(p) === JSON.stringify(d.preferences)}>Save</Button></div>
          </form>
          <section className="cz-card" aria-labelledby="pv-h">
            <h2 id="pv-h" className="cz-help-h">Preview</h2>
            <dl className="cz-sheet-facts">
              <div><dt>A date</dt><dd>{fmt(sample!)}</dd></div>
              <div><dt>A time</dt><dd>{sample!.toLocaleTimeString('en-IN', { timeZone: p.timezone, hour: 'numeric', minute: '2-digit' })}</dd></div>
              <div><dt>₹10,00,000</dt><dd>{p.currency === 'INR' || !rate ? '₹10,00,000' : `≈ ${(1_000_000 / rate.inrPerUnit).toLocaleString('en-IN', { maximumFractionDigits: 0 })} ${p.currency}`}</dd></div>
              <div><dt>Rate</dt><dd>{rate ? `1 ${rate.currency} = ₹${rate.inrPerUnit}` : '—'}</dd></div>
            </dl>
            {rate && <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Reference rate as of {new Date(rate.asOf).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {rate.source}</p>}
            <p className="cz-ai-prov"><Icon name="info" size={13} />{d.note}</p>
          </section>
        </div>
      )}
    </Screen>
  );
}

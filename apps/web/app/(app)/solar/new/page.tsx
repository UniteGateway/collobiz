'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { INDIA_STATES, SOLAR_SEGMENT_LABELS, SOLAR_SYSTEM_LABELS, type SolarQuoteCalc } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, Segmented, Select, Skeleton, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { SolarNav, kwLabel, lakh, perUnit, rupees } from '@/components/Solar';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Kit { id: string; code: string; name: string; system: string; capacityKw: number; price: number; batteryKwh: number | null }
interface Extract { monthlyUnits: number | null; amount: number | null; tariff: number | null; sanctionedLoadKw: number | null; billingMonths: number; segment: string | null; discom: string | null; consumerNo: string | null; found: string[] }
interface Preview { calc: SolarQuoteCalc; kit: Kit | null; ppaMinKw: number }
const CONSENT = [['meeting_minutes', 'In a meeting (noted in minutes)'], ['recorded_call', 'On a recorded call'], ['written_email', 'By e-mail'], ['signed_letter', 'Signed letter or form']];
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** New solar quote — customer, power bill (upload or type), solution; live price, subsidy, savings and commission. */
export default function NewSolarQuote() {
  const router = useRouter();
  const kits = useQuery<Kit[]>('/solar/kits');
  const [c, setC] = useState({ name: '', phone: '', email: '', city: '', pincode: '', consentMethod: 'meeting_minutes', consent: false, referralCode: '' });
  const [site, setSite] = useState({ segment: 'residential', region: 'IN-MH', units: '', amount: '', load: '', roof: '' });
  const [sol, setSol] = useState({ model: 'kit', system: 'on_grid', kitId: '', capacityKw: '' });
  const [bill, setBill] = useState<{ id: string; extract: Extract; message: string; readable: boolean; name: string } | null>(null);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pErr, setPErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const units = num(site.units); const amount = num(site.amount);
  const tariff = units && amount ? Math.round((amount * 100) / units) : undefined;
  const siteBody = units && tariff ? { segment: site.segment, region: site.region, monthlyUnits: Math.round(units), tariff, sanctionedLoadKw: num(site.load), roofAreaSqft: num(site.roof) } : null;
  const solBody = { model: sol.model, system: sol.model === 'ppa' ? 'on_grid' : sol.system, kitId: sol.model === 'kit' && sol.kitId ? sol.kitId : undefined, capacityKw: sol.model !== 'kit' && sol.capacityKw ? Number(sol.capacityKw) : undefined };
  const key = JSON.stringify([siteBody, solBody]);

  useEffect(() => {
    if (!siteBody) { setPreview(null); setPErr(null); return; }
    const h = setTimeout(() => {
      api.post<Preview>('/solar/preview', { site: siteBody, ...solBody }).then((r) => { setPreview(r); setPErr(null); }).catch((e) => { setPreview(null); setPErr(e instanceof Error ? e.message : 'Could not price this'); });
    }, 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const upload = useMutation(async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    const r = await api.upload<{ id: string; extract: Extract; message: string; readable: boolean }>('/solar/bills', fd);
    setBill({ ...r, name: file.name });
    const x = r.extract;
    setSite((s) => ({ ...s, units: x.monthlyUnits != null ? String(x.monthlyUnits) : s.units, amount: x.amount != null ? String(Math.round(x.amount / 100 / x.billingMonths)) : s.amount, load: x.sanctionedLoadKw != null ? String(x.sanctionedLoadKw) : s.load, segment: x.segment ?? s.segment }));
    if (x.segment && x.segment !== 'residential') setSol((s) => ({ ...s, model: 'epc' }));
    return r;
  });
  const save = useMutation(async () => {
    const r = await api.post<{ id: string }>('/solar/quotes', { customer: { name: c.name, phone: c.phone, email: c.email, city: c.city, pincode: c.pincode }, consentMethod: c.consentMethod, consent: c.consent, site: siteBody, ...solBody, billId: bill?.id, referralCode: c.referralCode || undefined });
    router.push(`/solar/quotes/${r.id}`);
    return r;
  });
  const e = save.fieldErrors;
  const kitOptions = (kits.data ?? []).filter((k) => k.system === sol.system);
  const p = preview?.calc;

  return (
    <Screen page={{ key: 'solar-new', title: 'New solar quote', access: 'verified-partner' }} description="Upload the customer’s electricity bill or type two numbers from it. The price, subsidy, savings and your commission update as you go.">
      <SolarNav />
      <div className="cz-ws-cols">
        <div className="cz-stack" style={{ gap: 16 }}>
          <Card title="1 · Electricity bill">
            <div className={`cz-drop`} data-over={over || undefined} onDragOver={(ev) => { ev.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(ev) => { ev.preventDefault(); setOver(false); const f = ev.dataTransfer.files[0]; if (f) upload.run(f); }}>
              <strong>Upload the latest bill</strong>
              <span className="cz-muted" style={{ fontSize: 13 }}>PDF from the DISCOM website or app works best. Photos are kept with the quote; type the numbers for those.</span>
              <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="Electricity bill file" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload.run(f); }} />
              {upload.pending && <span className="cz-muted">Reading the bill…</span>}
            </div>
            {upload.error && <Alert tone="danger">{upload.error}</Alert>}
            {bill && <Alert tone={bill.readable ? 'success' : 'warning'} title={bill.name}>{bill.message}{bill.extract.discom ? ` DISCOM: ${bill.extract.discom}.` : ''}{bill.extract.billingMonths > 1 ? ` Bill covers ${bill.extract.billingMonths} months — shown per month.` : ''}</Alert>}
            <div style={{ marginTop: 12 }}><Segmented label="Customer type" value={site.segment} onChange={(v) => { setSite({ ...site, segment: v }); if (v !== 'residential' && sol.model === 'kit') setSol({ ...sol, model: 'epc' }); }} options={Object.entries(SOLAR_SEGMENT_LABELS).map(([value, label]) => ({ value, label }))} /></div>
            <div className="cz-grid cz-grid-2" style={{ marginTop: 14, gap: '0 16px' }}>
              <TextInput label="Units used per month (kWh)" inputMode="numeric" value={site.units} onChange={(ev) => setSite({ ...site, units: ev.target.value.replace(/[^\d.]/g, '') })} />
              <TextInput label="Bill amount per month (₹)" inputMode="numeric" value={site.amount} onChange={(ev) => setSite({ ...site, amount: ev.target.value.replace(/[^\d.]/g, '') })} hint={tariff ? `≈ ${perUnit(tariff)} per unit` : undefined} />
              <Select label="State" value={site.region} onChange={(ev) => setSite({ ...site, region: ev.target.value })} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
              <TextInput label="Sanctioned load (kW, optional)" inputMode="decimal" value={site.load} onChange={(ev) => setSite({ ...site, load: ev.target.value.replace(/[^\d.]/g, '') })} />
              <TextInput label="Shadow-free roof area (sq ft, optional)" inputMode="numeric" value={site.roof} onChange={(ev) => setSite({ ...site, roof: ev.target.value.replace(/\D/g, '') })} />
            </div>
          </Card>

          <Card title="2 · Solution">
            <div className="cz-choice-grid" role="group" aria-label="Type of quote">
              {([['kit', 'Solar kit', 'Ready packages 1–10 kW for homes and shops; subsidy for homes.'], ['epc', 'EPC project', 'Turnkey plant of any size with an itemised bill of quantities.'], ['ppa', 'PPA — no upfront cost', `Unite Solar builds and owns the plant; the customer pays per unit. From ${preview?.ppaMinKw ?? 50} kW.`]] as const).map(([v, t, d]) => (
                <button key={v} type="button" className="cz-choice" aria-pressed={sol.model === v} onClick={() => setSol({ ...sol, model: v, kitId: '' })}><strong>{t}</strong><span>{d}</span></button>
              ))}
            </div>
            {sol.model !== 'ppa' && <div style={{ marginTop: 14 }}><Segmented label="System" value={sol.system} onChange={(v) => setSol({ ...sol, system: v, kitId: '' })} options={Object.entries(SOLAR_SYSTEM_LABELS).map(([value, label]) => ({ value, label }))} /></div>}
            <div className="cz-grid cz-grid-2" style={{ marginTop: 14, gap: '0 16px' }}>
              {sol.model === 'kit'
                ? <Select label="Kit" value={sol.kitId} placeholder="Best fit for this bill" onChange={(ev) => setSol({ ...sol, kitId: ev.target.value })} options={kitOptions.map((k) => ({ value: k.id, label: `${k.name} — ${rupees(k.price)}` }))} />
                : <TextInput label="Capacity (kW, optional)" inputMode="decimal" value={sol.capacityKw} hint={p ? `Suggested: ${kwLabel(p.recommendedKw)}` : undefined} onChange={(ev) => setSol({ ...sol, capacityKw: ev.target.value.replace(/[^\d.]/g, '') })} />}
            </div>
          </Card>

          <Card title="3 · Customer">
            {save.error && <Alert tone="danger">{save.error}</Alert>}
            <div className="cz-grid cz-grid-2" style={{ gap: '0 16px' }}>
              <TextInput label="Customer or company name" value={c.name} onChange={(ev) => setC({ ...c, name: ev.target.value })} error={e['customer.name']} />
              <TextInput label="Mobile number" inputMode="tel" value={c.phone} onChange={(ev) => setC({ ...c, phone: ev.target.value })} error={e['customer.phone']} />
              <TextInput label="E-mail (optional)" type="email" value={c.email} onChange={(ev) => setC({ ...c, email: ev.target.value })} error={e['customer.email']} />
              <TextInput label="City" value={c.city} onChange={(ev) => setC({ ...c, city: ev.target.value })} error={e['customer.city']} />
              <TextInput label="PIN code (optional)" inputMode="numeric" value={c.pincode} onChange={(ev) => setC({ ...c, pincode: ev.target.value.replace(/\D/g, '').slice(0, 6) })} error={e['customer.pincode']} />
              <TextInput label="Referral code (optional)" value={c.referralCode} onChange={(ev) => setC({ ...c, referralCode: ev.target.value.toUpperCase() })} hint="If someone referred this customer" />
              <Select label="How the customer asked for this quote" value={c.consentMethod} onChange={(ev) => setC({ ...c, consentMethod: ev.target.value })} options={CONSENT.map(([value, label]) => ({ value, label }))} />
            </div>
            <Checkbox label="The customer asked for this quote and agreed to be contacted by Unite Solar about it" checked={c.consent} onChange={(ev) => setC({ ...c, consent: ev.target.checked })} />
            {e.consent && <p className="cz-error-text">{e.consent}</p>}
          </Card>
        </div>

        <aside className="cz-ws-side cz-sticky-side" aria-live="polite">
          <Card title="Quote preview">
            {!siteBody ? <p className="cz-muted" style={{ margin: 0 }}>Enter the units and bill amount (or upload the bill) to see the system, price and savings.</p>
              : pErr ? <Alert tone="warning">{pErr}</Alert> : !p ? <Skeleton height={220} /> : (
                <div className="cz-stack" style={{ gap: 10 }}>
                  <div className="cz-figures">
                    <div className="cz-figure"><span>System</span><strong>{kwLabel(p.capacityKw)}</strong><small>{p.limits.length ? `limited by ${p.limits.join(' and ')}` : `needs ≈ ${kwLabel(p.recommendedKw)}`}</small></div>
                    {p.model === 'ppa'
                      ? <div className="cz-figure"><span>PPA tariff</span><strong>{perUnit(p.ppa!.tariff)}</strong><small>per unit for {p.ppa!.termYears} years</small></div>
                      : <div className="cz-figure"><span>Price incl. GST</span><strong>{rupees(p.total)}</strong>{p.subsidy > 0 && <small>{rupees(p.net)} after {rupees(p.subsidy)} subsidy</small>}</div>}
                    <div className="cz-figure"><span>Savings, year 1</span><strong className="cz-good">{rupees(p.savings.yearOneSavings)}</strong><small>{rupees(Math.round(p.savings.yearOneSavings / 12))} a month</small></div>
                    <div className="cz-figure"><span>{p.model === 'ppa' ? 'Upfront cost' : 'Payback'}</span><strong>{p.model === 'ppa' ? '₹0' : p.savings.paybackYears ? `${p.savings.paybackYears} years` : '—'}</strong><small>{lakh(p.savings.lifetimeSavings)} over {p.savings.years} years</small></div>
                    <div className="cz-figure"><span>Generation</span><strong>{p.savings.annualGeneration.toLocaleString('en-IN')}</strong><small>units a year · {p.savings.co2TonnesPerYear} t CO₂ avoided</small></div>
                    <div className="cz-figure"><span>Your commission</span><strong className="cz-good">{rupees(p.commission)}</strong><small>when the customer pays</small></div>
                  </div>
                  {preview?.kit && <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>{preview.kit.name}{preview.kit.batteryKwh ? ` with ${preview.kit.batteryKwh} kWh battery` : ''}.</p>}
                  <p className="cz-muted" style={{ margin: 0, fontSize: 12 }}>Estimates from typical sunshine in the state, a 3% yearly tariff rise and 0.5% yearly panel ageing. Subsidy subject to eligibility and DISCOM approval.</p>
                </div>
              )}
            <div style={{ marginTop: 14 }}><Button onClick={() => save.run()} loading={save.pending} disabled={!p || !c.name || !c.phone || !c.city || !c.consent}>Save quote</Button></div>
          </Card>
        </aside>
      </div>
    </Screen>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { INDIA_STATES } from '@collabiz/types';
import { Alert, Button, ButtonLink, Checkbox, DescriptionList, Select, Skeleton, Stepper, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { inr, lakhs, type Pkg, type UnitSummary } from '@/components/UniteSolar';

interface Territory { id: string; level: string; name: string; state: string; district: string; pincodes: string[] }
const STEPS = ['Plan', 'Location & territory', 'Your business', 'Review & submit'];
const blank = { packageCode: '', leadDnaAddon: false, state: '', district: '', city: '', pincode: '', territoryId: '', message: '' };

/** Become a partner — plan → territory → business → server price → draft → submit. Drafts can be resumed and resubmitted. */
export default function ApplyPage() {
  const router = useRouter();
  const pk = useQuery<Pkg[]>('/network/packages');
  const mine = useQuery<{ verified: boolean; units: UnitSummary[] }>('/network/mine');
  const [step, setStep] = useState(0);
  const [f, setF] = useState(blank);
  const [draft, setDraft] = useState<UnitSummary | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const code = sp.get('package'); if (code) setF((x) => ({ ...x, packageCode: code }));
    const id = sp.get('id');
    if (id) api.get<{ unit: UnitSummary; territory: { id: string } | null }>(`/network/units/${id}/dashboard`).then((d) => {
      setDraft(d.unit);
      setF({ packageCode: d.unit.packageCode, leadDnaAddon: d.unit.leadDnaAddon, state: d.unit.state, district: d.unit.district, city: d.unit.city, pincode: d.unit.pincode, territoryId: d.territory?.id ?? '', message: (d.unit as UnitSummary & { message?: string }).message ?? '' });
    }).catch(() => undefined);
  }, []);
  const p = pk.data?.find((x) => x.code === f.packageCode);
  const terr = useQuery<Territory[]>(p?.exclusive && f.state ? '/network/territories' : null, { state: f.state, level: p?.territoryLevel ?? '' });
  const set = (k: keyof typeof blank, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation(async () => {
    const b = { ...f, territoryId: p?.exclusive ? f.territoryId || undefined : undefined, leadDnaAddon: f.leadDnaAddon && !p?.leadDnaIncluded };
    const r = draft ? await api.post<UnitSummary>(`/network/applications/${draft.id}`, b) : await api.post<UnitSummary>('/network/applications', b);
    setDraft(r); setStep(3); return r;
  });
  const submit = useMutation(async () => { await api.post(`/network/applications/${draft!.id}/submit`); router.push(`/unite-solar/my?unit=${draft!.id}`); });
  const states = INDIA_STATES.map(([, n]) => ({ value: n, label: n }));
  const can = [!!p, !!(f.state && f.district && f.city && /^\d{6}$/.test(f.pincode) && (!p?.exclusive || f.territoryId)), f.message.trim().length >= 10];

  return (
    <Screen page={{ key: 'unite-solar-apply', title: 'Become a Unite Solar partner', access: 'partner' }} description="Your application is saved as a draft until you submit it. Prices are calculated by Unite’s system from the current plan.">
      {pk.error ? <ApiErrorView error={pk.error} onRetry={pk.reload} /> : !pk.data || !mine.data ? <Skeleton height={360} /> : (
        <div className="cz-stack" style={{ gap: 16, maxWidth: 760 }}>
          {!mine.data.verified && <Alert tone="warning" title="Business verification needed to submit">You can prepare a draft now. Submitting needs your KYC / KYB documents verified. <a href="/onboarding/status">Complete verification</a></Alert>}
          <Stepper steps={STEPS} current={step} />
          <section className="cz-card" aria-label={STEPS[step]}>
            {step === 0 && (
              <div className="cz-stack" style={{ gap: 12 }}>
                <Select label="Plan" value={f.packageCode} placeholder="Choose a plan" onChange={(e) => set('packageCode', e.target.value)} options={pk.data.map((x) => ({ value: x.code, label: `${x.name} — ${lakhs(x.price)} + GST` }))} />
                {p && (p.leadDnaIncluded ? <Alert tone="success">LeadDNA software licence is included with this plan.</Alert> : p.leadDnaAddonPrice != null ? (
                  <Checkbox label={`Add LeadDNA software (${lakhs(p.leadDnaAddonPrice)} + GST) — total ${lakhs(p.pricingWithLeadDna!.subtotal)} + GST`} checked={f.leadDnaAddon} onChange={(e) => set('leadDnaAddon', e.target.checked)} />
                ) : <p className="cz-muted" style={{ fontSize: 13.5 }}>Store plans use standard COLLABIZ lead capture; LeadDNA is not part of this plan.</p>)}
                {p?.inventoryEnabled && <Alert tone="info">{lakhs(p.stockAllocation)} of this plan is opening stock at partner price — allocated, invoiced and tracked in your inventory. It is stock, not profit.</Alert>}
              </div>
            )}
            {step === 1 && (
              <div className="cz-stack" style={{ gap: 12 }}>
                <div className="cz-grid cz-grid-2">
                  <Select label="State" value={f.state} placeholder="Choose" onChange={(e) => setF((x) => ({ ...x, state: e.target.value, territoryId: '' }))} options={states} />
                  <TextInput label="District" value={f.district} onChange={(e) => set('district', e.target.value)} />
                  <TextInput label="City / town" value={f.city} onChange={(e) => set('city', e.target.value)} />
                  <TextInput label="PIN code" inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} error={f.pincode && !/^\d{6}$/.test(f.pincode) ? 'Enter 6 digits' : undefined} />
                </div>
                {p?.exclusive ? (
                  !f.state ? <p className="cz-muted">Choose a state to see open {p.territoryLevel} territories.</p> : terr.loading ? <Skeleton height={60} /> : !terr.data?.length ? <Alert tone="info">No {p.territoryLevel} territory is open in {f.state} right now. Unite opens new territories regularly — contact support to register interest.</Alert> : (
                    <Select label={`Exclusive ${p.territoryLevel} territory`} value={f.territoryId} placeholder="Choose a territory"
                      onChange={(e) => { const t = terr.data!.find((x) => x.id === e.target.value); setF((x) => ({ ...x, territoryId: e.target.value, district: t?.district ?? x.district })); }}
                      options={terr.data.map((t) => ({ value: t.id, label: `${t.name} — ${t.district}${t.pincodes.length ? ` (PIN ${t.pincodes.join(', ')})` : ''}` }))} hint="Each exclusive territory goes to one partner. It is reserved for you when Unite approves your application." />
                  )
                ) : <p className="cz-muted" style={{ fontSize: 13.5 }}>Store partners serve a catchment area around their PIN code. It is not an exclusive territory.</p>}
              </div>
            )}
            {step === 2 && <TextArea label="About your business" rows={6} value={f.message} onChange={(e) => set('message', e.target.value)} hint="Experience, showroom or office, team, and how you plan to reach customers (10+ characters)." error={save.fieldErrors.message} />}
            {step === 3 && draft && (
              <div className="cz-stack" style={{ gap: 12 }}>
                <DescriptionList items={[
                  ['Plan', `${draft.packageName} (version ${draft.pricing.packageVersion})`], ['Location', `${draft.city}, ${draft.district}, ${draft.state} — ${draft.pincode}`], ['Territory', draft.territory],
                  ['Plan price', inr(draft.pricing.package)], ['LeadDNA add-on', draft.pricing.leadDnaAddon ? inr(draft.pricing.leadDnaAddon) : '—'], ['GST', draft.pricing.gstMode === 'extra' ? inr(draft.pricing.gst) : `included (${inr(draft.pricing.gstIncluded)})`],
                  ['Total payable after approval', <strong key="t">{inr(draft.pricing.total)}</strong>],
                ]} />
                <Alert tone="info">Nothing is payable now. After approval you sign the agreement and pay; your rights start only after Unite’s finance team verifies the payment.</Alert>
              </div>
            )}
            {(save.error || submit.error) && <Alert tone="danger">{save.error ?? submit.error}</Alert>}
            <div className="cz-row" style={{ gap: 8, marginTop: 16, justifyContent: 'space-between' }}>
              <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
              {step < 2 && <Button onClick={() => setStep(step + 1)} disabled={!can[step]}>Continue</Button>}
              {step === 2 && <Button onClick={() => save.run()} loading={save.pending} disabled={!can[2]}>Save draft and see price</Button>}
              {step === 3 && <div className="cz-row" style={{ gap: 8 }}><ButtonLink href="/unite-solar/my" variant="secondary">Keep as draft</ButtonLink><Button onClick={() => submit.run()} loading={submit.pending} disabled={!mine.data.verified}>Submit application</Button></div>}
            </div>
          </section>
        </div>
      )}
    </Screen>
  );
}

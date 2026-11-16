'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ASSET_LABELS, OFFER_CATEGORIES, SECTORS, isRegulatedCategory, type AssetKind } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, ChipSelect, LoadingState, Segmented, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { send } from '@/components/Collab';
import { useMutation, useQuery } from '@/lib/hooks';

const inAMonth = () => new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
/** Publish a business offer. Drafts can be saved by any business; publishing needs KYB and goes to COLLABIZ for checks. */
export default function PublishOffer() {
  const router = useRouter();
  const p = useQuery<{ assets: { id: string; kind: AssetKind; title: string }[]; verified: boolean; canEdit: boolean }>('/collab/profile');
  const [f, setF] = useState({ side: 'offering', category: 'idle_capacity', title: '', summary: '', sector: 'technology', city: '', region: '', territory: '', value: '', upfront: false, upfrontAmount: '', eligibility: '', confidential: false, uniteFirst: false, expiresOn: inAMonth(), assetIds: [] as string[] });
  const save = useMutation(async (submit: boolean) => {
    const o = await send<{ id: string }>('/business-offers', {
      category: f.category, side: f.side, title: f.title, summary: f.summary, sector: f.sector, city: f.city || undefined, region: f.region || undefined, territory: f.territory || undefined,
      estimatedValue: f.value ? Math.round(Number(f.value) * 100) : undefined, upfrontRequired: f.upfront, upfrontAmount: f.upfront && f.upfrontAmount ? Math.round(Number(f.upfrontAmount) * 100) : undefined,
      eligibility: f.eligibility || undefined, confidential: f.confidential, uniteFirstConsent: f.uniteFirst, expiresOn: f.expiresOn, assetIds: f.assetIds, submit,
    });
    router.push(`/business-offers/${o.id}`); return o;
  });
  const e = save.fieldErrors;
  const regulated = isRegulatedCategory(f.category);
  return (
    <Screen page={{ key: 'business-offers-new', title: 'Publish a business offer', access: 'partner' }} eyebrow="BUSINESS OFFERS"
      description="Offer what you have, or say what kind of partner you are seeking. COLLABIZ checks every offer before it goes live.">
      {!p.data ? <LoadingState /> : (
        <form className="cz-stack" style={{ gap: 16, maxWidth: 860 }} onSubmit={(ev) => { ev.preventDefault(); save.run(true); }} noValidate>
          {!p.data.canEdit && <Alert tone="warning">Only your business owner or an admin can publish offers.</Alert>}
          {!p.data.verified && <Alert tone="info" title="Verification needed to publish">You can save a draft now. Publishing needs your business verification (KYB) to be complete.</Alert>}
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <Card title="What is this offer?">
            <Segmented label="I am" value={f.side} onChange={(v) => setF({ ...f, side: v })} options={[{ value: 'offering', label: 'Offering something I have' }, { value: 'seeking', label: 'Seeking a partner' }]} />
            <div className="cz-grid cz-grid-2" style={{ gap: '0 12px', marginTop: 8 }}>
              <Select label="Category" value={f.category} onChange={(ev) => setF({ ...f, category: ev.target.value })} options={OFFER_CATEGORIES.map((c) => ({ value: c.code, label: c.label }))} />
              <Select label="Sector" value={f.sector} onChange={(ev) => setF({ ...f, sector: ev.target.value })} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
            </div>
            {regulated && <Alert tone="warning">This category is listed for discovery only. COLLABIZ does not arrange business sales, acquisitions or investments; interested parties continue through a licensed channel.</Alert>}
            <TextInput label="Title" placeholder={f.side === 'offering' ? 'e.g. 40 seats and 30 trained agents for customer support' : 'e.g. Seeking a distributor for solar inverters in Telangana'} value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} error={e.title} />
            <TextArea label="Describe the offer" rows={5} hint="What you offer or need, scale, timing and how you would like to work together (at least 30 characters)" value={f.summary} onChange={(ev) => setF({ ...f, summary: ev.target.value })} error={e.summary} />
            {p.data.assets.length > 0 && <ChipSelect legend="Link resources you declared (optional)" options={p.data.assets.map((a) => ({ value: a.id, label: `${a.title} (${ASSET_LABELS[a.kind]})` }))} value={f.assetIds} onChange={(v) => setF({ ...f, assetIds: v })} max={10} />}
          </Card>
          <Card title="Where and how much">
            <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
              <TextInput label="City" value={f.city} onChange={(ev) => setF({ ...f, city: ev.target.value })} />
              <TextInput label="State / region" value={f.region} onChange={(ev) => setF({ ...f, region: ev.target.value })} />
              <TextInput label="Territory (optional)" placeholder="e.g. Krishna and Guntur districts" value={f.territory} onChange={(ev) => setF({ ...f, territory: ev.target.value })} />
              <TextInput label="Indicative value (₹, optional)" inputMode="numeric" value={f.value} onChange={(ev) => setF({ ...f, value: ev.target.value.replace(/\D/g, '') })} error={e.estimatedValue} />
              <TextInput label="Offer expires on" type="date" value={f.expiresOn} onChange={(ev) => setF({ ...f, expiresOn: ev.target.value })} error={e.expiresOn} />
            </div>
            <Checkbox label="A partner must pay an upfront fee or bring capital" checked={f.upfront} onChange={(ev) => setF({ ...f, upfront: ev.target.checked, upfrontAmount: ev.target.checked ? f.upfrontAmount : '' })} />
            {f.upfront && <TextInput label="Upfront amount (₹)" inputMode="numeric" value={f.upfrontAmount} onChange={(ev) => setF({ ...f, upfrontAmount: ev.target.value.replace(/\D/g, '') })} error={e.upfrontAmount} />}
          </Card>
          <Card title="Who can apply and privacy">
            <TextArea label="Eligibility (optional)" rows={2} placeholder="Experience, licences, languages or capacity a partner needs" value={f.eligibility} onChange={(ev) => setF({ ...f, eligibility: ev.target.value })} />
            <Checkbox label="Keep my business name confidential until I accept an applicant" checked={f.confidential} onChange={(ev) => setF({ ...f, confidential: ev.target.checked })} />
            <Checkbox label="Offer Unite companies the first look (48 hours) before it is listed for all partners" checked={f.uniteFirst} onChange={(ev) => setF({ ...f, uniteFirst: ev.target.checked })} />
          </Card>
          <div className="cz-row" style={{ gap: 10 }}>
            <Button type="submit" loading={save.pending} disabled={!p.data.canEdit || !p.data.verified || !f.title || f.summary.length < 30}>Submit for checks</Button>
            <Button type="button" variant="secondary" disabled={!p.data.canEdit || !f.title || f.summary.length < 30} onClick={() => save.run(false)}>Save draft</Button>
          </div>
        </form>
      )}
    </Screen>
  );
}

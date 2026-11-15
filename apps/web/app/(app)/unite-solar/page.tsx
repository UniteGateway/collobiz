'use client';
import { COMMON_BENEFITS } from '@collabiz/types';
import { Alert, ButtonLink, Skeleton, Tag } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';
import { DISCLAIMER, inr, lakhs, pct, type Pkg } from '@/components/UniteSolar';

const LEVEL: Record<string, string> = { pincode: 'PIN-code catchment', mandal: 'Mandal', city: 'City', district: 'District' };

/** Franchise plans — the five Unite Solar partner packages side by side, priced by the server. */
export default function UniteSolarPlans() {
  const q = useQuery<Pkg[]>('/network/packages');
  return (
    <Screen page={{ key: 'unite-solar-plans', title: 'Unite Solar partner plans', access: 'authenticated' }}
      description="Become a Unite Solar franchise or store partner. Compare the plans, then apply — Unite reviews every application before any agreement or payment."
      actions={<ButtonLink href="/unite-solar/apply">Become a partner</ButtonLink>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={420} /> : (
        <div className="cz-stack" style={{ gap: 20 }}>
          <div className="cz-us-plans">
            {q.data.map((p) => (
              <section key={p.code} className="cz-card cz-us-plan" aria-label={p.name} data-plan={p.code}>
                <div><h2 style={{ margin: 0, fontSize: 17 }}>{p.name}</h2><span className="cz-muted" style={{ fontSize: 13 }}>{p.tagline}</span></div>
                <div className="cz-us-price">{lakhs(p.price)}<span className="cz-muted" style={{ fontSize: 12.5, fontWeight: 400 }}> {p.gstMode === 'extra' ? `+ ${pct(p.gstBps)} GST` : 'incl. GST'}</span></div>
                {p.inventoryEnabled && <p style={{ margin: 0, fontSize: 13.5 }}><strong>{lakhs(p.stockAllocation)} stock</strong> at partner price (allocated, invoiced and tracked) + {lakhs(p.storePackage)} store package</p>}
                <ul className="cz-check-list" style={{ fontSize: 13.5 }}>
                  <li>✓ {p.territoryLevel ? `${LEVEL[p.territoryLevel]}${p.exclusive ? ' — exclusive territory' : ' — not exclusive'}` : 'No territory'}</li>
                  <li>{p.leadDnaIncluded ? '✓ LeadDNA software included' : p.leadDnaAddonPrice != null ? `＋ LeadDNA optional: ${lakhs(p.leadDnaAddonPrice)} (total ${lakhs(p.pricingWithLeadDna!.subtotal)})` : '— LeadDNA not included (standard COLLABIZ lead capture)'}</li>
                  <li>✓ Up to {pct(p.maxProductCommissionBps)} on eligible product / kit sales</li>
                  {p.districtProfitShareBps > 0 && <li>✓ {pct(p.districtProfitShareBps)} of eligible district net profit (after costs and approved expenses)</li>}
                  {p.interFranchiseBps > 0 && <li>✓ {pct(p.interFranchiseBps)} of the eligible pool when your lead is executed by another franchise</li>}
                  {p.benefits.map((b) => <li key={b}>✓ {b}</li>)}
                  <li>✓ {p.termYears}-year term, renewable</li>
                </ul>
                <div className="cz-muted" style={{ fontSize: 12.5 }}>Payable: {inr(p.pricing.total)} incl. GST{p.pricingWithLeadDna && !p.leadDnaIncluded ? ` · with LeadDNA ${inr(p.pricingWithLeadDna.total)}` : ''}</div>
                <ButtonLink href={`/unite-solar/apply?package=${p.code}`} variant={p.code === 'district_franchise' ? 'primary' : 'secondary'}>Apply for {p.name}</ButtonLink>
              </section>
            ))}
          </div>
          <section className="cz-card" aria-label="Included with every plan">
            <h2 style={{ marginTop: 0, fontSize: 17 }}>Included with every plan</h2>
            <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }}>{COMMON_BENEFITS.map((b) => <Tag key={b}>{b}</Tag>)}</div>
          </section>
          <Alert tone="info" title="How earnings work">{DISCLAIMER} Commission rates are maximums set per product by Unite; a sale earns either your resale margin (own stock) or a commission (Unite-fulfilled), never both.</Alert>
        </div>
      )}
    </Screen>
  );
}

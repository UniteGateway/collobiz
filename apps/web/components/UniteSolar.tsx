'use client';
/** Shared pieces of the Unite Solar partner screens: types, money, the partner-record picker and status tones. */
import { useEffect, useState } from 'react';
import { Alert, ButtonLink, EmptyState, Select, Skeleton } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

export interface Pricing { package: number; leadDnaAddon: number; subtotal: number; gst: number; gstIncluded: number; total: number; gstMode: string; packageVersion?: number; packageName?: string }
export interface Pkg { code: string; name: string; tagline: string; price: number; gstMode: string; gstBps: number; leadDnaIncluded: boolean; leadDnaAddonPrice: number | null; stockAllocation: number; storePackage: number; territoryLevel: string | null; exclusive: boolean; inventoryEnabled: boolean; maxProductCommissionBps: number; districtProfitShareBps: number; interFranchiseBps: number; benefits: string[]; termYears: number; version: number; pricing: Pricing; pricingWithLeadDna: Pricing | null }
export interface UnitSummary { id: string; code: string; packageCode: string; packageName: string; status: string; statusLabel: string; city: string; district: string; state: string; pincode: string; territory: string; leadDnaAddon: boolean; pricing: Pricing; paymentStatus: string; decisionNote: string | null; createdAt: string }

export interface Product { id: string; sku: string; name: string; category: string; brand: string; hsn: string; gstBps: number; specification: string; warrantyMonths: number; mrp: number; partnerPrice: number; customerPrice: number; commissionBps: number; reorderLevel: number; serialised: boolean; imageUrl: string | null; datasheetUrl: string | null; installation: string | null }
export const inr = (p: number | null | undefined) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
export const lakhs = (p: number) => `₹${(p / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} lakh`;
export const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
export const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = {
  draft: 'neutral', applied: 'info', approved: 'info', agreement_signed: 'info', setup: 'warning', live: 'success', suspended: 'danger', rejected: 'neutral', closed: 'neutral',
  pending: 'warning', qualified: 'info', approved_c: 'info', payable: 'info', paid: 'success', reversed: 'neutral', blocked: 'danger',
  requested: 'warning', dispatched: 'info', delivered: 'info', installed: 'info', accepted: 'success', confirmed: 'info', cancelled: 'neutral', received: 'success',
  open: 'warning', assigned: 'info', in_progress: 'info', resolved: 'success', returned: 'neutral', damaged: 'danger', unpaid: 'warning', submitted: 'info', verified: 'success',
};
export const DISCLAIMER = 'Earnings depend on verified sales, payments and approvals. Unite Solar and COLLABIZ do not promise any fixed, minimum or automatic income.';

/** The caller's partner records, and the one selected by ?unit= (default: the active one, else the latest). */
export function usePartner() {
  const q = useQuery<{ verified: boolean; units: UnitSummary[] }>('/network/mine');
  const [wanted, setWanted] = useState<string | null>(null);
  useEffect(() => { setWanted(new URLSearchParams(window.location.search).get('unit')); }, []);
  const units = q.data?.units ?? [];
  const unit = units.find((u) => u.id === wanted) ?? units.find((u) => u.status === 'live') ?? units.find((u) => !['rejected', 'closed'].includes(u.status)) ?? units[0] ?? null;
  const pick = (id: string) => { setWanted(id); const u = new URL(window.location.href); u.searchParams.set('unit', id); window.history.replaceState(null, '', u); };
  return { ...q, units, unit, pick, verified: q.data?.verified ?? false };
}

/** Wraps a page that needs a partner record: loading, errors, "apply first", and a picker when there are several. */
export function PartnerGate({ p, need, children }: { p: ReturnType<typeof usePartner>; need?: (u: UnitSummary) => string | null; children: (u: UnitSummary) => React.ReactNode }) {
  if (p.error) return <ApiErrorView error={p.error} onRetry={p.reload} />;
  if (!p.data) return <Skeleton height={260} />;
  if (!p.unit) return (
    <div className="cz-card"><EmptyState icon="building" title="You are not a Unite Solar partner yet" action={<ButtonLink href="/unite-solar">Compare partner plans</ButtonLink>}>Choose a franchise or store plan and apply. Unite reviews every application before anything is signed or paid.</EmptyState></div>
  );
  const blocked = need?.(p.unit) ?? null;
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      {p.units.length > 1 && (
        <div style={{ maxWidth: 420 }}>
          <Select label="Partner record" value={p.unit.id} onChange={(e) => p.pick(e.target.value)} options={p.units.map((u) => ({ value: u.id, label: `${u.packageName} — ${u.city} (${u.statusLabel})` }))} />
        </div>
      )}
      {blocked ? <Alert tone="info">{blocked}</Alert> : children(p.unit)}
    </div>
  );
}

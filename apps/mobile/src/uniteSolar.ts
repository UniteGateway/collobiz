/** Shared pieces of the native Unite Solar partner screens. */
import { useApi } from './hooks';

export interface UnitSummary { id: string; code: string; packageCode: string; packageName: string; status: string; statusLabel: string; city: string; district: string; state: string; pincode: string; territory: string; leadDnaAddon: boolean; paymentStatus: string; decisionNote: string | null; pricing: { package: number; leadDnaAddon: number; subtotal: number; gst: number; total: number } }
export const TONE: Record<string, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  draft: 'neutral', applied: 'info', approved: 'info', agreement_signed: 'info', setup: 'warning', live: 'success', suspended: 'danger', rejected: 'neutral',
  pending: 'warning', qualified: 'info', payable: 'info', paid: 'success', reversed: 'neutral', blocked: 'danger', unpaid: 'warning', submitted: 'info', verified: 'success',
  requested: 'warning', dispatched: 'info', delivered: 'info', installed: 'info', accepted: 'success', confirmed: 'success', cancelled: 'neutral', received: 'success', returned: 'neutral', damaged: 'danger',
  open: 'warning', assigned: 'info', in_progress: 'info', resolved: 'success',
};
export const DISCLAIMER = 'Earnings depend on verified sales, payments and approvals. Unite Solar and COLLABIZ do not promise any fixed, minimum or automatic income.';
export const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
export const ACTIVE = ['approved', 'agreement_signed', 'setup', 'live'];

/** The caller's partner records; the active one (else the latest open one) is used. */
export function usePartner() {
  const q = useApi<{ verified: boolean; units: UnitSummary[] }>('/network/mine');
  const units = q.data?.units ?? [];
  const unit = units.find((u) => u.status === 'live') ?? units.find((u) => !['rejected', 'closed'].includes(u.status)) ?? units[0] ?? null;
  return { ...q, units, unit, verified: q.data?.verified ?? false };
}

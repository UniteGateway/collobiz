'use client';
import { useEffect, useState } from 'react';

/** Lead registration wizard draft (043–046). Session-only; never contains secrets. Falls back to memory if storage is blocked. */
export interface LeadDraft {
  consent: { method: string; obtainedAt: string; disclosureScope: string; notes: string };
  evidenceSummary: string;
  customer: { legalName: string; taxId: string; contactName: string; contactEmail: string; contactPhone: string; city: string; country: string };
  sector: string; productOrProject: string; quantityOrCapacity: string;
  estimatedValue: string; requirements: string; expectedCloseDate: string; urgent: boolean;
}
export const EMPTY_DRAFT: LeadDraft = {
  consent: { method: 'written_email', obtainedAt: '', disclosureScope: 'unite_and_approved_partners', notes: '' }, evidenceSummary: '',
  customer: { legalName: '', taxId: '', contactName: '', contactEmail: '', contactPhone: '', city: '', country: 'IN' },
  sector: 'solar', productOrProject: '', quantityOrCapacity: '', estimatedValue: '', requirements: '', expectedCloseDate: '', urgent: false,
};
const KEY = 'cz.leadDraft';
let memory: LeadDraft | null = null;
function read(): LeadDraft {
  try { const v = sessionStorage.getItem(KEY); if (v) return { ...EMPTY_DRAFT, ...JSON.parse(v) }; } catch { /* storage blocked */ }
  return memory ?? EMPTY_DRAFT;
}
export function clearDraft() { memory = null; try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }
export function useLeadDraft() {
  const [d, setD] = useState<LeadDraft>(EMPTY_DRAFT);
  const [ready, setReady] = useState(false);
  useEffect(() => { setD(read()); setReady(true); }, []);
  const update = (patch: Partial<LeadDraft>) => {
    const next = { ...d, ...patch };
    setD(next); memory = next;
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return { d, update, ready };
}
export const LEAD_STEPS = [
  { href: '/leads/new', label: '1. Consent & evidence', screen: '043' },
  { href: '/leads/new/customer', label: '2. Customer', screen: '044' },
  { href: '/leads/new/scope', label: '3. Products / project', screen: '045' },
  { href: '/leads/new/value', label: '4. Value & submit', screen: '046' },
];

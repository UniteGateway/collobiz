import { z } from 'zod';
import { normalizeIndianMobile } from './bulk';

/* ───────────────────── WhatsApp ───────────────────── */
/** Transactional templates (WhatsApp requires pre-approved templates; marketing messages are never sent on this channel). */
export const WHATSAPP_TEMPLATES = {
  lead_update: { label: 'Lead and dispute updates', sample: 'COLLABIZ: Your lead LD-2026-000123 was protected for 180 days. Open the app for details.' },
  payment: { label: 'Payments received or due', sample: 'COLLABIZ: ₹80,00,000 received on INV-2026-900002 (ref HDFCN52026110512345).' },
  approval: { label: 'Approvals and signatures waiting', sample: 'COLLABIZ: CTR-2026-004512 is ready for your signature.' },
  opportunity: { label: 'New opportunities matched to you', sample: 'COLLABIZ: 3 new solar opportunities in Maharashtra match your profile.' },
} as const;
export type WhatsappKind = keyof typeof WHATSAPP_TEMPLATES;
export const WHATSAPP_OPT_IN_TEXT = 'I agree to receive transactional messages from COLLABIZ on WhatsApp at this number. I can stop them at any time in Settings or by replying STOP.';
export const WhatsappPrefsSchema = z.object({
  optIn: z.boolean(),
  number: z.string().trim().optional(),
  kinds: z.array(z.enum(Object.keys(WHATSAPP_TEMPLATES) as [WhatsappKind, ...WhatsappKind[]])).default([]),
}).superRefine((v, ctx) => {
  if (v.optIn && !(v.number && normalizeIndianMobile(v.number))) ctx.addIssue({ code: 'custom', path: ['number'], message: 'Give a 10-digit Indian mobile number' });
});

/* ───────────────────── TReDS ───────────────────── */
export const UDYAM_RE = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;
export const TREDS_PLATFORMS = { rxil: 'RXIL', m1xchange: 'M1xchange', invoicemart: 'Invoicemart' } as const;
export interface TredsCheck { key: string; label: string; ok: boolean; detail: string }
/**
 * Whether an invoice looks suitable to upload on a TReDS platform. TReDS is for invoices from MSME suppliers to corporate,
 * PSU or government buyers who are registered on the same platform; the buyer must accept the invoice there. These are
 * pre-checks to save a wasted upload, not a financing decision — the platform and financiers decide.
 */
export function tredsChecks(i: { udyam: string | null; sellerGstin: string | null; buyerGstin: string | null; buyerType: string; status: string; outstanding: number; disputed: boolean; dueDate: string | null; today?: Date }): TredsCheck[] {
  const today = (i.today ?? new Date()).toISOString().slice(0, 10);
  return [
    { key: 'msme', label: 'Supplier is an MSME with a Udyam number', ok: !!i.udyam && UDYAM_RE.test(i.udyam), detail: i.udyam ? (UDYAM_RE.test(i.udyam) ? i.udyam : 'Udyam number format is UDYAM-XX-00-0000000') : 'Add your Udyam number in Tax profile' },
    { key: 'gst', label: 'Both parties have a GSTIN', ok: !!i.sellerGstin && !!i.buyerGstin, detail: !i.sellerGstin ? 'Add your GSTIN in Tax profile' : !i.buyerGstin ? 'The buyer has no GSTIN on COLLABIZ' : 'Seller and buyer GSTINs present' },
    { key: 'buyer', label: 'Buyer is a company, PSU or government body', ok: i.buyerType !== 'partner_individual', detail: i.buyerType === 'partner_individual' ? 'Invoices to individuals cannot be discounted on TReDS' : 'Eligible buyer type — the buyer must also be registered on the platform' },
    { key: 'open', label: 'Invoice is unpaid', ok: i.status !== 'paid' && i.outstanding > 0, detail: i.status === 'paid' || i.outstanding <= 0 ? 'Already paid' : 'Outstanding balance can be discounted' },
    { key: 'clean', label: 'No dispute on the invoice', ok: !i.disputed, detail: i.disputed ? 'Resolve the dispute first — buyers do not accept disputed invoices' : 'No open dispute' },
    { key: 'due', label: 'Not yet past its due date', ok: !i.dueDate || i.dueDate >= today, detail: i.dueDate ? (i.dueDate >= today ? `Due ${i.dueDate}` : `Overdue since ${i.dueDate} — platforms take invoices before the due date`) : 'No due date recorded' },
  ];
}

/* ───────────────────── Tender feeds ───────────────────── */
const SECTOR_WORDS: [string, RegExp][] = [
  ['solar', /\bsolar|photovoltaic|\bpv\b|rooftop|net[- ]?meter/i],
  ['power_equipment', /transformer|switchgear|substation|\bht\b|\blt\b panel|cable laying|electrical/i],
  ['infrastructure', /water supply|pipeline|sewer|\bstp\b|\bwtp\b|irrigation|road|bridge|highway/i],
  ['construction_epc', /construction|civil work|building|epc\b|turnkey/i],
  ['technology', /software|\bit\b services|network|data cent|computer|cctv/i],
  ['logistics', /transport(ation)? of|logistics|warehous/i],
  ['ev', /electric vehicle|\bev\b|charging station/i],
];
/** First matching sector code from the title and summary, or null for a person to choose. */
export function guessSector(text: string) {
  return SECTOR_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;
}
export const TenderLeadStatusSchema = z.object({ status: z.enum(['new', 'shortlisted', 'dismissed']) });

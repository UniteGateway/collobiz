/** V2 Phase 3 helpers: country desks (stage 11) and opportunity-to-revenue intelligence (stage 12). */
export const COUNTRY_INFO: Record<string, { currency: string; languages: string; notes: string }> = {
  AE: { currency: 'AED', languages: 'Arabic, English', notes: 'Many projects run through free-zone or mainland companies; a local sponsor or free-zone licence decides who may contract.' },
  SA: { currency: 'SAR', languages: 'Arabic, English', notes: 'Government work often needs local content and a Saudi commercial registration.' },
  BD: { currency: 'BDT', languages: 'Bengali, English', notes: 'Power and solar tenders are often donor-funded with their own procurement rules.' },
  NP: { currency: 'NPR', languages: 'Nepali, English', notes: 'Indian goods move under the India–Nepal trade treaty; check transit rules for third-country goods.' },
  LK: { currency: 'LKR', languages: 'Sinhala, Tamil, English', notes: 'Check import controls and foreign-exchange limits before quoting.' },
  KE: { currency: 'KES', languages: 'English, Swahili', notes: 'Solar products may be exempt from VAT with the right certificates; confirm with a local agent.' },
  NG: { currency: 'NGN', languages: 'English', notes: 'Form M and pre-shipment inspection apply to many imports.' },
  GB: { currency: 'GBP', languages: 'English', notes: 'Electrical products need UKCA marking for the British market.' },
  US: { currency: 'USD', languages: 'English', notes: 'Solar modules face tariffs and supply-chain documentation requirements; check before quoting.' },
  SG: { currency: 'SGD', languages: 'English, Mandarin, Malay, Tamil', notes: 'Electrical goods need registration with the safety authority before sale.' },
};

export const AGING_BUCKETS = ['Not yet due', '1–30 days overdue', '31–60 days overdue', '61–90 days overdue', 'Over 90 days overdue'] as const;
/** Outstanding receivables by how overdue they are. Amounts in paise; dates ISO. */
export function agingBuckets(rows: { outstanding: number; dueDate: string | null }[], today = new Date()) {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const out = AGING_BUCKETS.map((label) => ({ label, amount: 0, count: 0 }));
  for (const r of rows) {
    if (r.outstanding <= 0) continue;
    const days = r.dueDate ? Math.floor((t - Date.parse(r.dueDate)) / 86400000) : 0;
    const i = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    out[i].amount += r.outstanding; out[i].count++;
  }
  return out;
}

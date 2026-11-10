import { guessSector } from './channels';

/**
 * Voice-to-lead (V2 stage 09): rules that pull lead fields out of a spoken or typed description in English, Hindi or Telugu
 * (transcripts mix scripts and English words, e.g. "Pune mein 500 kW rooftop solar, budget 2 करोड़"). Every value is a
 * suggestion the person checks in the lead form; nothing is submitted from a transcript.
 */
export const VOICE_LANGUAGES = { 'en-IN': 'English', 'hi-IN': 'हिन्दी (Hindi)', 'te-IN': 'తెలుగు (Telugu)' } as const;

const CITIES: [string, RegExp][] = [
  ['Pune', /\bpune\b|पुणे|పూణే/i], ['Mumbai', /\bmumbai\b|\bbombay\b|मुंबई|ముంబై/i], ['Delhi', /\b(new )?delhi\b|दिल्ली|ఢిల్లీ/i], ['Bengaluru', /\bbengaluru\b|\bbangalore\b|बेंगलुरु|బెంగళూరు/i],
  ['Hyderabad', /\bhyderabad\b|हैदराबाद|హైదరాబాద్/i], ['Chennai', /\bchennai\b|चेन्नई|చెన్నై/i], ['Ahmedabad', /\bahmedabad\b|अहमदाबाद/i], ['Kolkata', /\bkolkata\b|कोलकाता/i],
  ['Nagpur', /\bnagpur\b|नागपुर/i], ['Nashik', /\bnashik\b|नाशिक/i], ['Jaipur', /\bjaipur\b|जयपुर/i], ['Lucknow', /\blucknow\b|लखनऊ/i], ['Surat', /\bsurat\b|सूरत/i],
  ['Vijayawada', /\bvijayawada\b|విజయవాడ/i], ['Visakhapatnam', /\b(visakhapatnam|vizag)\b|విశాఖపట్నం/i], ['Warangal', /\bwarangal\b|వరంగల్/i], ['Chakan', /\bchakan\b|चाकण/i], ['Kolhapur', /\bkolhapur\b|कोल्हापुर/i],
];
const UNIT = { lakh: 1_00_000, crore: 1_00_00_000, thousand: 1_000 } as const;
const UNIT_WORDS: [keyof typeof UNIT, RegExp][] = [
  ['crore', /^(crores?|cr|करोड़|करोड|కోట్లు|కోటి)$/i], ['lakh', /^(lakhs?|lacs?|लाख|లక్షలు|లక్ష)$/i], ['thousand', /^(thousand|k|हज़ार|हजार|వేలు|వేల)$/i],
];

/** Money said aloud: "2 crore", "80 lakh", "₹45,000", "1.5 करोड़" → paise. Takes the first amount that has a unit or a rupee sign. */
export function spokenAmount(text: string): number | null {
  const re = /(₹|rs\.?|inr|रुपये)?\s*(\d+(?:[.,]\d+)*)\s*([^\s\d.,;:]+)?/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    const n = Number(m[2].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const u = UNIT_WORDS.find(([, r]) => m![3] && r.test(m![3]))?.[0];
    if (u) return Math.round(n * UNIT[u] * 100);
    if (m[1] && n >= 1000) return Math.round(n * 100);
  }
  return null;
}

const CAPACITY = /(\d+(?:\.\d+)?)\s*(kwp|kw|mwp|mw|kva|mva|kwh|tonnes?|tons?|kl|kld|mld|units|panels|nos|pcs|sets|km|metres?|meters|sq\.? ?ft|sqm|acres?|किलोवाट|मेगावाट)\b/i;
const WHEN: [RegExp, (now: Date) => Date][] = [
  [/\b(this|is) month\b|इस महीने/i, (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))],
  [/\bnext month\b|अगले महीने|వచ్చే నెల/i, (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0))],
];
function closeDate(text: string, now: Date): string | null {
  const days = /\bwithin (\d+) days?\b|(\d+) दिन(ों)? में/i.exec(text);
  if (days) return new Date(now.getTime() + Number(days[1] ?? days[2]) * 86400000).toISOString().slice(0, 10);
  const months = /\b(?:in|within) (\d+) months?\b|(\d+) महीने में/i.exec(text);
  if (months) { const d = new Date(now); d.setUTCMonth(d.getUTCMonth() + Number(months[1] ?? months[2])); return d.toISOString().slice(0, 10); }
  for (const [re, f] of WHEN.slice(0, 2)) if (re.test(text)) return f(now).toISOString().slice(0, 10);
  return null;
}

export interface VoiceExtract { customer: string | null; city: string | null; sector: string | null; productOrProject: string | null; quantityOrCapacity: string | null; estimatedValue: number | null; expectedCloseDate: string | null; contactPhone: string | null; missing: { field: string; question: string }[] }

export function extractLead(transcript: string, now = new Date()): VoiceExtract {
  const t = transcript.replace(/\s+/g, ' ').trim();
  const city = CITIES.find(([, re]) => re.test(t))?.[0] ?? null;
  const cust = /(?:customer|client|company|for|ग्राहक|कंपनी)\s+(?:is\s+|name is\s+|का नाम\s+)?([A-Z][A-Za-z0-9&.]*(?:\s+(?:[A-Z][A-Za-z0-9&.]*|and|&))*\s+(?:Ltd|Limited|Pvt|Private|LLP|Industries|Enterprises|Traders|Engineering|Foods|Hospital|Motors|Steel|Textiles|Pharma)\b\.?(?:\s+(?:Ltd|Limited|Pvt\.?|Private))*)/.exec(t)
    ?? /\b([A-Z][A-Za-z0-9&.]*(?:\s+[A-Z][A-Za-z0-9&.]*)*\s+(?:Ltd|Limited|Pvt|Private|LLP|Industries|Enterprises|Traders|Engineering|Foods|Hospital|Motors|Steel|Textiles|Pharma)\b\.?)/.exec(t);
  const cap = CAPACITY.exec(t);
  const phone = /(?:\+91[\s-]?)?\b([6-9]\d{4}[\s-]?\d{5})\b/.exec(t);
  const sector = guessSector(t);
  const product = /(rooftop solar|solar (?:pv |power )?plant|solar water heater|solar pump|ev charging|transformer|substation|switchgear|warehouse|cold storage|water treatment|street ?lights?|inverters?|batter(?:y|ies)|panels?)/i.exec(t);
  const out: VoiceExtract = {
    customer: cust ? cust[1].replace(/\s+/g, ' ').trim() : null, city, sector,
    productOrProject: product ? `${cap ? `${cap[1]} ${cap[2]} ` : ''}${product[1].toLowerCase()}`.trim() : null,
    quantityOrCapacity: cap ? `${cap[1]} ${cap[2]}` : null, estimatedValue: spokenAmount(t), expectedCloseDate: closeDate(t, now),
    contactPhone: phone ? phone[1].replace(/[\s-]/g, '') : null, missing: [],
  };
  const ask: [keyof VoiceExtract, string, string][] = [
    ['customer', 'Customer', 'Which company is the customer?'], ['city', 'City', 'In which city is the work?'], ['sector', 'Sector', 'Which sector is it — solar, power equipment, construction…?'],
    ['productOrProject', 'Product or project', 'What exactly do they need?'], ['estimatedValue', 'Value', 'Roughly what is it worth (for example “80 lakh”)?'],
  ];
  out.missing = ask.filter(([k]) => out[k] == null).map(([, field, question]) => ({ field, question }));
  return out;
}

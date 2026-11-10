import { z } from 'zod';
import { GST_STATE_CODES, isValidGstin } from './bulk';

/**
 * GST e-invoice (IRP schema 1.1) and e-way bill (NIC bulk JSON) preparation. These build and check the JSON a business uploads
 * to the government portals (or that a GST Suvidha Provider files for it). An IRN or e-way bill number is only ever issued by
 * the government system — COLLABIZ never shows one it did not receive from there.
 */

export interface GstParty { gstin: string | null; legalName: string; tradeName?: string | null; address1: string; address2?: string | null; city: string; pincode: string; stateCode: string }
export interface GstLine { description: string; hsn: string; isService: boolean; qty: number; unit: string; unitPrice: number /* paise, excl. GST */; gstRate: number /* % */; discount?: number /* paise */ }
export interface GstDoc { type: 'INV' | 'CRN' | 'DBN'; number: string; date: string /* ISO yyyy-mm-dd */; seller: GstParty; buyer: GstParty; placeOfSupply?: string; reverseCharge?: boolean; lines: GstLine[] }
export interface GstIssue { field: string; message: string }

export const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40] as const;
/** Common units → GST Unit Quantity Codes (UQC). Anything else is "OTH". */
const UQC: Record<string, string> = { nos: 'NOS', no: 'NOS', number: 'NOS', numbers: 'NOS', pcs: 'PCS', pc: 'PCS', piece: 'PCS', pieces: 'PCS', kg: 'KGS', kgs: 'KGS', g: 'GMS', gm: 'GMS', ton: 'TON', tonne: 'TON', mt: 'TON', m: 'MTR', mtr: 'MTR', metre: 'MTR', meter: 'MTR', km: 'KME', sqm: 'SQM', 'sq m': 'SQM', sqft: 'SQF', 'sq ft': 'SQF', l: 'LTR', ltr: 'LTR', litre: 'LTR', set: 'SET', sets: 'SET', box: 'BOX', bag: 'BAG', roll: 'ROL', pair: 'PRS', unit: 'UNT', units: 'UNT', kw: 'OTH', kwp: 'OTH' };
export const toUqc = (u: string) => UQC[u.trim().toLowerCase()] ?? (/^[A-Z]{3}$/.test(u.trim()) ? u.trim() : 'OTH');
const r2 = (paise: number) => Math.round(paise) / 100;
const dmy = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
export const DOC_NO_RE = /^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$/;
export const PIN_RE = /^[1-9]\d{5}$/;
export const HSN_RE = /^\d{4}(\d{2}(\d{2})?)?$/;
export const VEHICLE_RE = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;

function checkParty(p: GstParty, who: 'Seller' | 'Buyer', issues: GstIssue[], needGstin: boolean) {
  if (needGstin || p.gstin) {
    if (!p.gstin) issues.push({ field: `${who} GSTIN`, message: 'Required' });
    else if (!isValidGstin(p.gstin)) issues.push({ field: `${who} GSTIN`, message: 'Not a valid GSTIN (format or check digit)' });
    else if (p.gstin.slice(0, 2) !== p.stateCode) issues.push({ field: `${who} state`, message: `State code ${p.stateCode} does not match the GSTIN (${p.gstin.slice(0, 2)})` });
  }
  if (!GST_STATE_CODES[p.stateCode]) issues.push({ field: `${who} state`, message: 'Unknown GST state code' });
  if (!p.legalName || p.legalName.length < 3 || p.legalName.length > 100) issues.push({ field: `${who} legal name`, message: '3–100 characters' });
  if (!p.address1 || p.address1.length < 1 || p.address1.length > 100) issues.push({ field: `${who} address`, message: '1–100 characters' });
  if (!p.city || p.city.length < 3 || p.city.length > 50) issues.push({ field: `${who} city`, message: '3–50 characters' });
  if (!PIN_RE.test(p.pincode)) issues.push({ field: `${who} PIN code`, message: 'Six digits, not starting with 0' });
}

/** Tax per line and totals. Inter-state (seller state ≠ place of supply) is IGST; otherwise CGST + SGST, half each. */
export function computeGst(doc: Pick<GstDoc, 'seller' | 'buyer' | 'placeOfSupply' | 'lines'>) {
  const pos = doc.placeOfSupply ?? doc.buyer.stateCode;
  const inter = doc.seller.stateCode !== pos;
  const lines = doc.lines.map((l) => {
    const gross = Math.round(l.qty * l.unitPrice);
    const taxable = gross - (l.discount ?? 0);
    const igst = inter ? Math.round((taxable * l.gstRate) / 100) : 0;
    const half = inter ? 0 : Math.round((taxable * l.gstRate) / 200);
    return { ...l, gross, taxable, igst, cgst: half, sgst: half, total: taxable + igst + 2 * half };
  });
  const sum = (k: 'taxable' | 'igst' | 'cgst' | 'sgst' | 'total') => lines.reduce((a, l) => a + l[k], 0);
  return { pos, inter, lines, taxable: sum('taxable'), igst: sum('igst'), cgst: sum('cgst'), sgst: sum('sgst'), total: sum('total') };
}

/** IRP e-invoice JSON (schema 1.1) and the reasons it would be rejected, checked before anyone uploads it. */
export function buildEInvoice(doc: GstDoc, today = new Date()) {
  const issues: GstIssue[] = [];
  if (!doc.buyer.gstin) issues.push({ field: 'Buyer GSTIN', message: 'E-invoices are for registered (B2B) buyers — issue a regular tax invoice to an unregistered buyer' });
  checkParty(doc.seller, 'Seller', issues, true);
  checkParty(doc.buyer, 'Buyer', issues, true);
  if (doc.seller.gstin && doc.seller.gstin === doc.buyer.gstin) issues.push({ field: 'Buyer GSTIN', message: 'Seller and buyer cannot be the same registration' });
  if (!DOC_NO_RE.test(doc.number)) issues.push({ field: 'Invoice number', message: 'Up to 16 characters: letters, digits, / and -, not starting with 0, / or -' });
  if (doc.date.slice(0, 10) > today.toISOString().slice(0, 10)) issues.push({ field: 'Invoice date', message: 'Cannot be in the future' });
  if (doc.placeOfSupply && !GST_STATE_CODES[doc.placeOfSupply]) issues.push({ field: 'Place of supply', message: 'Unknown GST state code' });
  if (!doc.lines.length) issues.push({ field: 'Items', message: 'At least one line' });
  doc.lines.forEach((l, i) => {
    const f = (x: string) => `Line ${i + 1} ${x}`;
    if (!HSN_RE.test(l.hsn)) issues.push({ field: f('HSN/SAC'), message: '4, 6 or 8 digits' });
    else if (l.isService && !l.hsn.startsWith('99')) issues.push({ field: f('HSN/SAC'), message: 'Services use a SAC code starting with 99' });
    else if (!l.isService && l.hsn.startsWith('99')) issues.push({ field: f('HSN/SAC'), message: 'A code starting with 99 is a service (SAC) — mark the line as a service or use the goods HSN' });
    if (!(GST_RATES as readonly number[]).includes(l.gstRate)) issues.push({ field: f('GST rate'), message: `Not a GST rate (${GST_RATES.join(', ')}%)` });
    if (!(l.qty > 0)) issues.push({ field: f('quantity'), message: 'Must be more than 0' });
    if (!(l.unitPrice >= 0)) issues.push({ field: f('price'), message: 'Cannot be negative' });
    if (!l.description || l.description.length < 3 || l.description.length > 300) issues.push({ field: f('description'), message: '3–300 characters' });
  });
  const c = computeGst(doc);
  const party = (p: GstParty) => ({ Gstin: p.gstin, LglNm: p.legalName, ...(p.tradeName ? { TrdNm: p.tradeName } : {}), Addr1: p.address1, ...(p.address2 ? { Addr2: p.address2 } : {}), Loc: p.city, Pin: Number(p.pincode), Stcd: p.stateCode });
  const payload = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: doc.reverseCharge ? 'Y' : 'N' },
    DocDtls: { Typ: doc.type, No: doc.number, Dt: dmy(doc.date) },
    SellerDtls: party(doc.seller),
    BuyerDtls: { ...party(doc.buyer), Pos: c.pos },
    ItemList: c.lines.map((l, i) => ({
      SlNo: String(i + 1), PrdDesc: l.description, IsServc: l.isService ? 'Y' : 'N', HsnCd: l.hsn, Qty: l.qty, Unit: toUqc(l.unit), UnitPrice: r2(l.unitPrice), TotAmt: r2(l.gross), Discount: r2(l.discount ?? 0),
      AssAmt: r2(l.taxable), GstRt: l.gstRate, IgstAmt: r2(l.igst), CgstAmt: r2(l.cgst), SgstAmt: r2(l.sgst), TotItemVal: r2(l.total),
    })),
    ValDtls: { AssVal: r2(c.taxable), CgstVal: r2(c.cgst), SgstVal: r2(c.sgst), IgstVal: r2(c.igst), TotInvVal: r2(c.total) },
  };
  return { payload, totals: c, issues, ready: issues.length === 0 };
}

export const EWAY_THRESHOLD = 50_000_00; // ₹50,000 consignment value (some states set a different intra-state limit)
export const TRANSPORT_MODES = { 1: 'Road', 2: 'Rail', 3: 'Air', 4: 'Ship' } as const;
export interface Transport { mode: 1 | 2 | 3 | 4; distanceKm: number; vehicleNo?: string | null; transporterGstin?: string | null; transporterName?: string | null }

/** E-way bill JSON (NIC bulk-generation format) for a goods consignment, with validity in days (1 day per 200 km by road). */
export function buildEwayBill(doc: GstDoc, t: Transport, today = new Date()) {
  const issues: GstIssue[] = [];
  checkParty(doc.seller, 'Seller', issues, true);
  checkParty(doc.buyer, 'Buyer', issues, false);
  if (!DOC_NO_RE.test(doc.number)) issues.push({ field: 'Document number', message: 'Up to 16 characters: letters, digits, / and -' });
  if (doc.date.slice(0, 10) > today.toISOString().slice(0, 10)) issues.push({ field: 'Document date', message: 'Cannot be in the future' });
  if (doc.lines.some((l) => l.isService || l.hsn.startsWith('99'))) issues.push({ field: 'Items', message: 'E-way bills are for goods only — remove service lines' });
  doc.lines.forEach((l, i) => { if (!HSN_RE.test(l.hsn)) issues.push({ field: `Line ${i + 1} HSN`, message: '4, 6 or 8 digits' }); });
  if (!(t.distanceKm > 0 && t.distanceKm <= 4000)) issues.push({ field: 'Distance', message: '1–4,000 km' });
  if (t.mode === 1 && t.vehicleNo && !VEHICLE_RE.test(t.vehicleNo.replace(/[\s-]/g, '').toUpperCase())) issues.push({ field: 'Vehicle number', message: 'Like MH12AB1234' });
  if (t.mode === 1 && !t.vehicleNo && !t.transporterGstin) issues.push({ field: 'Vehicle number', message: 'Give the vehicle number, or the transporter’s GSTIN so they can add it' });
  if (t.transporterGstin && !isValidGstin(t.transporterGstin)) issues.push({ field: 'Transporter GSTIN', message: 'Not a valid GSTIN' });
  const c = computeGst(doc);
  const below = c.total < EWAY_THRESHOLD;
  const payload = {
    version: '1.0.0621',
    billLists: [{
      userGstin: doc.seller.gstin, supplyType: 'O', subSupplyType: 1, docType: doc.type === 'INV' ? 'INV' : 'OTH', docNo: doc.number, docDate: dmy(doc.date),
      fromGstin: doc.seller.gstin, fromTrdName: doc.seller.tradeName || doc.seller.legalName, fromAddr1: doc.seller.address1, fromAddr2: doc.seller.address2 ?? '', fromPlace: doc.seller.city, fromPincode: Number(doc.seller.pincode), fromStateCode: Number(doc.seller.stateCode), actualFromStateCode: Number(doc.seller.stateCode),
      toGstin: doc.buyer.gstin ?? 'URP', toTrdName: doc.buyer.tradeName || doc.buyer.legalName, toAddr1: doc.buyer.address1, toAddr2: doc.buyer.address2 ?? '', toPlace: doc.buyer.city, toPincode: Number(doc.buyer.pincode), toStateCode: Number(c.pos), actualToStateCode: Number(doc.buyer.stateCode),
      transactionType: 1, totalValue: r2(c.taxable), cgstValue: r2(c.cgst), sgstValue: r2(c.sgst), igstValue: r2(c.igst), cessValue: 0, totInvValue: r2(c.total),
      transMode: t.mode, transDistance: String(Math.round(t.distanceKm)), transporterId: t.transporterGstin ?? '', transporterName: t.transporterName ?? '', vehicleNo: t.vehicleNo ? t.vehicleNo.replace(/[\s-]/g, '').toUpperCase() : '', vehicleType: 'R',
      itemList: c.lines.map((l, i) => ({ itemNo: i + 1, productName: l.description.slice(0, 100), productDesc: l.description.slice(0, 100), hsnCode: Number(l.hsn), quantity: l.qty, qtyUnit: toUqc(l.unit), taxableAmount: r2(l.taxable), cgstRate: c.inter ? 0 : l.gstRate / 2, sgstRate: c.inter ? 0 : l.gstRate / 2, igstRate: c.inter ? l.gstRate : 0, cessRate: 0 })),
    }],
  };
  return { payload, totals: c, issues, ready: issues.length === 0, belowThreshold: below, validityDays: Math.max(1, Math.ceil(t.distanceKm / 200)) };
}

export const TaxProfileSchema = z.object({
  gstin: z.string().trim().toUpperCase().refine(isValidGstin, 'Not a valid GSTIN (format or check digit)'),
  legalName: z.string().trim().min(3).max(100),
  tradeName: z.string().trim().max(100).optional(),
  address1: z.string().trim().min(3).max(100),
  address2: z.string().trim().max(100).optional(),
  city: z.string().trim().min(3).max(50),
  pincode: z.string().trim().regex(PIN_RE, 'Six digits, not starting with 0'),
  einvoiceApplicable: z.boolean().default(false),
  udyamNumber: z.string().trim().toUpperCase().regex(/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/, 'Format: UDYAM-XX-00-0000000').optional().or(z.literal('')),
});
export const GstLineSchema = z.object({ description: z.string().trim().min(3).max(300), hsn: z.string().trim().regex(HSN_RE, '4, 6 or 8 digits'), isService: z.boolean(), qty: z.number().positive(), unit: z.string().trim().min(1).max(10), unitPrice: z.number().int().min(0), gstRate: z.number() });
export const GstPrepareSchema = z.object({
  kind: z.enum(['einvoice', 'ewaybill']),
  source: z.enum(['project_invoice', 'purchase_order']),
  sourceId: z.string().uuid(),
  lines: z.array(GstLineSchema).min(1).max(100),
  placeOfSupply: z.string().regex(/^\d{2}$/).optional(),
  buyer: z.object({ address1: z.string().trim().min(1).max(100), city: z.string().trim().min(3).max(50), pincode: z.string().trim().regex(PIN_RE, 'Six digits, not starting with 0') }).optional(),
  transport: z.object({ mode: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), distanceKm: z.number().positive(), vehicleNo: z.string().trim().max(15).optional(), transporterGstin: z.string().trim().toUpperCase().optional(), transporterName: z.string().trim().max(100).optional() }).optional(),
});

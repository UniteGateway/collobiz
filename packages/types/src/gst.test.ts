import { describe, expect, it } from 'vitest';
import { gstinCheckChar } from './bulk';
import { buildEInvoice, buildEwayBill, computeGst, toUqc, type GstDoc } from './gst';

const mh2 = `27AABCV1234F1Z${gstinCheckChar('27AABCV1234F1Z')}`; // a second, valid Maharashtra GSTIN
const seller = { gstin: '27AAPFU0939F1ZV', legalName: 'Volt EPC Private Limited', address1: 'Plot 22, Hinjewadi Phase 2', city: 'Pune', pincode: '411057', stateCode: '27' };
const kaBuyer = { gstin: '29AAGCB7383J1Z4', legalName: 'Bengaluru Rooftops LLP', address1: 'Whitefield Main Road', city: 'Bengaluru', pincode: '560066', stateCode: '29' };
const doc = (over: Partial<GstDoc> = {}): GstDoc => ({ type: 'INV', number: 'INV-2026-900002', date: '2026-11-05', seller, buyer: kaBuyer, lines: [{ description: 'Electrical BoS — milestone 2', hsn: '995461', isService: true, qty: 1, unit: 'OTH', unitPrice: 2_00_00_000_00, gstRate: 18 }], ...over });
const today = new Date('2026-11-10');

describe('GST tax split', () => {
  it('inter-state is IGST; intra-state is CGST + SGST', () => {
    expect(computeGst(doc())).toMatchObject({ inter: true, pos: '29', taxable: 2_00_00_000_00, igst: 36_00_000_00, cgst: 0, total: 2_36_00_000_00 });
    const intra = computeGst(doc({ buyer: { ...kaBuyer, gstin: mh2, stateCode: '27', city: 'Mumbai', pincode: '400001' } }));
    expect(intra).toMatchObject({ inter: false, igst: 0, cgst: 18_00_000_00, sgst: 18_00_000_00 });
  });
  it('maps units to UQC', () => {
    expect([toUqc('Nos'), toUqc('kg'), toUqc('Mtr'), toUqc('kWp'), toUqc('BOX')]).toEqual(['NOS', 'KGS', 'MTR', 'OTH', 'BOX']);
  });
});

describe('e-invoice (IRP 1.1)', () => {
  it('builds the payload with rupee amounts and dd/mm/yyyy dates', () => {
    const r = buildEInvoice(doc(), today);
    expect(r.issues).toEqual([]);
    expect(r.payload).toMatchObject({ Version: '1.1', TranDtls: { SupTyp: 'B2B' }, DocDtls: { Typ: 'INV', No: 'INV-2026-900002', Dt: '05/11/2026' }, BuyerDtls: { Gstin: '29AAGCB7383J1Z4', Pos: '29', Pin: 560066 } });
    expect(r.payload.ItemList[0]).toMatchObject({ IsServc: 'Y', HsnCd: '995461', AssAmt: 20000000, GstRt: 18, IgstAmt: 3600000, TotItemVal: 23600000 });
    expect(r.payload.ValDtls).toEqual({ AssVal: 20000000, CgstVal: 0, SgstVal: 0, IgstVal: 3600000, TotInvVal: 23600000 });
  });
  it('lists every reason the portal would reject it', () => {
    const bad = buildEInvoice(doc({ number: '0INV/2026/0000000099', date: '2026-12-01', buyer: { ...kaBuyer, stateCode: '27', pincode: '056006' }, lines: [{ description: 'Panels', hsn: '9954', isService: false, qty: 0, unit: 'Nos', unitPrice: 100, gstRate: 15 }] }), today);
    expect(bad.ready).toBe(false);
    expect(bad.issues.map((i) => i.field)).toEqual(expect.arrayContaining(['Buyer state', 'Buyer PIN code', 'Invoice number', 'Invoice date', 'Line 1 HSN/SAC', 'Line 1 GST rate', 'Line 1 quantity']));
    expect(buildEInvoice(doc({ buyer: { ...kaBuyer, gstin: null } }), today).issues[0].message).toMatch(/registered \(B2B\) buyers/);
  });
});

describe('e-way bill', () => {
  const goods = doc({ number: 'PO-2026-000412', lines: [{ description: '540 Wp mono PERC panels', hsn: '85414300', isService: false, qty: 200, unit: 'Nos', unitPrice: 12_500_00, gstRate: 5 }] });
  it('builds the NIC payload, validity by distance', () => {
    const r = buildEwayBill(goods, { mode: 1, distanceKm: 840, vehicleNo: 'MH 12 AB 1234' }, today);
    expect(r.issues).toEqual([]);
    expect(r.validityDays).toBe(5);
    expect(r.belowThreshold).toBe(false);
    expect(r.payload.billLists[0]).toMatchObject({ docNo: 'PO-2026-000412', fromStateCode: 27, toStateCode: 29, vehicleNo: 'MH12AB1234', transDistance: '840', totInvValue: 2625000, igstValue: 125000 });
    expect(r.payload.billLists[0].itemList[0]).toMatchObject({ hsnCode: 85414300, qtyUnit: 'NOS', igstRate: 5, cgstRate: 0 });
  });
  it('refuses services, bad vehicles and missing transport details; flags small consignments', () => {
    expect(buildEwayBill(doc(), { mode: 1, distanceKm: 10, vehicleNo: 'MH12AB1234' }, today).issues.map((i) => i.field)).toContain('Items');
    expect(buildEwayBill(goods, { mode: 1, distanceKm: 5000, vehicleNo: 'XYZ' }, today).issues.map((i) => i.field)).toEqual(['Distance', 'Vehicle number']);
    expect(buildEwayBill(goods, { mode: 1, distanceKm: 20 }, today).issues[0].message).toMatch(/transporter/);
    const small = { ...goods, lines: [{ ...goods.lines[0], qty: 1 }] };
    expect(buildEwayBill(small, { mode: 1, distanceKm: 20, vehicleNo: 'MH12AB1234' }, today).belowThreshold).toBe(true);
  });
});

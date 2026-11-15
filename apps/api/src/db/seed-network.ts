/**
 * Unite Solar Franchise Network demo data. Packages are Unite's supplied starting configuration. Products, territories and
 * the Deccan store are DEMONSTRATION data (marked as such) — replace the catalogue with Unite's approved price list.
 */
import { eq } from 'drizzle-orm';
import { DEFAULT_PACKAGES, packagePrice } from '@collabiz/types';
import type { Db } from './client';
import * as s from './schema';
import type { SeedRefs } from './seed';

const L = 100_000_00, R = 100; // ₹1 lakh, ₹1 in paise
const DEMO = 'Demo catalogue entry — replace with Unite Solar’s approved price list.';
export const NETWORK_PRODUCTS = [
  ['US-PV-545', 'Mono PERC 545 Wp solar module', 'pv_module', '8541', 1200, 'Mono PERC half-cut, 545 Wp, 21.1% efficiency, 144 cells', 300, 15_500, 13_200, 12_000, 800, 20, true],
  ['US-INV-5K', '5 kW on-grid string inverter', 'on_grid_inverter', '8504', 1800, 'Single phase, 2 MPPT, Wi-Fi monitoring', 60, 58_000, 49_000, 44_500, 800, 4, true],
  ['US-HYB-5K', '5 kW hybrid inverter', 'hybrid_inverter', '8504', 1800, '48 V battery input, 2 MPPT, backup output', 60, 92_000, 82_000, 74_500, 700, 2, true],
  ['US-BAT-5K', '5 kWh LiFePO4 battery', 'battery', '8507', 1800, '51.2 V, 100 Ah, 6000 cycles at 80% DoD', 120, 1_45_000, 1_28_000, 1_16_000, 600, 2, true],
  ['US-MMS-1K', 'Rooftop mounting structure (per kW)', 'mounting', '7308', 1800, 'Hot-dip galvanised, elevated, 150 km/h wind', 120, 9_500, 8_200, 7_500, 800, 10, false],
  ['US-CAB-4', '4 sq mm DC solar cable (100 m)', 'cable', '8544', 1800, 'TÜV 2PfG 1169, UV resistant', 120, 7_800, 6_900, 6_250, 800, 6, false],
  ['US-DB-1P', 'ACDB / DCDB set, single phase', 'acdb_dcdb', '8537', 1800, 'SPD, MCB, fuse, IP65 enclosure', 24, 8_800, 7_600, 6_900, 800, 6, false],
  ['US-LA-1', 'Lightning arrester with earthing kit', 'protection', '8535', 1800, 'Copper-bonded, 3 m chemical earthing', 24, 6_500, 5_600, 5_100, 800, 6, false],
  ['US-KIT-3K', '3 kW rooftop on-grid kit', 'rooftop_kit', '8541', 1200, '6 × 545 Wp modules, 3 kW inverter, structure, cables, ACDB/DCDB, earthing', 60, 1_95_000, 1_72_000, 1_56_000, 900, 2, false],
  ['US-KIT-50K', '50 kW commercial rooftop kit', 'commercial_kit', '8541', 1200, '92 × 545 Wp modules, 50 kW three-phase inverter, BOS', 60, 24_50_000, 21_40_000, 19_50_000, 600, 0, false],
  ['US-SL-30', '30 W all-in-one solar street light', 'street_light', '9405', 1200, 'Lithium battery, motion sensor, 3-night autonomy', 24, 14_500, 12_400, 11_200, 900, 5, false],
  ['US-PUMP-3', '3 HP solar water pump set', 'water_pump', '8413', 1200, 'Submersible, VFD controller, 3 kWp array design', 60, 2_10_000, 1_86_000, 1_69_000, 700, 1, false],
  ['US-EV-7', '7.4 kW AC EV charger', 'ev_charger', '8504', 1800, 'Type 2, OCPP 1.6J, RFID', 24, 52_000, 45_000, 40_800, 800, 2, true],
  ['US-ALD-SPD', 'Surge protection device, Type 2', 'allied', '8536', 1800, '40 kA, 600 V DC', 24, 3_200, 2_750, 2_500, 900, 10, false],
] as const;

export async function networkDemo(db: Db, refs: SeedRefs) {
  await db.insert(s.franchisePackages).values(DEFAULT_PACKAGES.map((c) => ({ code: c.code, version: 1, config: c }))).onConflictDoNothing();
  const products = await db.insert(s.solarProducts).values(NETWORK_PRODUCTS.map(([sku, name, category, hsn, gstBps, specification, warrantyMonths, mrp, customer, partner, commissionBps, reorderLevel, serialised]) => ({
    sku, name, category, brand: 'Unite Solar', hsn, gstBps, specification, warrantyMonths, mrp: mrp * R, customerPrice: customer * R, partnerPrice: partner * R, commissionBps, reorderLevel, serialised, installation: DEMO,
  }))).onConflictDoNothing().returning();
  const T = (level: string, name: string, state: string, district: string, pincodes: string[]) => ({ level, name, state, district, pincodes, exclusive: true, createdBy: refs.users.uniteAdmin });
  await db.insert(s.franchiseTerritories).values([
    T('mandal', 'Ghatkesar mandal', 'Telangana', 'Medchal-Malkajgiri', ['501301', '500088']),
    T('mandal', 'Shamshabad mandal', 'Telangana', 'Rangareddy', ['501218']),
    T('city', 'Warangal city', 'Telangana', 'Hanumakonda', ['506001', '506002', '506003']),
    T('city', 'Hubballi city', 'Karnataka', 'Dharwad', ['580020', '580021', '580023']),
    T('district', 'Nalgonda district', 'Telangana', 'Nalgonda', []),
    T('district', 'Guntur district', 'Andhra Pradesh', 'Guntur', []),
  ]);
  await db.insert(s.demoMaterials).values([
    { name: 'Unite Solar display stand', kind: 'display_stand', ownership: 'company_owned', unitValue: 18_000_00, maxPerPartner: 2 },
    { name: 'Sample 545 Wp panel (cut-section)', kind: 'sample_panel', ownership: 'returnable', unitValue: 9_000_00, maxPerPartner: 1 },
    { name: 'Live inverter demo board', kind: 'inverter_demo', ownership: 'returnable', unitValue: 45_000_00, maxPerPartner: 1 },
    { name: 'Shop-front display board', kind: 'display_board', ownership: 'partner_owned', unitValue: 6_500_00, chargeable: true, maxPerPartner: 2 },
    { name: 'Printed brochures (pack of 500)', kind: 'brochure', ownership: 'partner_owned', unitValue: 0, maxPerPartner: 20 },
    { name: 'Product catalogue booklet (pack of 50)', kind: 'catalogue', ownership: 'partner_owned', unitValue: 0, maxPerPartner: 10 },
  ]);

  // Deccan Distributors: an active Store Partner — With Stock, with its opening stock received and one sale from stock.
  const pkg = DEFAULT_PACKAGES.find((p) => p.code === 'store_with_stock')!;
  const pricing = { ...packagePrice(pkg, false), packageVersion: 1, packageName: pkg.name };
  const [u] = await db.insert(s.franchiseUnits).values({
    code: 'US-DEMO-01', brandOrgId: refs.orgs.uniteSolar, franchiseeOrgId: refs.orgs.deccan, format: pkg.code, city: 'Peenya, Bengaluru', region: 'Karnataka', district: 'Bengaluru Urban', pincode: '560058',
    message: 'Electrical distributor with a showroom in Peenya; wants to add solar kits. (Demo record.)', status: 'live', packageCode: pkg.code, packageVersion: 1, pricing, exclusive: false, termYears: 3,
    territory: 'Catchment around PIN 560058', fee: pricing.subtotal, royaltyBps: 0, paymentStatus: 'verified', paymentReference: 'bank_transfer:DEMO-UTR-0001', paymentAmount: pricing.total, paymentVerifiedBy: refs.users.finance,
    appliedBy: refs.users.deepak, decidedBy: refs.users.uniteAdmin, openedAt: new Date(), agreementStarts: '2026-10-01', agreementEnds: '2029-09-30',
    checklist: { site: '2026-09-20', agreement: '2026-09-28', fee: '2026-09-29', stock: '2026-10-01', training: '2026-10-01', branding: '2026-10-01', launch: '2026-10-02' },
  }).returning();
  const by = (sku: string) => products.find((p) => p.sku === sku)!;
  const lines = [['US-KIT-3K', 1], ['US-PV-545', 12], ['US-INV-5K', 1], ['US-MMS-1K', 3], ['US-CAB-4', 2], ['US-SL-30', 1], ['US-ALD-SPD', 2]].map(([sku, qty]) => {
    const p = by(sku as string);
    return { productId: p.id, sku: p.sku, name: p.name, qty: qty as number, unitCost: p.partnerPrice, gstBps: p.gstBps, serials: p.serialised ? Array.from({ length: qty as number }, (_, i) => `${p.sku}-D${String(i + 1).padStart(4, '0')}`) : [] };
  });
  const value = lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
  if (value > pkg.stockAllocation) throw new Error('Demo allocation exceeds the stock entitlement');
  await db.insert(s.stockAllocations).values({ unitId: u.id, number: 'SA-DEMO-0001', invoiceNumber: 'US-INV-SA-DEMO-0001', lines, value, gst: lines.reduce((a, l) => a + Math.round((l.qty * l.unitCost * l.gstBps) / 10000), 0), status: 'received', receivedAt: new Date('2026-10-01'), createdBy: refs.users.uniteAdmin });
  const sold = { 'US-PV-545': 6, 'US-MMS-1K': 1 } as Record<string, number>;
  for (const l of lines) {
    const out = sold[l.sku] ?? 0;
    await db.insert(s.storeInventory).values({ unitId: u.id, productId: l.productId, qty: l.qty - out, value: (l.qty - out) * l.unitCost });
    await db.insert(s.inventoryMovements).values({ unitId: u.id, productId: l.productId, kind: 'allocation_received', qty: l.qty, unitCost: l.unitCost, reference: 'SA-DEMO-0001 / US-INV-SA-DEMO-0001', serials: l.serials, createdBy: refs.users.deepak });
    if (out) await db.insert(s.inventoryMovements).values({ unitId: u.id, productId: l.productId, kind: 'sale', qty: -out, unitCost: l.unitCost, reference: 'US-SO-DEMO-01', createdBy: refs.users.deepak });
  }
  const saleLines = Object.entries(sold).map(([sku, qty]) => { const p = by(sku); return { productId: p.id, item: p.name, sku, qty, unitPrice: p.customerPrice, gstBps: p.gstBps, partnerPrice: p.partnerPrice, earning: { kind: 'margin', base: qty * p.customerPrice, bps: 0, amount: qty * (p.customerPrice - p.partnerPrice) } }; });
  const sub = saleLines.reduce((a, l) => a + l.qty * l.unitPrice, 0), gst = saleLines.reduce((a, l) => a + Math.round((l.qty * l.unitPrice * l.gstBps) / 10000), 0);
  await db.insert(s.franchiseOrders).values({ unitId: u.id, number: 'US-SO-DEMO-01', kind: 'sale', customerName: 'Demo customer (Peenya workshop)', pincode: '560058', orderDate: '2026-11-04', lines: saleLines, subtotal: sub, gst, total: sub + gst, status: 'delivered', fulfilment: 'from_stock', createdBy: refs.users.deepak, history: [{ at: new Date().toISOString(), by: refs.users.deepak, to: 'delivered', status: 'delivered', note: 'Sold from store stock' }] });
  await db.update(s.franchiseUnits).set({ checklist: u.checklist }).where(eq(s.franchiseUnits.id, u.id));
  // Powertek products: a default seller commission for the demo only (Unite sets real rates per product line in the admin desk).
  const [pt] = await db.select({ id: s.organizations.id }).from(s.organizations).where(eq(s.organizations.displayName, 'Powertek')).limit(1);
  if (pt) await db.insert(s.productCommissionRules).values({ brandOrgId: pt.id, productLine: null, category: null, rateBps: 200, note: 'Demo default rate — Unite to confirm real rates', updatedBy: refs.users.uniteAdmin }).onConflictDoNothing();
  console.log('Unite Solar network demo in place');
}

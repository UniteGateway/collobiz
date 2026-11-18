/**
 * Demo data for Capacity, Micro-contracts and Demand pools. Every row is flagged `demo` and labelled as sample data;
 * dates are relative to the day the seed runs. Idempotent: does nothing once demo rows exist.
 */
import { eq } from 'drizzle-orm';
import type { Db } from './client';
import * as s from './schema';
import type { SeedRefs } from './seed';

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const D = 'Demo — sample data for testing. ';
export async function collabOpsDemo(db: Db, refs: SeedRefs) {
  const [have] = await db.select({ id: s.capacityOffers.id }).from(s.capacityOffers).where(eq(s.capacityOffers.demo, true)).limit(1);
  if (have || !refs.orgs.volt || !refs.orgs.deccan || !refs.orgs.sunrise) return;
  const { volt, deccan, sunrise } = refs.orgs; const by = refs.users.asha ?? Object.values(refs.users)[0];
  await db.insert(s.capacityOffers).values([
    { orgId: volt, type: 'workers', title: 'Certified solar installation crew', units: 12, fromDate: day(3), toDate: day(46), rateUnit: 'negotiable', rate: null, state: 'TG', city: 'Hyderabad', notes: D + 'Twelve trained installers with safety kit.', demo: true, createdBy: by },
    { orgId: deccan, type: 'sqft', title: 'Covered warehouse space, Hubballi', units: 3200, fromDate: day(-3), toDate: day(86), rateUnit: 'month', rate: 18, state: 'KA', city: 'Hubballi', notes: D + 'Racking and two loading docks.', demo: true, createdBy: by },
    { orgId: deccan, type: 'vehicles', title: 'Light commercial vehicles with drivers', units: 2, fromDate: day(-1), toDate: day(56), rateUnit: 'day', rate: 2500, state: 'KA', city: 'Hubballi', notes: D + 'Tata Ace class, local deliveries.', demo: true, createdBy: by },
    { orgId: sunrise, type: 'seats', title: 'Calling seats with headsets, Ahmedabad', units: 8, fromDate: day(1), toDate: day(60), rateUnit: 'day', rate: 650, state: 'GJ', city: 'Ahmedabad', notes: D + 'Second shift available.', demo: true, createdBy: by },
  ]);
  const hist = [{ status: 'open', at: new Date().toISOString(), by }];
  await db.insert(s.microContracts).values([
    { code: 'MIC-2026-300001', orgId: volt, kind: 'site_survey', state: 'MH', title: 'Rooftop survey of 4 warehouses in Chakan', scope: D + 'Visit four warehouse rooftops, record shading, sheet type, purlin spacing and access.', acceptance: 'Photos from four corners, measurements and a one-page note per site', quantity: 4, unit: 'sites', priceRs: 6000, due: day(6), history: hist, demo: true, createdBy: by },
    { code: 'MIC-2026-300002', orgId: sunrise, kind: 'calling', state: 'GJ', title: '150 calls to electrical contractors in Ahmedabad', scope: D + 'Call contractors from the shared list, introduce the new cable range and note interest.', acceptance: 'Call log with outcome for every number', quantity: 150, unit: 'calls', priceRs: 3000, due: day(3), history: hist, demo: true, createdBy: by },
    { code: 'MIC-2026-300003', orgId: deccan, kind: 'quotation', state: 'KA', title: 'BOQ and quotation for a 100 kW rooftop', scope: D + 'Prepare a bill of quantities and priced quotation from the drawings provided.', acceptance: 'BOQ spreadsheet and quotation PDF', quantity: 1, unit: 'quotation', priceRs: 4500, due: day(4), history: hist, demo: true, createdBy: by },
  ]).onConflictDoNothing();
  const [p1] = await db.insert(s.demandPools).values({ code: 'POOL-2026-500001', orgId: deccan, title: 'String inverters 50 kW three-phase', spec: D + '50 kW three-phase string inverters, BIS listed, 5-year warranty, Wi-Fi monitoring.', unit: 'units', state: 'KA', targetQty: 120, joinBy: day(10), demo: true, createdBy: by }).onConflictDoNothing().returning();
  const [p2] = await db.insert(s.demandPools).values({ code: 'POOL-2026-500002', orgId: sunrise, title: 'Copper armoured cable 4C × 16 sq mm', spec: D + '1.1 kV XLPE copper armoured cable, IS 7098, drums of 500 m, delivery to Pune and Ahmedabad.', unit: 'metres', state: 'MH', targetQty: 20000, joinBy: day(17), demo: true, createdBy: by }).onConflictDoNothing().returning();
  if (p1) await db.insert(s.poolMembers).values({ poolId: p1.id, orgId: deccan, qty: 40, createdBy: by });
  if (p2) await db.insert(s.poolMembers).values([{ poolId: p2.id, orgId: sunrise, qty: 6000, createdBy: by }, { poolId: p2.id, orgId: volt, qty: 4500, createdBy: by }]);
}

/**
 * Demo data for Unite Green Park: sample plants and buyer requirements from the demo businesses, and two demo trader
 * entries. Every row is flagged `demo` and labelled "DEMO — NOT VERIFIED"; none describes a real plant, buyer, tariff or
 * licence. Idempotent: inserts only what is missing.
 */
import { eq } from 'drizzle-orm';
import type { Db } from './client';
import * as s from './schema';
import type { SeedRefs } from './seed';

const D = 'DEMO — NOT VERIFIED. Sample listing for testing the energy marketplace; not an actual plant, buyer or tariff offer. ';
export async function energyDemo(db: Db, refs: SeedRefs) {
  const [have] = await db.select({ id: s.energyListings.id }).from(s.energyListings).where(eq(s.energyListings.demo, true)).limit(1);
  if (have || !refs.orgs.volt) return;
  const by = refs.users.asha ?? Object.values(refs.users)[0];
  const plant = (code: string, org: string, category: string, title: string, state: string, district: string, source: string, stage: string, mw: number, avail: number | null, tariff: number | null, ppa: number | null, models: string[], desc: string) =>
    ({ code, side: 'plant', category, orgId: refs.orgs[org], title, state, district, source, stage, capacityMw: mw, availableMw: avail, tariffRsKwh: tariff, ppaYears: ppa, models, description: D + desc, status: 'live', demo: true, createdBy: by });
  const buyer = (code: string, org: string, title: string, state: string, district: string, mw: number, tariff: number, target: number | null, ppa: number, models: string[], desc: string, priv: Record<string, unknown>) =>
    ({ code, side: 'buyer', category: 'solar_required', orgId: refs.orgs[org], title, state, district, source: 'solar', capacityMw: mw, tariffRsKwh: tariff, targetRsKwh: target, ppaYears: ppa, models, description: D + desc, confidential: true, private: priv, status: 'live', demo: true, createdBy: by });
  await db.insert(s.energyListings).values([
    plant('UGP-2026-200001', 'volt', 'solar_parks', '100 MW solar park capacity — Rajasthan', 'RJ', 'Jodhpur', 'solar', 'planned', 100, null, null, null, ['open_access', 'captive'], 'Land-ready solar park capacity for open-access and captive buyers.'),
    plant('UGP-2026-200002', 'volt', 'open_access_ppa', '40 MW solar power available — Andhra Pradesh', 'AP', 'Kurnool', 'solar', 'operational', 40, 40, 4.2, 25, ['open_access', 'group_captive'], 'Operational plant with capacity for open-access PPAs.'),
    plant('UGP-2026-200003', 'meera', 'hybrid', '30 MW hybrid power available — Tamil Nadu', 'TN', 'Tirunelveli', 'hybrid', 'construction', 30, 30, 4.6, 20, ['group_captive'], 'Solar + wind hybrid under construction; group-captive participation open.'),
    plant('UGP-2026-200004', 'volt', 'solar_plant_sale', '25 MW solar plant for sale — Uttar Pradesh', 'UP', 'Jhansi', 'solar', 'operational', 25, null, null, null, ['third_party'], 'Operational asset offered for sale; data room after NDA.'),
    plant('UGP-2026-200005', 'deccan', 'wind', '20 MW wind power available — Karnataka', 'KA', 'Chitradurga', 'wind', 'operational', 30, 20, 3.9, 15, ['open_access', 'third_party'], 'Wind capacity available for open-access buyers.'),
    plant('UGP-2026-200006', 'deccan', 'bess', '20 MW battery storage project — Madhya Pradesh', 'MP', 'Rewa', 'bess', 'planned', 20, null, null, null, ['third_party'], 'Standalone battery storage project seeking offtakers.'),
    plant('UGP-2026-200007', 'sunrise', 'open_access_ppa', '12 MW solar power available — Gujarat', 'GJ', 'Kutch', 'solar', 'operational', 12, 12, 4.0, 15, ['open_access'], 'Open-access solar for Gujarat industrial consumers.'),
    buyer('UGP-2026-200101', 'sunrise', '15 MW solar power required — Telangana', 'TG', 'Medak', 15, 8.1, 6.0, 15, ['open_access'], 'Industrial buyer seeking competitive open-access solar.', { company: 'Demo Textile Mills (demo)', industry: 'Textiles', discom: 'TGSPDCL', consumerCategory: 'HT-I industrial', openAccessEligible: true, storageRequired: false }),
    buyer('UGP-2026-200102', 'deccan', '12 MW renewable power required — Maharashtra', 'MH', 'Pune', 12, 9.1, 6.5, 20, ['group_captive', 'open_access'], 'Auto-components cluster seeking group-captive renewable power.', { company: 'Demo Auto Components (demo)', industry: 'Automotive', discom: 'MSEDCL', consumerCategory: 'HT-I industrial', openAccessEligible: true, storageRequired: true }),
    buyer('UGP-2026-200103', 'meera', '8 MW solar power required — Odisha', 'OR', 'Khordha', 8, 6.9, null, 10, ['open_access'], 'Food-processing unit seeking daytime solar.', { company: 'Demo Foods (demo)', industry: 'Food processing', discom: 'TPCODL', consumerCategory: 'HT industrial', openAccessEligible: true, storageRequired: false }),
    buyer('UGP-2026-200104', 'sunrise', '10 MW solar power required — Andhra Pradesh', 'AP', 'Visakhapatnam', 10, 7.65, 6.0, 15, ['open_access', 'third_party'], 'Steel-processing unit seeking open-access solar.', { company: 'Demo Steel Processing (demo)', industry: 'Steel', discom: 'APEPDCL', consumerCategory: 'HT-I industrial', openAccessEligible: true, storageRequired: false }),
  ] as never);
  await db.insert(s.energyTraders).values([
    { name: 'Demo Power Trading Co. (DEMO — NOT VERIFIED)', licenceNo: 'DEMO/CERC/TL/0001', authority: 'CERC', category: 'Category I (inter-state)', validUntil: '2030-03-31', demo: true, createdBy: by },
    { name: 'Demo State Energy Traders (DEMO — NOT VERIFIED)', licenceNo: 'DEMO/SERC/AP/0007', authority: 'SERC', state: 'AP', category: 'Intra-state', validUntil: '2028-03-31', demo: true, createdBy: by },
  ]).onConflictDoNothing();
}

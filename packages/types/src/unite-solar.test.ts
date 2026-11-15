import { describe, expect, it } from 'vitest';
import { DEFAULT_PACKAGES, SolarProductSchema, districtProfitShare, interFranchiseCommission, investmentCommission, lineEarning, packagePrice, solarParkSplit, territoryConflicts, validatePackage, type TerritoryLike } from './unite-solar';

const pk = (c: string) => DEFAULT_PACKAGES.find((p) => p.code === c)!;
const L = 100_000_00;
describe('Unite Solar packages — acceptance prices (before GST)', () => {
  it('1–3: Basic ₹2 L, Master ₹5 L, District ₹10 L with LeadDNA included', () => {
    expect(packagePrice(pk('basic_franchise'), false).subtotal).toBe(2 * L);
    expect(packagePrice(pk('master_franchise'), false).subtotal).toBe(5 * L);
    const d = packagePrice(pk('district_franchise'), true);
    expect(d.subtotal).toBe(10 * L); expect(d.leadDnaAddon).toBe(0); expect(pk('district_franchise').leadDnaIncluded).toBe(true);
  });
  it('4–5: Basic + LeadDNA ₹7 L, Master + LeadDNA ₹10 L', () => {
    expect(packagePrice(pk('basic_franchise'), true).subtotal).toBe(7 * L);
    expect(packagePrice(pk('master_franchise'), true).subtotal).toBe(10 * L);
  });
  it('6–7: stock store ₹5 L = ₹4 L stock + ₹1 L package; non-stock store ₹1.5 L; stores cannot buy LeadDNA here', () => {
    const s = pk('store_with_stock');
    expect(packagePrice(s, false).subtotal).toBe(5 * L); expect(s.stockAllocation + s.storePackage).toBe(5 * L); expect(s.stockAllocation).toBe(4 * L);
    expect(packagePrice(pk('store_without_stock'), false).subtotal).toBe(1.5 * L);
    expect(() => packagePrice(s, true)).toThrow(/not offered/);
  });
  it('GST is shown separately (extra) or inside the price (included), as configured', () => {
    expect(packagePrice(pk('basic_franchise'), false)).toMatchObject({ gst: 36_000_00, total: 2_36_000_00 });
    const inc = packagePrice({ ...pk('basic_franchise'), gstMode: 'included' }, false);
    expect(inc.total).toBe(2 * L); expect(inc.gstIncluded).toBe(Math.round(2 * L - 2 * L / 1.18));
  });
  it('the defaults are internally consistent; bad configurations are rejected', () => {
    for (const p of DEFAULT_PACKAGES) expect(validatePackage(p)).toEqual([]);
    expect(validatePackage({ ...pk('store_with_stock'), stockAllocation: 3 * L })).toContain('Stock allocation + store package must equal the package price');
    expect(validatePackage({ ...pk('basic_franchise'), maxProductCommissionBps: 1200 })).toContain('Product commission cannot exceed 10%');
  });
});

describe('Earnings rules', () => {
  const product = { partnerPrice: 90_000_00, customerPrice: 1_00_000_00, commissionBps: 800 };
  it('10: product commission never exceeds the 10% cap; own-stock sales earn the margin instead (no double earning)', () => {
    expect(lineEarning({ qty: 2, unitPrice: 1_00_000_00 }, product, 'unite', 1000)).toEqual({ kind: 'commission', base: 2_00_000_00, bps: 800, amount: 16_000_00 });
    expect(lineEarning({ qty: 1, unitPrice: 1_00_000_00 }, { ...product, commissionBps: 1500 }, 'unite', 1000).bps).toBe(1000);
    expect(lineEarning({ qty: 1, unitPrice: 1_00_000_00 }, product, 'unite', 500).bps).toBe(500);
    expect(lineEarning({ qty: 2, unitPrice: 1_00_000_00 }, product, 'from_stock', 1000)).toEqual({ kind: 'margin', base: 2_00_000_00, bps: 0, amount: 20_000_00 });
  });
  it('products: margin over 10% or prices out of order are rejected', () => {
    const base = { sku: 'PV-540-BF', name: '540 Wp bifacial module', category: 'pv_module', brand: 'Unite', hsn: '85414300', gstBps: 1200, specification: 'Mono PERC bifacial 540 Wp', warrantyMonths: 300, mrp: 16_000_00, commissionBps: 800 };
    expect(SolarProductSchema.safeParse({ ...base, partnerPrice: 13_000_00, customerPrice: 15_000_00 }).success).toBe(false);
    expect(SolarProductSchema.safeParse({ ...base, partnerPrice: 13_600_00, customerPrice: 15_000_00 }).success).toBe(true);
    expect(SolarProductSchema.safeParse({ ...base, partnerPrice: 13_600_00, customerPrice: 15_000_00, commissionBps: 1100 }).success).toBe(false);
  });
  it('district share is 25% of distributable net profit, never of revenue, never negative', () => {
    expect(districtProfitShare({ revenue: 50 * L, directCosts: 35 * L, approvedExpenses: 5 * L }, 2500)).toEqual({ distributable: 10 * L, amount: 2.5 * L });
    expect(districtProfitShare({ revenue: 10 * L, directCosts: 12 * L, approvedExpenses: 0 }, 2500).amount).toBe(0);
  });
  it('inter-franchise 12.5% applies to the eligible pool; solar park ≤2% split; investment 2% of realised', () => {
    expect(interFranchiseCommission(2 * L, 1250)).toBe(25_000_00);
    expect(solarParkSplit(500 * L, 200, [{ orgId: 'a', bps: 120 }, { orgId: 'b', bps: 80 }]).map((x) => x.amount)).toEqual([6 * L, 4 * L]);
    expect(() => solarParkSplit(500 * L, 250, [])).toThrow(/2%/);
    expect(() => solarParkSplit(500 * L, 200, [{ orgId: 'a', bps: 150 }, { orgId: 'b', bps: 80 }])).toThrow(/exceed the project pool/);
    expect(investmentCommission(100 * L, 200)).toBe(2 * L);
    expect(() => investmentCommission(100 * L, 300)).toThrow();
  });
  it('13: exclusive territories cannot overlap by PIN code or district; non-exclusive store catchments never conflict', () => {
    const t = (id: string, o: Partial<TerritoryLike>): TerritoryLike => ({ id, level: 'mandal', state: 'AP', district: 'Prakasam', pincodes: ['523101'], exclusive: true, status: 'available', ...o });
    const mine = t('new', { pincodes: ['523101', '523102'] });
    expect(territoryConflicts(mine, [t('x', { status: 'allocated', unitId: 'u2', pincodes: ['523102'] })], 'u1')).toHaveLength(1);
    expect(territoryConflicts(mine, [t('d', { status: 'reserved', unitId: 'u2', level: 'district', pincodes: [] })], 'u1')).toHaveLength(1);
    expect(territoryConflicts(mine, [t('y', { status: 'allocated', unitId: 'u2', pincodes: ['523200'] })], 'u1')).toHaveLength(0);
    expect(territoryConflicts({ ...mine, exclusive: false }, [t('x', { status: 'allocated', unitId: 'u2', pincodes: ['523102'] })], 'u1')).toHaveLength(0);
  });
});

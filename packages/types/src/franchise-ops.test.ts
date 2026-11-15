import { describe, expect, it } from 'vitest';
import { FranchiseOrderSchema, ORDER_NEXT, franchiseFlags, orderTotals, royaltyFor } from './franchise-property';

describe('franchise operations', () => {
  it('order totals: net per line, GST per line, total', () => {
    expect(orderTotals([{ item: '3 kW rooftop kit', qty: 2, unitPrice: 1_50_000_00, gstBps: 1200 }, { item: 'Installation', qty: 1, unitPrice: 20_000_00, gstBps: 1800 }]))
      .toEqual({ subtotal: 3_20_000_00, gst: 36_000_00 + 3_600_00, total: 3_20_000_00 + 39_600_00 });
  });
  it('royalty is on sales net of GST, with 18% GST on the royalty', () => {
    expect(royaltyFor(10_00_000_00, 300)).toEqual({ royalty: 30_000_00, gst: 5_400_00, total: 35_400_00 });
  });
  it('sale orders need a customer; GST rates are the legal slabs', () => {
    expect(FranchiseOrderSchema.safeParse({ kind: 'sale', orderDate: '2026-11-01', lines: [{ item: 'Kit', qty: 1, unitPrice: 100, gstBps: 1200 }] }).success).toBe(false);
    expect(FranchiseOrderSchema.safeParse({ kind: 'purchase', orderDate: '2026-11-01', lines: [{ item: 'Kit', qty: 1, unitPrice: 100, gstBps: 1500 }] }).success).toBe(false);
  });
  it('only the brand confirms and dispatches purchase orders; only the unit receives them', () => {
    expect(ORDER_NEXT.purchase.placed.find((x) => x.to === 'confirmed')!.by).toBe('brand');
    expect(ORDER_NEXT.purchase.dispatched[0]).toEqual({ to: 'received', by: 'unit' });
  });
  it('flags renewal, unclosed months and low sales', () => {
    const t = new Date('2026-11-15T00:00:00Z');
    const f = franchiseFlags({ status: 'live', agreementEnds: '2027-01-10', monthlyTarget: 100, lastMonthSales: 50, lastReportedMonth: '2026-09' }, t).map((x) => x.key);
    expect(f).toEqual(['renewal', 'report', 'target']);
    expect(franchiseFlags({ status: 'live', agreementEnds: '2026-10-01', lastReportedMonth: '2026-10' }, t).map((x) => x.key)).toEqual(['expired']);
  });
});

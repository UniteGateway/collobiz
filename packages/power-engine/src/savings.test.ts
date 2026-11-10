import { describe, expect, it } from 'vitest';
import { ILLUSTRATIVE_CONSUMER as C, presentBill, proposedBill, savings } from './savings';

describe('Module 9 — industrial savings', () => {
  it('rebuilds the present bill from ToD energy, demand, duty and fixed charges', () => {
    const b = presentBill(C);
    const energy = 6e6 * (0.22 * 8.6 + 0.58 * 7.4 + 0.2 * 6.6);
    expect(b.energy).toBeCloseTo(energy, 6);
    expect(b.total).toBeCloseTo(energy + 475 * 18000 + 0.06 * 6e6, 6);
  });
  it('applies losses before counting plant energy and buys the rest from the discom', () => {
    const p = proposedBill(C, { solarMwh: 2000, batteryMwh: 500, batteryPeakMwh: 500 });
    expect(p.plantKwh).toBeCloseTo(2500e3 * 0.95, 3);
    expect(p.lostKwh).toBeCloseTo(2500e3 * 0.05, 3);
    expect(p.plantKwh + p.discomKwh).toBeCloseTo(C.monthlyKwh, 3);
    expect(p.openAccess).toBeCloseTo(2500e3 * 1.1, 3);
  });
  it('never credits plant energy beyond what the consumer uses', () => {
    const p = proposedBill(C, { solarMwh: 50_000, batteryMwh: 0, batteryPeakMwh: 0 });
    expect(p.plantKwh).toBeLessThanOrEqual(C.monthlyKwh * (1 - C.todShare.peak) + 1e-6);
    expect(p.shortfallKwh).toBeCloseTo(C.monthlyKwh * C.todShare.peak, 3); // peak still comes from the discom without a battery
  });
  it('saves money when the delivered price is below the present tariff, and projects 25 years with escalation', () => {
    const s = savings(C, { solarMwh: 2500, batteryMwh: 600, batteryPeakMwh: 600 });
    expect(s.monthlySaving).toBeGreaterThan(0);
    expect(s.annualSaving).toBeCloseTo(s.monthlySaving * 12, 6);
    expect(s.years).toHaveLength(25);
    expect(s.years[24].saving).toBeGreaterThan(s.years[0].saving); // discom escalates, PPA flat
    expect(s.peakSavingMonthly).toBeGreaterThan(0);
  });
  it('shows a loss when open-access charges make delivered power dearer than the grid', () => {
    const s = savings({ ...C, openAccessChargesRsKwh: 5 }, { solarMwh: 2500, batteryMwh: 0, batteryPeakMwh: 0 });
    expect(s.monthlySaving).toBeLessThan(0);
  });
});

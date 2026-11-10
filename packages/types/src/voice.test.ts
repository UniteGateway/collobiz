import { describe, expect, it } from 'vitest';
import { extractLead, spokenAmount } from './voice';

const now = new Date('2026-11-10T06:00:00Z');
describe('spoken amounts', () => {
  it('reads lakh, crore and rupees in English, Hindi and Telugu', () => {
    expect(spokenAmount('budget around 80 lakh')).toBe(80_00_000_00);
    expect(spokenAmount('about 1.5 crore')).toBe(1_50_00_000_00);
    expect(spokenAmount('बजट 2 करोड़ है')).toBe(2_00_00_000_00);
    expect(spokenAmount('విలువ 50 లక్షలు')).toBe(50_00_000_00);
    expect(spokenAmount('₹45,000 only')).toBe(45_000_00);
    expect(spokenAmount('500 kW plant')).toBeNull(); // a capacity, not money
  });
});

describe('lead extraction', () => {
  it('English: customer, city, capacity, sector, value, timing, phone', () => {
    const r = extractLead('New lead: customer is Shree Ganesh Engineering Pvt Ltd in Pune, they want a 500 kW rooftop solar plant, budget about 2.4 crore, decision within 45 days. Contact 98220 11223.', now);
    expect(r).toMatchObject({ customer: 'Shree Ganesh Engineering Pvt Ltd', city: 'Pune', sector: 'solar', quantityOrCapacity: '500 kW', productOrProject: '500 kW rooftop solar', estimatedValue: 2_40_00_000_00, expectedCloseDate: '2026-12-25', contactPhone: '9822011223', missing: [] });
  });
  it('Hindi mixed with English', () => {
    const r = extractLead('चाकण में Kolhapur Agro Foods के लिए 2 मेगावाट solar plant चाहिए, बजट 9 करोड़, अगले महीने तक', now);
    expect(r).toMatchObject({ city: 'Chakan', sector: 'solar', estimatedValue: 9_00_00_000_00, expectedCloseDate: '2026-12-31', customer: 'Kolhapur Agro Foods' });
  });
  it('asks for what is missing instead of guessing', () => {
    const r = extractLead('Somebody needs a transformer', now);
    expect(r.sector).toBe('power_equipment');
    expect(r.missing.map((m) => m.field)).toEqual(['Customer', 'City', 'Value']);
    expect(r.missing[0].question).toMatch(/Which company/);
  });
});

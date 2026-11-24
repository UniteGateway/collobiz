import { describe, expect, it } from 'vitest';
import { ChannelApplicationSchema, recommendChannels } from './brand-channels';

describe('channel matching agent', () => {
  it('ranks cement and steel first for a building materials dealer with storage, as distributor', () => {
    const r = recommendChannels({ businessType: 'building_materials_dealer', warehouseSqft: 8000 });
    expect(r.slice(0, 2).map((x) => x.slug).sort()).toEqual(['unite-cement', 'unite-steel']);
    expect(r[0].role).toBe('distributor');
    expect(r[0].reasons.join(' ')).toMatch(/8,000 sq ft/);
  });
  it('suggests furniture, carpets and ply for a furniture showroom, as a store', () => {
    const r = recommendChannels({ businessType: 'furniture_store', showroomSqft: 1200 });
    expect(r[0].slug).toBe('unite-furniture'); expect(r[0].role).toBe('store');
    expect(r.map((x) => x.slug)).not.toContain('unite-cement');
  });
  it('offers manufacturing where Unite looks for OEMs, never for cement or steel', () => {
    const r = recommendChannels({ businessType: 'manufacturer' });
    expect(r.find((x) => x.slug === 'unite-furniture')?.role).toBe('manufacturer');
    expect(r.map((x) => x.slug)).not.toContain('unite-cement');
  });
  it('every recommendation carries reasons', () => {
    for (const t of ['hardware_store', 'interior_designer', 'new_business'] as const) for (const m of recommendChannels({ businessType: t })) expect(m.reasons.length).toBeGreaterThan(0);
  });
  it('validates roles per product and asks manufacturers for capacity', () => {
    const base = { productSlug: 'unite-cement', businessType: 'cement_steel_trader', name: 'Raju', email: 'raju@example.com', phone: '9876543210', state: 'Telangana', city: 'Warangal', consent: true };
    expect(ChannelApplicationSchema.safeParse({ ...base, role: 'dealer' }).success).toBe(true);
    expect(ChannelApplicationSchema.safeParse({ ...base, role: 'manufacturer' }).success).toBe(false); // cement OEM is chosen by Unite
    expect(ChannelApplicationSchema.safeParse({ ...base, productSlug: 'unite-furniture', role: 'manufacturer' }).success).toBe(false);
    expect(ChannelApplicationSchema.safeParse({ ...base, productSlug: 'unite-furniture', role: 'manufacturer', capacity: '400 chairs a month' }).success).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { WhatsappPrefsSchema, guessSector, tredsChecks } from './channels';

describe('WhatsApp preferences', () => {
  it('opting in needs a valid Indian mobile', () => {
    expect(WhatsappPrefsSchema.safeParse({ optIn: true, number: '080-41234567', kinds: ['payment'] }).success).toBe(false);
    expect(WhatsappPrefsSchema.safeParse({ optIn: true, number: '+91 98220 11223', kinds: ['payment'] }).success).toBe(true);
    expect(WhatsappPrefsSchema.safeParse({ optIn: false }).success).toBe(true);
    expect(WhatsappPrefsSchema.safeParse({ optIn: true, number: '9822011223', kinds: ['marketing'] }).success).toBe(false);
  });
});

describe('TReDS pre-checks', () => {
  const base = { udyam: 'UDYAM-MH-26-0012345', sellerGstin: '27AABCV1234F1ZO', buyerGstin: '36AAACU7777S1Z8', buyerType: 'group_company', status: 'issued', outstanding: 1_00_000_00, disputed: false, dueDate: '2026-12-05', today: new Date('2026-11-10') };
  it('all clear for an unpaid, undisputed invoice from an MSME to a company', () => {
    expect(tredsChecks(base).every((c) => c.ok)).toBe(true);
  });
  it('explains each failure', () => {
    const r = tredsChecks({ ...base, udyam: 'UDYAM-123', buyerType: 'partner_individual', disputed: true, dueDate: '2026-11-01' });
    expect(r.filter((c) => !c.ok).map((c) => c.key)).toEqual(['msme', 'buyer', 'clean', 'due']);
    expect(r.find((c) => c.key === 'due')!.detail).toMatch(/Overdue since 2026-11-01/);
    expect(tredsChecks({ ...base, status: 'paid', outstanding: 0 }).find((c) => c.key === 'open')!.ok).toBe(false);
  });
});

describe('tender sector guess', () => {
  it('maps titles to sectors, or leaves it for a person', () => {
    expect(guessSector('Supply, installation and commissioning of 500 kWp rooftop solar PV plant')).toBe('solar');
    expect(guessSector('Construction of 33/11 kV substation and HT line')).toBe('power_equipment');
    expect(guessSector('Laying of water supply pipeline in Ward 12')).toBe('infrastructure');
    expect(guessSector('Annual maintenance of CCTV and network')).toBe('technology');
    expect(guessSector('Supply of office stationery')).toBeNull();
  });
});

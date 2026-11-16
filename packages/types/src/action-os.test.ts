import { describe, expect, it } from 'vitest';
import { ActionEventSchema, buildPlan, digestText, exposure, inQuietHours, isoWeekKey, isScheduleDue, localParts, nextRunAt, scoreAction, urgency, zonedToUtc, type PlanItem } from './action-os';

const now = new Date('2026-11-16T04:00:00Z'); // Monday 09:30 IST
describe('priority engine', () => {
  it('urgency and exposure scales', () => {
    expect(urgency(null, now)).toBe(0);
    expect(urgency('2026-11-15T00:00:00Z', now)).toBe(1);
    expect(urgency('2026-11-16T20:00:00Z', now)).toBe(0.9);
    expect(urgency('2026-11-22T00:00:00Z', now)).toBe(0.45);
    expect(exposure(0)).toBe(0);
    expect(exposure(1_00_000_00)).toBeCloseTo(0.6, 5); // ₹1 lakh... log10(1e5)=5 → (5-3)/5+.2 = .6
    expect(exposure(1_00_00_000_00 * 10)).toBe(1);
  });
  it('explains every component and never invents a deadline', () => {
    const r = scoreAction({ kind: 'follow_up' }, now);
    expect(r).toMatchObject({ score: 0, band: 'P3', dueKnown: false, parts: [] });
    const s = scoreAction({ dueAt: '2026-11-17T00:00:00Z', valuePaise: 50_00_000_00, risk: 'contractual', commitment: true, kind: 'deadline' }, now);
    expect(s.parts.map((p) => p.key)).toEqual(['deadline', 'financial', 'risk', 'commitment']);
    expect(s.parts.find((p) => p.key === 'deadline')!.why).toMatch(/due in 20 h/);
    expect(['P0', 'P1']).toContain(s.band);
  });
  it('hard rules: overdue mandatory is critical; overdue collection is at least high', () => {
    expect(scoreAction({ dueAt: '2026-11-10T00:00:00Z', mandatory: true }, now)).toMatchObject({ band: 'P0', rule: 'Mandatory item is overdue' });
    expect(scoreAction({ dueAt: '2026-11-10T00:00:00Z', kind: 'collection' }, now).band).toBe('P1');
    expect(scoreAction({ dueAt: '2026-11-16T10:00:00Z', risk: 'compliance' }, now).band).not.toMatch(/P2|P3/);
  });
});

describe('scheduling', () => {
  it('local parts and DST-safe conversion', () => {
    expect(localParts(now, 'Asia/Kolkata')).toMatchObject({ h: 9, min: 30, wd: 1 });
    expect(zonedToUtc(2026, 11, 16, 8, 0, 'Asia/Kolkata').toISOString()).toBe('2026-11-16T02:30:00.000Z');
    // New York: 2027-03-14 02:30 does not exist (spring forward) → first valid instant after it.
    expect(zonedToUtc(2027, 3, 14, 2, 30, 'America/New_York').getTime()).toBeGreaterThanOrEqual(zonedToUtc(2027, 3, 14, 3, 0, 'America/New_York').getTime() - 3600_000);
    expect(zonedToUtc(2027, 3, 15, 8, 0, 'America/New_York').toISOString()).toBe('2027-03-15T12:00:00.000Z'); // EDT
    expect(zonedToUtc(2027, 3, 8, 8, 0, 'America/New_York').toISOString()).toBe('2027-03-08T13:00:00.000Z'); // EST
  });
  it('next Monday 08:00 in each zone; same instant gives different local weeks only at boundaries', () => {
    expect(nextRunAt(1, '08:00', 'Asia/Kolkata', now).toISOString()).toBe('2026-11-23T02:30:00.000Z');
    expect(nextRunAt(1, '08:00', 'America/New_York', now).toISOString()).toBe('2026-11-16T13:00:00.000Z');
    expect(nextRunAt(0, '08:00', 'Asia/Kolkata', now).toISOString()).toBe('2026-11-17T02:30:00.000Z');
    expect(isoWeekKey(now, 'Asia/Kolkata')).toBe('2026-W47');
    expect(isoWeekKey(new Date('2026-11-15T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-W47'); // Mon 01:30 IST
    expect(isoWeekKey(new Date('2026-11-15T20:00:00Z'), 'America/New_York')).toBe('2026-W46'); // still Sunday in NY
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'), 'UTC')).toBe('2026-W53');
  });
  it('due once the local time has passed this week, catching up later in the week', () => {
    expect(isScheduleDue(1, '08:00', 'Asia/Kolkata', now)).toBe(true);
    expect(isScheduleDue(1, '10:00', 'Asia/Kolkata', now)).toBe(false);
    expect(isScheduleDue(1, '08:00', 'America/New_York', now)).toBe(false); // 23:00 Sunday there
    expect(isScheduleDue(3, '08:00', 'Asia/Kolkata', now)).toBe(false);
    expect(isScheduleDue(1, '08:00', 'Asia/Kolkata', new Date('2026-11-18T04:00:00Z'))).toBe(true); // Wednesday catch-up
  });
  it('quiet hours across midnight', () => {
    expect(inQuietHours(new Date('2026-11-16T17:00:00Z'), 'Asia/Kolkata', '21:00', '07:00')).toBe(true); // 22:30
    expect(inQuietHours(now, 'Asia/Kolkata', '21:00', '07:00')).toBe(false);
    expect(inQuietHours(now, 'Asia/Kolkata', '09:00', '09:00')).toBe(false);
  });
});

describe('events and plans', () => {
  const base = { eventId: 'evt-1', sourceApp: 'unite-solar', sourceModule: 'quotations', sourceRecordId: 'Q-1', organizationId: '00000000-0000-4000-8000-000000000001', kind: 'follow_up', title: 'Follow up EPC quotation', recordUrl: '/unite-solar/quotes/1', occurredAt: '2026-11-16T03:00:00Z' };
  it('validates the integration contract', () => {
    expect(ActionEventSchema.safeParse(base).success).toBe(true);
    expect(ActionEventSchema.safeParse({ ...base, recordUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(ActionEventSchema.safeParse({ ...base, sourceApp: 'Bad App' }).success).toBe(false);
    expect(ActionEventSchema.parse(base).verification).toBe('reported');
  });
  it('builds sections, a summary and a redacted digest', () => {
    const it0 = (o: Partial<PlanItem>): PlanItem => ({ id: 'x', title: 't', summary: '', kind: 'task', sourceApp: 'collab', sourceModule: 'm', organization: 'Org', recordUrl: '/', dueAt: null, valuePaise: null, band: 'P2', score: 30, why: [], rule: null, verification: 'confirmed', status: 'open', owner: null, nextStep: '', confidentiality: 'normal', seenAt: '', ...o });
    const items = [it0({ id: 'a', band: 'P0', kind: 'collection', dueAt: '2026-11-10T00:00:00Z', title: 'Collect invoice INV-1' }), it0({ id: 'b', kind: 'decision', band: 'P1', title: 'Approve franchise' }), it0({ id: 'c', status: 'done' }), it0({ id: 'd', kind: 'opportunity', band: 'P3' })];
    const p = buildPlan(items, now);
    const sec = Object.fromEntries(p.sections.map((s) => [s.key, s.items]));
    expect(sec.top).toEqual(['a', 'b']); expect(sec.overdue).toEqual(['a']); expect(sec.collections).toEqual(['a']); expect(sec.decisions).toEqual(['b']); expect(sec.done).toEqual(['c']); expect(sec.opportunities).toEqual(['d']);
    expect(p.summary).toMatch(/3 open items across 1 app: 1 critical, 1 high, 1 overdue/);
    const t = digestText(p, [{ title: 'Collect invoice INV-1', band: 'P0' }], 'weekly');
    expect(t).toMatch(/1\. Urgent: Collect invoice INV-1/);
    expect(buildPlan([], now).summary).toMatch(/Nothing needs your attention/);
  });
});

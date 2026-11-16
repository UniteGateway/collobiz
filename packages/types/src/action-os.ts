/**
 * COLLABIZ ACTION OS — shared rules (pure, tested in action-os.test.ts).
 *
 *  - ActionEventSchema: the normalised event every connected app sends (or a built-in connector derives from COLLABIZ data).
 *  - scoreAction: transparent weighted priority with deterministic hard rules; returns every component so the UI can
 *    explain "why this matters". Missing due dates and values stay unknown — never invented.
 *  - Scheduling: next local run for a weekday/time in an IANA time zone (DST-safe), ISO-week keys per local calendar,
 *    quiet hours.
 *  - buildPlan: groups scored items into the plan sections; every line keeps its source link and verification state.
 */
import { z } from 'zod';

export const VERIFICATION = ['confirmed', 'reported', 'missing', 'ai'] as const;
export type Verification = (typeof VERIFICATION)[number];
export const VERIFICATION_LABELS: Record<Verification, string> = { confirmed: 'Confirmed', reported: 'Reported / not verified', missing: 'Missing information', ai: 'AI recommendation' };
export const ACTION_KINDS = ['deadline', 'follow_up', 'decision', 'approval', 'collection', 'payment', 'opportunity', 'blocker', 'compliance', 'task', 'missing_info'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  deadline: 'Deadline', follow_up: 'Follow-up', decision: 'Decision', approval: 'Approval', collection: 'Collection', payment: 'Payment due',
  opportunity: 'Opportunity', blocker: 'Blocker', compliance: 'Compliance', task: 'Task', missing_info: 'Missing information',
};
export const CONFIDENTIALITY = ['normal', 'confidential', 'restricted'] as const;
export const NOTICE_ACTIONS = ['open', 'complete', 'snooze', 'assign', 'escalate', 'request_update', 'pin', 'archive', 'comment'] as const;

/** Normalised business event (integration contract). Money in paise. */
export const ActionEventSchema = z.object({
  eventId: z.string().trim().min(3).max(120),
  sourceApp: z.string().trim().min(2).max(40).regex(/^[a-z0-9_-]+$/),
  sourceModule: z.string().trim().min(2).max(60),
  sourceRecordId: z.string().trim().min(1).max(120),
  organizationId: z.string().uuid(),
  assignedUserIds: z.array(z.string().uuid()).max(50).default([]),
  kind: z.enum(ACTION_KINDS),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(1000).default(''),
  dueAt: z.string().datetime({ offset: true }).optional(),
  valuePaise: z.number().int().min(0).optional(),
  risk: z.enum(['none', 'low', 'contractual', 'compliance']).default('none'),
  strategic: z.number().min(0).max(1).default(0),
  blocker: z.boolean().default(false),
  commitment: z.boolean().default(false),
  mandatory: z.boolean().default(false),
  sourceStatus: z.string().trim().max(60).default(''),
  recordUrl: z.string().trim().max(500).regex(/^(\/|https:\/\/)/, 'Use a COLLABIZ path or an https link'),
  confidentiality: z.enum(CONFIDENTIALITY).default('normal'),
  verification: z.enum(VERIFICATION).default('reported'),
  occurredAt: z.string().datetime({ offset: true }),
});
export type ActionEvent = z.infer<typeof ActionEventSchema>;

// ------------------------------------------------------------------ priority
export interface PriorityWeights { deadline: number; financial: number; risk: number; strategic: number; blocker: number; commitment: number }
export const DEFAULT_WEIGHTS: PriorityWeights = { deadline: 25, financial: 20, risk: 20, strategic: 15, blocker: 10, commitment: 10 };
export type Band = 'P0' | 'P1' | 'P2' | 'P3';
export const BAND_LABELS: Record<Band, string> = { P0: 'Critical', P1: 'High', P2: 'Normal', P3: 'Low' };
export interface ScoreInput { dueAt?: Date | string | null; valuePaise?: number | null; risk?: 'none' | 'low' | 'contractual' | 'compliance'; strategic?: number; blocker?: boolean; commitment?: boolean; mandatory?: boolean; kind?: ActionKind }
export interface ScoreResult { score: number; band: Band; parts: { key: keyof PriorityWeights; points: number; why: string }[]; rule: string | null; dueKnown: boolean }

const HOUR = 3600_000;
/** Deadline urgency 0..1: overdue = 1; within 24 h = .9; 3 days = .7; 7 days = .45; 30 days = .15; unknown = 0. */
export function urgency(dueAt: Date | string | null | undefined, now: Date) {
  if (!dueAt) return 0;
  const h = (new Date(dueAt).getTime() - now.getTime()) / HOUR;
  if (h < 0) return 1; if (h <= 24) return 0.9; if (h <= 72) return 0.7; if (h <= 168) return 0.45; if (h <= 720) return 0.15; return 0.05;
}
/** Financial exposure 0..1 on a log scale: ₹10 k → .2, ₹1 lakh → .4, ₹10 lakh → .6, ₹1 crore → .8, ₹10 crore+ → 1. */
export function exposure(valuePaise: number | null | undefined) {
  if (!valuePaise || valuePaise <= 0) return 0;
  const rupees = valuePaise / 100;
  return Math.max(0, Math.min(1, (Math.log10(rupees) - 3) / 5 + 0.2));
}
const fmtDue = (dueAt: Date | string, now: Date) => {
  const h = (new Date(dueAt).getTime() - now.getTime()) / HOUR;
  if (h < 0) return `overdue by ${h > -48 ? `${Math.max(1, Math.round(-h))} h` : `${Math.round(-h / 24)} days`}`;
  return h < 48 ? `due in ${Math.max(1, Math.round(h))} h` : `due in ${Math.round(h / 24)} days`;
};

export function scoreAction(i: ScoreInput, now = new Date(), w: PriorityWeights = DEFAULT_WEIGHTS): ScoreResult {
  const total = w.deadline + w.financial + w.risk + w.strategic + w.blocker + w.commitment || 1;
  const u = urgency(i.dueAt, now), f = exposure(i.valuePaise), r = { none: 0, low: 0.3, contractual: 0.8, compliance: 1 }[i.risk ?? 'none'];
  const parts: ScoreResult['parts'] = [];
  const add = (key: keyof PriorityWeights, x: number, why: string) => { if (x > 0) parts.push({ key, points: Math.round((w[key] * x * 100) / total) / 1, why }); };
  add('deadline', u, i.dueAt ? fmtDue(i.dueAt, now) : '');
  add('financial', f, i.valuePaise ? `₹${Math.round(i.valuePaise / 100).toLocaleString('en-IN')} involved` : '');
  add('risk', r, i.risk === 'compliance' ? 'compliance deadline or obligation' : i.risk === 'contractual' ? 'contractual commitment at risk' : 'some risk');
  add('strategic', i.strategic ?? 0, 'strategic priority for the business');
  add('blocker', i.blocker ? 1 : 0, 'others are waiting on this');
  add('commitment', i.commitment ? 1 : 0, 'commitment to a customer or partner');
  const score = Math.min(100, Math.round(parts.reduce((a, p) => a + p.points, 0)));
  let band: Band = score >= 70 ? 'P0' : score >= 45 ? 'P1' : score >= 20 ? 'P2' : 'P3';
  let rule: string | null = null;
  // Deterministic hard rules (organisational policy, never AI judgement).
  const overdue = !!i.dueAt && new Date(i.dueAt).getTime() < now.getTime();
  if (i.mandatory && overdue) { band = 'P0'; rule = 'Mandatory item is overdue'; }
  else if (overdue && (i.risk === 'contractual' || i.risk === 'compliance' || i.kind === 'collection')) { band = band === 'P0' ? 'P0' : 'P1'; rule ??= 'Overdue contractual, compliance or collection item is at least High'; }
  else if (u >= 0.9 && (i.risk === 'contractual' || i.risk === 'compliance')) { if (band === 'P2' || band === 'P3') band = 'P1'; rule ??= 'Due within 24 hours with contractual or compliance risk'; }
  return { score, band, parts, rule, dueKnown: !!i.dueAt };
}
export const bandRank = (b: Band) => ({ P0: 0, P1: 1, P2: 2, P3: 3 })[b];

// ------------------------------------------------------------------ scheduling
const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
/** Local calendar parts of an instant in a time zone. */
export function localParts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: WD[p.weekday as string] };
}
export function isValidTimeZone(tz: string) { try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch { return false; } }
/** UTC instant for a local wall-clock time; for a time skipped by DST it returns the first valid instant after it. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string) {
  let t = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(t), tz);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Date.UTC(y, m - 1, d, h, min);
    if (diff === 0) return new Date(t);
    t -= diff;
  }
  return new Date(t);
}
/** ISO week key of the local calendar date, e.g. "2026-W47" — one weekly plan per user per key. */
export function isoWeekKey(d: Date, tz: string) {
  const p = localParts(d, tz);
  const date = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const dow = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - dow + 3); // Thursday of this week
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
export const localDayKey = (d: Date, tz: string) => { const p = localParts(d, tz); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
/** Next run at or after `from` for a weekday (1 = Monday … 7 = Sunday, or 0 = every day) and "HH:MM" local time. */
export function nextRunAt(weekday: number, time: string, tz: string, from = new Date()) {
  const [hh, mm] = time.split(':').map(Number);
  const p = localParts(from, tz);
  for (let i = 0; i < 9; i++) {
    const base = new Date(Date.UTC(p.y, p.m - 1, p.d + i));
    const wd = ((base.getUTCDay() + 6) % 7) + 1;
    if (weekday && wd !== weekday) continue;
    const at = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hh, mm, tz);
    if (at.getTime() >= from.getTime()) return at;
  }
  throw new Error('No run found');
}
/** Whether a schedule is due: its local time this week (or today, for daily) has passed. The caller also checks that no plan exists for the period. */
export function isScheduleDue(weekday: number, time: string, tz: string, now: Date) {
  const p = localParts(now, tz);
  if (weekday && p.wd < weekday) return false;
  const [hh, mm] = time.split(':').map(Number);
  if (weekday && p.wd > weekday) return p.wd - weekday <= 2; // missed-run recovery within two days; later, wait for the next week
  return p.h * 60 + p.min >= hh * 60 + mm;
}
/** Quiet hours, e.g. 21:00–07:00 local; start == end means none. */
export function inQuietHours(now: Date, tz: string, start: string, end: string) {
  if (!start || !end || start === end) return false;
  const p = localParts(now, tz), cur = p.h * 60 + p.min;
  const [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

export const PreferencesSchema = z.object({
  weeklyEnabled: z.boolean(), weeklyDay: z.number().int().min(1).max(7), weeklyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  dailyEnabled: z.boolean(), dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  maxPriorities: z.number().int().min(3).max(15), maxNoncriticalPerDay: z.number().int().min(0).max(50),
  channels: z.object({ inapp: z.literal(true), push: z.boolean(), email: z.boolean(), whatsapp: z.boolean() }),
  modules: z.array(z.string().max(40)).max(40), orgIds: z.array(z.string().uuid()).max(50),
  detail: z.enum(['brief', 'standard', 'detailed']),
});
export type ActionPreferences = z.infer<typeof PreferencesSchema>;
export const DEFAULT_PREFERENCES: ActionPreferences = {
  weeklyEnabled: true, weeklyDay: 1, weeklyTime: '08:00', dailyEnabled: false, dailyTime: '08:00', timeZone: 'Asia/Kolkata', quietStart: '21:00', quietEnd: '07:00',
  maxPriorities: 7, maxNoncriticalPerDay: 10, channels: { inapp: true, push: false, email: false, whatsapp: false }, modules: [], orgIds: [], detail: 'standard',
};

// ------------------------------------------------------------------ plan
export interface PlanItem {
  id: string; title: string; summary: string; kind: ActionKind; sourceApp: string; sourceModule: string; organization: string; recordUrl: string;
  dueAt: string | null; valuePaise: number | null; band: Band; score: number; why: string[]; rule: string | null; verification: Verification; status: string; owner: string | null;
  nextStep: string; confidentiality: string; seenAt: string;
}
export interface PlanSection { key: string; title: string; items: string[] }
export const NEXT_STEP: Record<ActionKind, string> = {
  deadline: 'Finish and submit before the deadline, or agree a new date with the other party.', follow_up: 'Reply or follow up with the other party.',
  decision: 'Review the record and record your decision.', approval: 'Review and approve or decline with a reason.', collection: 'Contact the payer and confirm a payment date.',
  payment: 'Arrange payment or confirm the payment reference.', opportunity: 'Review the opportunity and decide whether to pursue it.', blocker: 'Remove the blocker or escalate to the owner.',
  compliance: 'Complete the compliance step and keep the evidence.', task: 'Complete the task or reschedule it.', missing_info: 'Supply or confirm the missing information.',
};

/** Groups items into plan sections. Items are referenced by id; ordering is by band, then score, then due date. */
export function buildPlan(items: PlanItem[], now: Date, maxPriorities = 7) {
  const open = items.filter((i) => i.status === 'open').sort((a, b) => bandRank(a.band) - bandRank(b.band) || b.score - a.score || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
  const week = now.getTime() + 7 * 86400000, day = now.getTime() + 86400000;
  const due = (i: PlanItem) => (i.dueAt ? new Date(i.dueAt).getTime() : null);
  const ids = (xs: PlanItem[]) => xs.map((x) => x.id);
  const sections: PlanSection[] = [
    { key: 'top', title: 'Top priorities', items: ids(open.filter((i) => i.band === 'P0' || i.band === 'P1').slice(0, maxPriorities)) },
    { key: 'overdue', title: 'Overdue', items: ids(open.filter((i) => { const d = due(i); return d != null && d < now.getTime(); })) },
    { key: 'deadlines', title: 'Deadlines in the next 7 days', items: ids(open.filter((i) => { const d = due(i); return d != null && d >= now.getTime() && d <= week; })) },
    { key: 'follow_ups', title: 'Customer, partner and supplier follow-ups', items: ids(open.filter((i) => i.kind === 'follow_up')) },
    { key: 'decisions', title: 'Decisions and approvals required', items: ids(open.filter((i) => i.kind === 'decision' || i.kind === 'approval')) },
    { key: 'collections', title: 'Collections and payments', items: ids(open.filter((i) => i.kind === 'collection' || i.kind === 'payment')) },
    { key: 'opportunities', title: 'New business opportunities', items: ids(open.filter((i) => i.kind === 'opportunity')) },
    { key: 'blockers', title: 'Blockers and risks', items: ids(open.filter((i) => i.kind === 'blocker' || i.kind === 'compliance')) },
    { key: 'missing', title: 'Missing information / not verified', items: ids(open.filter((i) => i.verification === 'missing' || i.verification === 'reported' || !i.dueAt).slice(0, 15)) },
    { key: 'today', title: 'Recommended for today', items: ids(open.filter((i) => { const d = due(i); return i.band === 'P0' || (d != null && d <= day); }).slice(0, 5)) },
    { key: 'done', title: 'Confirmed progress', items: ids(items.filter((i) => i.status === 'done').slice(0, 10)) },
  ].filter((s) => s.items.length);
  const counts = { open: open.length, critical: open.filter((i) => i.band === 'P0').length, high: open.filter((i) => i.band === 'P1').length, overdue: open.filter((i) => { const d = due(i); return d != null && d < now.getTime(); }).length, decisions: open.filter((i) => i.kind === 'decision' || i.kind === 'approval').length, followUps: open.filter((i) => i.kind === 'follow_up').length };
  const apps = [...new Set(open.map((i) => i.sourceApp))];
  const summary = !open.length ? 'Nothing needs your attention right now in the businesses and apps you can see.'
    : `${counts.open} open item${counts.open === 1 ? '' : 's'} across ${apps.length} app${apps.length === 1 ? '' : 's'}: ${counts.critical} critical, ${counts.high} high, ${counts.overdue} overdue, ${counts.decisions} decision${counts.decisions === 1 ? '' : 's'} and ${counts.followUps} follow-up${counts.followUps === 1 ? '' : 's'}.`;
  return { summary, counts, sections };
}

/** Plain-text digest for WhatsApp/push/email: titles only, never amounts or customer details. */
export function digestText(plan: { counts: { open: number; critical: number; overdue: number } }, top: { title: string; band: Band }[], kind: 'weekly' | 'daily') {
  const head = kind === 'weekly' ? 'Your weekly action plan is ready.' : 'Your priorities for today.';
  const lines = top.slice(0, 3).map((t, i) => `${i + 1}. ${t.band === 'P0' ? 'Urgent: ' : ''}${t.title}`);
  return [head, `${plan.counts.open} open · ${plan.counts.critical} critical · ${plan.counts.overdue} overdue`, ...lines, 'Open COLLABIZ to see owners, deadlines and linked records.'].join('\n');
}

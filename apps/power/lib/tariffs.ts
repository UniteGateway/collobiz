/**
 * Versioned tariff records (Modules 7–8). Only approved records feed calculations. Changes go through review: an analyst
 * proposes a value with its source order; an admin approves, which writes a new version and supersedes the previous one.
 * When the table is empty it is seeded with clearly-labelled illustrative placeholders so the calculators run.
 */
import { illustrativeTariffs, type TariffRecord } from '@unite/power-engine';
import type { TariffRecord as Row } from '@prisma/client';
import { db } from './db';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
export function toEngine(r: Row): TariffRecord {
  return {
    key: r.key, jurisdiction: r.jurisdiction, chargeType: r.chargeType as TariffRecord['chargeType'], unit: r.unit as TariffRecord['unit'], value: r.value,
    minKv: r.minKv, maxKv: r.maxKv, provenance: r.provenance as TariffRecord['provenance'], orderTitle: r.orderTitle, orderUrl: r.orderUrl, orderDate: iso(r.orderDate),
    effectiveFrom: iso(r.effectiveFrom), effectiveTo: iso(r.effectiveTo), version: r.version, notes: r.notes, waiver: (r.waiver as TariffRecord['waiver']) ?? null,
  };
}
const d = (s?: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
export function fromEngine(r: TariffRecord, extra: { status?: string; enteredBy?: string | null; approvedBy?: string | null } = {}) {
  return {
    key: r.key, jurisdiction: r.jurisdiction, chargeType: r.chargeType, unit: r.unit, value: r.value, minKv: r.minKv ?? null, maxKv: r.maxKv ?? null, provenance: r.provenance,
    orderTitle: r.orderTitle ?? null, orderUrl: r.orderUrl ?? null, orderDate: d(r.orderDate), effectiveFrom: d(r.effectiveFrom), effectiveTo: d(r.effectiveTo), version: r.version,
    notes: r.notes ?? null, waiver: (r.waiver ?? undefined) as never, conditions: r.waiver ? r.waiver.conditions.join('; ') : null, status: extra.status ?? 'approved',
    enteredBy: extra.enteredBy ?? 'seed', approvedBy: extra.approvedBy ?? null, approvedAt: extra.approvedBy ? new Date() : null,
  };
}

let seeded: Promise<void> | null = null;
export function ensureSeeded() {
  seeded ??= (async () => { if (!(await db.tariffRecord.count())) await db.tariffRecord.createMany({ data: illustrativeTariffs().map((r) => fromEngine(r)) }); })().catch((e) => { seeded = null; throw e; });
  return seeded;
}
/** Approved records (all versions; the engine picks the latest in force for the date asked). */
export async function approvedTariffs(): Promise<TariffRecord[]> {
  await ensureSeeded();
  return (await db.tariffRecord.findMany({ where: { status: { in: ['approved', 'superseded'] } }, orderBy: [{ key: 'asc' }, { version: 'asc' }] })).map(toEngine);
}

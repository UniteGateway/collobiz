'use client';
import { useScenario } from '@/components/Scenario';
import { useApi } from './client';

export interface Metric { label: string; value: number; numerator: string; denominator: string }
export interface YearData {
  project: { id: string | null; name: string; version: number; config: any; prices: any };
  computedMs: number; req: any;
  revenue: { ppa: number; peak: number; merchant: number; gridCost: number; deliveryCharges: number; net: number; peakBatteryMwh: number; provenance: string[] };
  solar: { acMwh: number; dcMwh: number; clippedMwh: number; cufDc: { value: number; denominator: string }; cufAc: { value: number; denominator: string }; peakAcMw: number; weather: { kind: string; label: string }; irradianceScale: number };
  summary: Record<string, number>; metrics: Metric[]; hourlyCoverage: { hour: number; coverage: number | null }[]; firmAvailability: number;
  feasibility: { annual: { coverage: number; feasibility: string; limiting: string; feasibleDays: number; conditionalDays: number; notFeasibleDays: number }; monthly: { month: number; coverage: number; feasibility: string; limiting: string }[]; limitingCounts: Record<string, number>; energyTest: { annualDemandMwh: number; annualSolarMwh: number; maxDeliverableMwh: number; ratio: number }; note: string; worstDays: { day: number; coverage: number; limiting: string; detail: string }[] };
  monthly: Record<string, number>[]; daily: (Record<string, number> & { day: number })[];
  bess: { trajectory: { year: number; capacityMwh: number; augmentMwh: number; fadeFraction: number }[]; dailySoc: { day: number; min: number; max: number }[]; usableMwh: number };
}
/** The simulated year for the scenario selected in the header. */
export function useYear() { const { query } = useScenario(); return useApi<YearData>(`/api/sim/year?${query}`); }
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const FEAS = { feasible: { label: 'Feasible', tone: 'green' }, conditional: { label: 'Conditionally feasible', tone: 'amber' }, not_feasible: { label: 'Not feasible', tone: 'red' } } as const;
export const LIMITING: Record<string, string> = { none: 'None — demand met', solar_energy: 'Available solar energy', battery_capacity: 'Battery capacity (MWh)', discharge_power: 'Battery discharge power (MW)', losses: 'Conversion losses', weather: 'Weather', export_constraint: 'Grid export constraint', contract_demand: 'Contracted demand above plant capability' };

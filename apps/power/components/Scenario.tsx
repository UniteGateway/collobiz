'use client';
/** Scenario shared by every page: dispatch mode, weather scenario and optional CUF target, kept in localStorage. */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ScenarioState { mode: 'max_profit' | 'max_savings' | 'max_reliability'; scenario: 'typical' | 'sunny' | 'monsoon_heavy' | 'low_production'; cuf: string; basis: 'dc' | 'ac' }
const DEFAULT: ScenarioState = { mode: 'max_reliability', scenario: 'typical', cuf: '', basis: 'dc' };
const Ctx = createContext<{ s: ScenarioState; set: (p: Partial<ScenarioState>) => void; query: string }>({ s: DEFAULT, set: () => undefined, query: '' });

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState(DEFAULT);
  useEffect(() => { try { const v = localStorage.getItem('upd.scenario'); if (v) setS({ ...DEFAULT, ...JSON.parse(v) }); } catch { /* storage blocked */ } }, []);
  const set = (p: Partial<ScenarioState>) => setS((x) => { const n = { ...x, ...p }; try { localStorage.setItem('upd.scenario', JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const query = `mode=${s.mode}&scenario=${s.scenario}${s.cuf ? `&cuf=${Number(s.cuf) / 100}&basis=${s.basis}` : ''}`;
  return <Ctx.Provider value={{ s, set, query }}>{children}</Ctx.Provider>;
}
export const useScenario = () => useContext(Ctx);

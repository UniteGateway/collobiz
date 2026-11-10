'use client';
import type { ReactNode } from 'react';
import { ScenarioProvider } from '@/components/Scenario';
import { Shell } from '@/components/Shell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ScenarioProvider><Shell>{children}</Shell></ScenarioProvider>;
}

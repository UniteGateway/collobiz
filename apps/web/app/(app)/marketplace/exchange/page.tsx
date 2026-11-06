'use client';
import { Alert } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { OpportunityList } from '@/components/Opportunities';

/** Screen 033 — Approved Partner Exchange (route C; verified partners only). */
export default function ExchangePage() {
  return (
    <Screen id="033" description="Partner-originated opportunities that Unite Group released after first review, where the buyer consented to wider sharing.">
      <Alert tone="info">Originator identity is withheld until a collaboration is approved. Contracting principals and platform fees are disclosed before you commit.</Alert>
      <OpportunityList scope="exchange" />
    </Screen>
  );
}

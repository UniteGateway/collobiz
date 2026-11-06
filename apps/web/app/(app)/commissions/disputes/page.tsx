'use client';
import { Screen } from '@/components/Screen';
import { EarningsTabs } from '@/components/Finance';
import { FinanceDisputes } from '@/components/FinanceDisputes';

/** Screen 159 — Commission Dispute Resolution (the line is frozen as “disputed” until finance rules). */
export default function CommissionDisputes() {
  return (
    <Screen id="159" description="While a line is disputed it cannot be approved or paid. An adjustment sends it back for approval at the new amount; paid lines cannot be re-priced.">
      <EarningsTabs />
      <FinanceDisputes kind="commission" />
    </Screen>
  );
}

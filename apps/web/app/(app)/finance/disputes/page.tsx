'use client';
import { Screen } from '@/components/Screen';
import { EarningsTabs } from '@/components/Finance';
import { FinanceDisputes } from '@/components/FinanceDisputes';

/** Screen 104 — Payment Disputes & Reconciliation (amount received vs payout advice, missing credits). */
export default function PaymentDisputes() {
  return (
    <Screen id="104" description="Report a payment that did not arrive or arrived short. Finance reconciles it against the bank reference on the settlement.">
      <EarningsTabs />
      <FinanceDisputes kind="payment" />
    </Screen>
  );
}

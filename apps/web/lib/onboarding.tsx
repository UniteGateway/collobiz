'use client';
import React, { createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from './hooks';

export interface OnboardingStatus {
  organization: { id: string; legalName: string; displayName: string; type: string; verificationStatus: string; membershipLevel: string; partnerTypes: string[] } | null;
  kind?: 'individual' | 'company';
  steps: { step: string; complete: boolean }[];
  missingDocs?: string[];
  rejectedDocs?: { id: string; docType: string; reviewNote: string | null }[];
  canSubmit: boolean;
  history: { at: string; from: string; to: string; reason: string | null }[];
}
export const STEP_META: { step: string; label: string; href: (k?: string) => string; screen: string }[] = [
  { step: 'account_type', label: 'Account type', href: () => '/onboarding/account-type', screen: '013' },
  { step: 'details', label: 'Details', href: (k) => (k === 'individual' ? '/onboarding/individual' : '/onboarding/company'), screen: '014/015' },
  { step: 'industries', label: 'Industries & skills', href: () => '/onboarding/industries', screen: '016' },
  { step: 'coverage', label: 'Coverage', href: () => '/onboarding/coverage', screen: '017' },
  { step: 'profile', label: 'Business profile', href: () => '/onboarding/profile', screen: '018' },
  { step: 'documents', label: 'KYC / KYB', href: () => '/onboarding/kyc', screen: '019' },
  { step: 'bank_tax', label: 'Bank & tax', href: () => '/onboarding/bank-tax', screen: '020' },
  { step: 'agreements', label: 'Agreements', href: () => '/onboarding/agreements', screen: '021' },
];

const Ctx = createContext<{ status: OnboardingStatus | undefined; reload: () => void; goNext: (current: string) => void; locked: boolean }>({ status: undefined, reload: () => {}, goNext: () => {}, locked: false });

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const q = useQuery<OnboardingStatus>('/onboarding/status');
  const router = useRouter();
  const goNext = (current: string) => {
    q.reload();
    const i = STEP_META.findIndex((s) => s.step === current);
    const next = STEP_META[i + 1];
    router.push(next ? next.href(q.data?.kind) : '/onboarding/status');
  };
  const locked = ['submitted', 'under_review'].includes(q.data?.organization?.verificationStatus ?? '');
  return <Ctx.Provider value={{ status: q.data, reload: q.reload, goNext, locked }}>{children}</Ctx.Provider>;
}
export const useOnboarding = () => useContext(Ctx);

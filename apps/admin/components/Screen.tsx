'use client';
import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SCREENS, type ScreenAccess } from '@collabiz/types';
import { PageHeader, LoadingState, PermissionDenied, Alert, ButtonLink, ErrorState } from '@collabiz/ui';
import { useSession, type Me } from '@/lib/session';
import { isForbidden } from '@/lib/hooks';

/** Client-side gate (UX only — the API enforces every permission server-side). */
export function accessDenial(access: ScreenAccess, me: Me | null): { reason: string; action?: { href: string; label: string } } | null {
  if (access === 'public') return null;
  if (!me) return { reason: 'Please sign in to continue.', action: { href: '/login', label: 'Sign in' } };
  const verified = me.activeOrg?.verificationStatus === 'verified';
  switch (access) {
    case 'authenticated':
      return null;
    case 'partner':
    case 'lead-owner': case 'team-lead': case 'team-member': case 'tender-party': case 'tender-issuer': case 'tender-evaluator':
    case 'project-member': case 'project-lead': case 'thread-member': case 'meeting-member':
      return me.activeOrg ? null : { reason: 'Create your partner account to use this feature.', action: { href: '/onboarding/account-type', label: 'Start onboarding' } };
    case 'verified-partner':
    case 'country-partner':
      if (!me.activeOrg) return { reason: 'Create your partner account first.', action: { href: '/onboarding/account-type', label: 'Start onboarding' } };
      return verified ? null : { reason: 'This action is available to verified partners. Complete KYC/KYB verification to unlock it.', action: { href: '/onboarding/status', label: 'View verification status' } };
    case 'org-owner':
      return me.orgRoles.includes('org_owner') || me.orgRoles.includes('org_admin') ? null : { reason: 'Only organization owners and admins can manage the team.' };
    case 'finance':
      return me.capabilities.includes('commission.approve') ? null : { reason: 'Finance approver role required.' };
    case 'investor':
      return null; // feature-flag + role checks happen server-side
    default:
      return me.platformRoles.length ? null : { reason: 'Unite Group administrator access required.' };
  }
}

export function Screen({ id, children, actions, description, title }: { id: string; children: React.ReactNode; actions?: React.ReactNode; description?: React.ReactNode; title?: string }) {
  const def = SCREENS.find((s) => s.id === id);
  const { me, loading } = useSession();
  const router = useRouter();
  const path = usePathname();
  const denial = def ? accessDenial(def.access, me) : null;
  useEffect(() => {
    if (!loading && def && def.access !== 'public' && !me) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, me, def, router, path]);
  if (!def) return <ErrorState error={`Unknown screen ${id}`} />;
  return (
    <div data-screen={id}>
      <PageHeader title={title ?? def.title} screenId={id} eyebrow="Unite Group administration" showScreenId={process.env.NEXT_PUBLIC_SHOW_SCREEN_IDS === 'true'} actions={!denial ? actions : undefined} description={description} />
      {loading && def.access !== 'public' ? <LoadingState /> : denial ? (
        <div className="cz-card">
          <PermissionDenied reason={denial.reason} />
          {denial.action && <div style={{ textAlign: 'center' }}><ButtonLink href={denial.action.href}>{denial.action.label}</ButtonLink></div>}
        </div>
      ) : children}
    </div>
  );
}

/** Renders API errors with the correct state: 403 → permission denied, otherwise retryable error. */
export function ApiErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (isForbidden(error)) return <PermissionDenied reason={(error as Error).message} />;
  return <ErrorState error={error} onRetry={onRetry} />;
}

export function FormError({ message }: { message: string | null }) {
  return message ? <Alert tone="danger">{message}</Alert> : null;
}

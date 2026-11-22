'use client';
/** Shared pieces for the GO EB5 module screens. */
import Link from 'next/link';
import { Alert, StatusBadge } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

export interface Eb5Me { enabled: boolean; visible: boolean; roles: string[]; roleLabels: string[]; partner: { id: string; status: string; role: string } | null; mfaNeeded: boolean; canApplyAsPartner: boolean }
export function useEb5() {
  const q = useQuery<Eb5Me>('/eb5/me');
  const r = new Set(q.data?.roles ?? []);
  const has = (...x: string[]) => x.some((k) => r.has(k));
  return { me: q.data, has, loading: !q.data };
}
export const usd = (cents: number | null | undefined) => (cents == null ? '—' : `$${(Number(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
export const when = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const day = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
const POSITIVE = /(verified|active|signed|approved|accepted|completed|counter-signed|legal approved|registered)/i;
const NEGATIVE = /(reject|cancel|suspend|closed|no_show|deleted)/i;
const WAITING = /(pending|review|draft|requested|issued|reported|scheduled|sent|viewed|uploaded|tracked)/i;
export const tone = (s: string) => (POSITIVE.test(s) ? 'success' : NEGATIVE.test(s) || /terminated/i.test(s) ? 'danger' : WAITING.test(s) ? 'warning' : 'neutral');
export const Badge = ({ s, label }: { s: string; label?: string }) => <StatusBadge status={s} tone={tone(label ?? s) as never} label={label ?? s.replace(/_/g, ' ')} />;

/** Persistent regulatory notice used on investor-facing and finance screens. */
export function Eb5Notice({ compact }: { compact?: boolean }) {
  return (
    <Alert tone="info" title={compact ? undefined : 'GO EB5 · CITRUS360 LLC'}>
      GO EB5 coordinates EB-5 consultancy for CITRUS360 LLC. It is not a law firm and does not give legal advice; no visa approval, processing time or investment return is promised.
      EB-5 investment capital is never paid to or held by COLLABIZ.
    </Alert>
  );
}

/** Tells staff when their role is waiting on two-step sign-in. */
export function MfaHint({ me }: { me?: Eb5Me }) {
  return me?.mfaNeeded ? <Alert tone="warning" title="Turn on two-step sign-in">Your GO EB5 staff role starts working once two-step sign-in is on. <Link href="/settings/security">Set it up</Link></Alert> : null;
}

export const STAGE_GROUPS: [string, number[]][] = [['New', [0, 1, 2]], ['Consultation', [3, 4, 5]], ['Proposal & agreement', [6, 7, 8]], ['Payment', [9, 10]], ['Active', [11, 12, 13, 14]], ['Closed', [15]]];

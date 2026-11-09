import { describe, it, expect } from 'vitest';
import { accessDenial } from '../components/Screen';
import { MODULES, moduleFor, partnerNav } from '../lib/navigation';
import type { Me } from '../lib/session';

const base: Me = {
  id: 'u', email: 'a@b.c', fullName: 'A B', emailVerified: true, phoneVerified: false, mfaEnabled: false, mfaVerified: false, mfaRequired: false,
  activeOrg: { id: 'o', type: 'partner_company', name: 'Org', verificationStatus: 'submitted', membershipLevel: 'registered' },
  orgRoles: ['org_member'], platformRoles: [], capabilities: [], memberships: [],
};

describe('client access gate (UX mirror of API rules)', () => {
  it('public screens never deny', () => expect(accessDenial('public', null)).toBeNull());
  it('signed-out users are sent to login', () => expect(accessDenial('partner', null)?.action?.href).toBe('/login'));
  it('unverified partners cannot use verified-partner screens', () => {
    expect(accessDenial('verified-partner', base)?.action?.href).toBe('/onboarding/status');
    expect(accessDenial('verified-partner', { ...base, activeOrg: { ...base.activeOrg!, verificationStatus: 'verified' } })).toBeNull();
  });
  it('users without an organization are sent to onboarding', () => {
    expect(accessDenial('partner', { ...base, activeOrg: null })?.action?.href).toBe('/onboarding/account-type');
  });
  it('team management needs owner/admin', () => {
    expect(accessDenial('org-owner', base)).not.toBeNull();
    expect(accessDenial('org-owner', { ...base, orgRoles: ['org_owner'] })).toBeNull();
  });
  it('admin screens need a platform role', () => {
    expect(accessDenial('super-admin', base)).not.toBeNull();
    expect(accessDenial('super-admin', { ...base, platformRoles: ['super_admin'] })).toBeNull();
  });
  it('navigation is task-based and compact (audit §3.2): no registry titles, no parameterised routes', () => {
    const verified = { ...base, activeOrg: { ...base.activeOrg!, verificationStatus: 'verified' } };
    const items = partnerNav(verified).flatMap((s) => s.items);
    // 14 in the audit (§3.2); +1 for "Unite businesses" (ventures, franchise, property sales), a primary area added on request.
    expect(items.length).toBeLessThanOrEqual(15);
    for (const it of items) { expect(it.href.includes('[')).toBe(false); expect(it.icon).toBeTruthy(); }
    expect(items.map((i) => i.label)).not.toContain('OTP & Email Verification');
    expect(partnerNav(base).flatMap((s) => s.items)[0]).toMatchObject({ href: '/onboarding/status' }); // unverified: verification first
    expect(partnerNav({ ...verified, capabilities: ['commission.approve'] }).some((s) => s.title === 'Finance')).toBe(true);
  });
  it('every page maps to the most specific module', () => {
    expect(moduleFor('/marketplace/map')?.key).toBe('opportunities');
    expect(moduleFor('/opportunities/abc')?.key).toBe('opportunities');
    expect(moduleFor('/projects/1/milestones')?.key).toBe('projects');
    expect(moduleFor('/earnings/live')?.key).toBe('earnings');
    expect(moduleFor('/login')).toBeNull();
    for (const m of MODULES) for (const [h] of m.tabs ?? []) expect(moduleFor(h)?.key).toBe(m.key);
  });
});

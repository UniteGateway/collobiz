import { describe, it, expect } from 'vitest';
import { accessDenial } from '../components/Screen';

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
});

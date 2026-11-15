import { describe, expect, it } from 'vitest';
import { BusinessOfferSchema, CollabProposalSchema, canOfferMove, nextProposalTurn, reverseMatches, scoreOffer, scoreProgram, type MatchAsset, type MatchNeed, type MatchOffer } from './collab';

const today = '2026-11-15';
const me = 'org-me', them = 'org-them';
const office: MatchAsset = { id: 'a1', orgId: me, kind: 'office', region: 'Telangana', city: 'Hyderabad', sectors: ['technology'], models: ['bpo_contract'], capacity: 50, available: true };
const team: MatchAsset = { ...office, id: 'a2', kind: 'team', capacity: 35 };
const need: MatchNeed = { id: 'n1', orgId: me, kind: 'outsourcing_contracts', sectors: ['technology'], regions: ['Telangana'], zeroUpfrontOnly: false };
const bpo: MatchOffer = { id: 'o1', orgId: them, category: 'bpo_contract', side: 'seeking', sector: 'technology', region: 'Telangana', city: 'Hyderabad', country: 'IN', upfrontRequired: false, status: 'active', expiresOn: '2027-01-01' };

describe('Collab matching', () => {
  it('matches a BPO office and team to a support-contract offer and explains every point', () => {
    const m = scoreOffer(bpo, [office, team], [need], today)!;
    expect(m.reasons.map((r) => r.code)).toEqual(['asset', 'need', 'sector', 'region', 'city', 'model', 'zero_upfront']);
    expect(m.score).toBe(100);
    expect(m.score).toBe(Math.min(100, m.reasons.reduce((s, r) => s + r.points, 0)));
  });
  it('never matches on sector or location alone, own offers, closed or expired offers', () => {
    const land: MatchAsset = { ...office, kind: 'land' };
    expect(scoreOffer(bpo, [land], [], today)).toBeNull();
    expect(scoreOffer({ ...bpo, orgId: me }, [office], [need], today)).toBeNull();
    expect(scoreOffer({ ...bpo, status: 'pending_verification' }, [office], [need], today)).toBeNull();
    expect(scoreOffer({ ...bpo, expiresOn: '2026-11-14' }, [office], [need], today)).toBeNull();
    expect(scoreOffer(bpo, [{ ...office, available: false }], [], today)).toBeNull();
  });
  it('for offers that OFFER capacity, the fit is someone who needs it — not a competitor with the same resource', () => {
    const seats: MatchOffer = { ...bpo, side: 'offering' };
    expect(scoreOffer(seats, [office, team], [], today)).toBeNull();
    const buyer: MatchNeed = { ...need, kind: 'service_provider' };
    expect(scoreOffer(seats, [], [buyer], today)!.reasons[0].code).toBe('need');
    const franchise: MatchOffer = { ...bpo, side: 'offering', category: 'franchise', sector: 'solar' };
    expect(scoreOffer(franchise, [{ ...office, kind: 'store' }], [], today)!.reasons[0].code).toBe('asset');
  });
  it('zero-upfront seekers do not see offers that need an upfront payment', () => {
    const z = { ...need, zeroUpfrontOnly: true };
    expect(scoreOffer({ ...bpo, upfrontRequired: true }, [office], [z], today)).toBeNull();
    expect(scoreOffer({ ...bpo, upfrontRequired: true }, [office], [need], today)).not.toBeNull();
  });
  it('suggests only open Unite programmes that a resource can actually serve', () => {
    const store: MatchAsset = { ...office, kind: 'store', sectors: ['solar'] };
    const solar = { id: 'v1', name: 'Unite Solar', sector: 'solar', roles: ['sell_products', 'refer_customers'], open: true };
    const m = scoreProgram(solar, [store], [{ ...need, kind: 'franchise' }])!;
    expect(m.reasons.map((r) => r.code)).toEqual(['role:sell_products', 'need', 'sector']);
    expect(scoreProgram({ ...solar, open: false }, [store], [])).toBeNull();
    expect(scoreProgram({ ...solar, roles: ['create_content'] }, [store], [])).toBeNull();
  });
  it('reverse-matches published resources to a need, ignoring private and own resources', () => {
    const theirs = [{ ...office, orgId: them, visibility: 'verified_partners' }, { ...team, id: 'p', orgId: them, visibility: 'private' }, { ...office, id: 'own', visibility: 'verified_partners' }];
    const r = reverseMatches([{ category: 'bpo_contract', sectors: ['technology'], regions: ['Telangana'], orgId: me }], theirs);
    expect(r.map((x) => x.item.id)).toEqual(['a1']);
    expect(r[0].score).toBe(100);
    const byNeed = reverseMatches([{ kind: 'service_provider', sectors: [], regions: [], orgId: me }], theirs);
    expect(byNeed.map((x) => x.item.id)).toEqual(['a1']);
    expect(reverseMatches([{ kind: 'franchise', sectors: [], regions: [], orgId: me }], theirs)).toEqual([]);
  });
});

describe('Offers and proposals', () => {
  it('offer lifecycle only allows the documented moves', () => {
    expect(canOfferMove('draft', 'active')).toBe(false);
    expect(canOfferMove('pending_verification', 'verified')).toBe(true);
    expect(canOfferMove('closed', 'active')).toBe(false);
    expect(canOfferMove('expired', 'pending_verification')).toBe(true);
  });
  it('upfront amount must agree with the upfront flag; barter goes to XCHANGE', () => {
    const base = { category: 'franchise', side: 'offering', title: 'Solar franchise in Vijayawada', summary: 'x'.repeat(40), sector: 'solar', expiresOn: '2027-01-01' };
    expect(BusinessOfferSchema.safeParse({ ...base, upfrontRequired: true }).success).toBe(false);
    expect(BusinessOfferSchema.safeParse({ ...base, upfrontRequired: false, upfrontAmount: 100 }).success).toBe(false);
    expect(BusinessOfferSchema.safeParse({ ...base, upfrontRequired: false }).success).toBe(true);
    const p = { scope: 'y'.repeat(30), deliverables: 'Reports', value: 1000, paymentTerms: 'Monthly', durationMonths: 12, startDate: '2027-01-01', payer: 'owner' };
    expect(CollabProposalSchema.safeParse({ ...p, pricingModel: 'barter' }).success).toBe(false);
    expect(CollabProposalSchema.safeParse({ ...p, pricingModel: 'revenue_share' }).success).toBe(false);
    expect(CollabProposalSchema.safeParse({ ...p, pricingModel: 'fixed_fee' }).success).toBe(true);
  });
  it('proposal turns alternate: only the receiving party may accept or counter', () => {
    expect(nextProposalTurn([], 'O', 'A').canAccept).toEqual([]);
    expect(nextProposalTurn([{ fromOrgId: 'A', status: 'sent' }], 'O', 'A')).toEqual({ canPropose: ['O'], canAccept: ['O'] });
    expect(nextProposalTurn([{ fromOrgId: 'A', status: 'superseded' }, { fromOrgId: 'O', status: 'sent' }], 'O', 'A').canAccept).toEqual(['A']);
  });
});

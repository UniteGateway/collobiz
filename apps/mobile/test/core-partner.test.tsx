import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ id: 'o1' }), Redirect: () => null, Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), delete: jest.fn() } }));
const mockSession = { me: null as any, loading: false, refresh: jest.fn(), signOut: jest.fn() };
jest.mock('../src/session', () => ({ useSession: () => mockSession }));

import Home from '../app/(tabs)/home';
import Marketplace from '../app/(tabs)/marketplace';
import OpportunityDetail from '../app/opportunities/[id]/index';
import { Field } from '../src/components/ui';

const asha = { fullName: 'Asha Patil', emailVerified: true, activeOrg: { id: 'org1', name: 'Volt EPC', type: 'partner', verificationStatus: 'verified', membershipLevel: 'verified' } };
const opp = (over: Record<string, unknown> = {}) => ({ id: 'o1', code: 'OPP-2026-00003', title: 'Civil foundations for 5 MW ground-mount plant', summary: 'Pile foundations and MMS civil works.', sector: 'construction_epc', kind: 'project', route: 'unite_owned', city: 'Tirunelveli', estimatedValue: 1200000000, deadline: new Date(Date.now() + 5 * 86400_000).toISOString(), minLevel: 'verified', requiredCertifications: ['ISO45001'], status: 'accepted', publisher: 'Unite Solar', isOwner: false, saved: false, myApplication: null, ...over });

beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockPush.mockReset(); mockSession.me = asha; });

describe('Screen 023 (native) — partner home', () => {
  it('leads with next actions, earnings and explainable recommendations; actions open the matching native screen', async () => {
    mockGet.mockResolvedValue({
      figures: { pipelineValue: 8800000, openDeals: 3, activeLeads: 2, protectedLeads: 1, activeProjects: 1, earnedUnpaid: 522500, projected: 1800000, openApplications: 1 },
      actions: [{ kind: 'team', title: 'Join Chakan Rooftop Consortium', detail: 'Volt EPC invited your company', href: '/collaboration/requests', tone: 'normal' }],
      recommendations: [{ id: 'o1', title: '2 MW rooftop solar EPC', sector: 'solar', city: 'Pune', value: 8000000, score: 93, reasons: ['Sector', 'Geography'] }],
      activity: [{ id: 'a1', text: 'Signed a team NDA', actor: 'Asha Patil', at: new Date().toISOString() }],
    });
    render(<Home />);
    await waitFor(() => screen.getByText('Join Chakan Rooftop Consortium'));
    expect(screen.getByText(/Good (morning|afternoon|evening), Asha/)).toBeTruthy();
    expect(screen.getByText('₹5,225')).toBeTruthy(); // earned, awaiting payment
    expect(screen.getByText('93')).toBeTruthy();
    expect(screen.getByText('Geography')).toBeTruthy();
    expect(screen.queryByText(/SCREEN 023/)).toBeNull(); // no developer artifacts
    fireEvent.press(screen.getByTestId('action-0'));
    expect(mockPush).toHaveBeenCalledWith('/collaboration');
    fireEvent.press(screen.getByTestId('rec-o1'));
    expect(mockPush).toHaveBeenCalledWith('/opportunities/o1');
  });
  it('asks a user without a company to set one up', async () => {
    mockSession.me = { ...asha, activeOrg: null };
    render(<Home />);
    expect(screen.getByText('Set up your partner account')).toBeTruthy();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('Screen 031 (native) — opportunities', () => {
  it('shows the result count and source counts, and filters by source and sector through the paged API', async () => {
    mockGet.mockResolvedValue({ items: [opp()], total: 1, counts: { all: 5, unite: 4, exchange: 1 } });
    render(<Marketplace />);
    await waitFor(() => screen.getByTestId('opp-OPP-2026-00003'));
    expect(screen.getByTestId('result-count').props.children).toBe('1 opportunity');
    expect(screen.getByText('Unite 4')).toBeTruthy();
    expect(screen.getByText('5d left')).toBeTruthy(); // closing urgency
    expect(mockGet).toHaveBeenLastCalledWith('/opportunities', expect.objectContaining({ paged: 'true', scope: 'all', offset: '0' }));
    fireEvent.press(screen.getByText('Unite 4'));
    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith('/opportunities', expect.objectContaining({ scope: 'unite' })));
    fireEvent.press(screen.getByLabelText('Construction & EPC'));
    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith('/opportunities', expect.objectContaining({ sector: 'construction_epc' })));
    fireEvent.press(screen.getByTestId('opp-OPP-2026-00003'));
    expect(mockPush).toHaveBeenCalledWith('/opportunities/o1');
  });
  it('explains an empty result', async () => {
    mockGet.mockResolvedValue({ items: [], total: 0, counts: { all: 0, unite: 0, exchange: 0 } });
    render(<Marketplace />);
    await waitFor(() => screen.getByText('No opportunities match'));
  });
});

describe('Screen 036 (native) — opportunity detail', () => {
  it('explains why a partner is not eligible and offers no apply button', async () => {
    mockGet.mockImplementation((path: string) => Promise.resolve(path.endsWith('/eligibility')
      ? { eligible: false, checks: [{ key: 'verified', label: 'KYB verification', result: 'pass', detail: 'Organization verified' }, { key: 'certifications', label: 'Required certifications', result: 'fail', detail: 'Missing: ISO45001' }] }
      : opp()));
    render(<OpportunityDetail />);
    await waitFor(() => screen.getByText('Not eligible yet · 1 of 2 met'));
    expect(screen.getByText('Missing: ISO45001')).toBeTruthy();
    expect(screen.getByText('Verified partner')).toBeTruthy(); // humanised level, not "verified"
    expect(screen.getByText('₹1.2 Cr')).toBeTruthy();
    expect(screen.queryByTestId('apply-cta')).toBeNull();
  });
  it('lets an eligible partner apply', async () => {
    mockGet.mockImplementation((path: string) => Promise.resolve(path.endsWith('/eligibility') ? { eligible: true, checks: [{ key: 'verified', label: 'KYB verification', result: 'pass', detail: 'Organization verified' }] } : opp()));
    render(<OpportunityDetail />);
    await waitFor(() => screen.getByText('You can apply'));
    fireEvent.press(screen.getByTestId('apply-cta'));
    expect(mockPush).toHaveBeenCalledWith('/opportunities/o1/apply');
  });
  it('shows application progress instead of eligibility once applied', async () => {
    mockGet.mockImplementation((path: string) => Promise.resolve(path.endsWith('/eligibility') ? { eligible: false, checks: [] } : opp({ myApplication: { id: 'a1', status: 'shortlisted', createdAt: new Date().toISOString() } })));
    render(<OpportunityDetail />);
    await waitFor(() => screen.getByText('Your application'));
    expect(screen.getByTestId('step-shortlisted')).toBeTruthy();
    expect(screen.getByText('Withdraw application')).toBeTruthy();
    expect(screen.queryByTestId('apply-cta')).toBeNull();
  });
});

describe('Native Field — accessibility', () => {
  it('links the visible label to the input', () => {
    render(<Field label="Company name" value="" onChangeText={() => {}} />);
    const input = screen.getByLabelText('Company name');
    const label = screen.getByText('Company name');
    expect(input.props.accessibilityLabelledBy).toBe(label.props.nativeID);
    expect(label.props.nativeID).toBeTruthy();
  });
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@collabiz/types';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockSetTokens = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) }, tokens: { set: (...a: unknown[]) => mockSetTokens(...a) } }));
const mockRefresh = jest.fn();
const mockSession: { me: any; refresh: jest.Mock } = { me: null, refresh: mockRefresh };
jest.mock('../src/session', () => ({ useSession: () => mockSession }));
const mockOpenURL = jest.fn();
jest.mock('expo-linking', () => ({ openURL: (...a: unknown[]) => mockOpenURL(...a) }));

import Activity from '../app/activity';
import Requests from '../app/collaboration';
import Projects from '../app/projects/index';
import Announcements from '../app/announcements';
import Learning from '../app/learning/index';
import MyProfile from '../app/profile';
import Security from '../app/security';
import Help from '../app/help';
import Live from '../app/earnings/live';
import Reviews from '../app/reputation/reviews';

beforeEach(() => {
  [mockGet, mockPost, mockPush, mockRefresh, mockSetTokens, mockOpenURL].forEach((m) => m.mockReset());
  mockSession.me = { fullName: 'Ravi Patel', email: 'ravi@sunrise.example', emailVerified: true, mfaEnabled: false };
});
const RAW = /\b[a-z]+_[a-z_]+\b|\bIN-[A-Z]{2}\b/;

describe('Screen 030 (native) — quick actions & activity', () => {
  it('offers the main actions and lists recent activity with readable times', async () => {
    mockGet.mockResolvedValue({ tasks: { overdue: 1, today: 2 }, items: [{ id: 'a1', title: 'Moved 2 MW rooftop to Proposal', at: '2026-11-07T09:30:00Z', detail: 'Pricing sent' }] });
    render(<Activity />);
    await waitFor(() => screen.getByText('Moved 2 MW rooftop to Proposal'));
    expect(screen.getByText(/7 Nov.*· Pricing sent/)).toBeTruthy();
    fireEvent.press(screen.getByText('Register lead'));
    expect(mockPush).toHaveBeenCalledWith('/leads/new');
    fireEvent.press(screen.getByText('Pipeline'));
    expect(mockPush).toHaveBeenCalledWith('/pipeline');
  });
});

describe('Screen 059 (native) — collaboration requests', () => {
  it('accepts an invitation, then signs the NDA with the typed name; roles read in words', async () => {
    const req = (status: string) => [{ memberId: 'm1', teamId: 't1', team: 'Kolhapur Foundry Rooftop Team', lead: 'Volt EPC', status, purpose: 'Rooftop EPC bid', role: 'execution', responsibilities: 'Structure and modules' }];
    mockGet.mockResolvedValueOnce(req('invited')).mockResolvedValueOnce(req('accepted')).mockResolvedValueOnce(req('nda_signed'));
    mockPost.mockResolvedValue({});
    render(<Requests />);
    await waitFor(() => screen.getByText('Kolhapur Foundry Rooftop Team — Volt EPC'));
    expect(screen.getByText('Your role: Execution — Structure and modules')).toBeTruthy();
    fireEvent.press(screen.getByText('Accept'));
    await waitFor(() => screen.getByText('Sign the team NDA to unlock the workspace.'));
    expect(mockPost).toHaveBeenCalledWith('/teams/t1/respond', { decision: 'accept' });
    fireEvent.changeText(screen.getByLabelText('Type "Ravi Patel" to sign'), 'Ravi Patel');
    fireEvent.press(screen.getByText('Sign NDA'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/teams/t1/nda/sign', { typedName: 'Ravi Patel' }));
  });
  it('says so when there are none', async () => {
    mockGet.mockResolvedValue([]);
    render(<Requests />);
    await waitFor(() => screen.getByText('No collaboration requests'));
  });
});

describe('Screen 075 (native) — projects portfolio', () => {
  it('shows role, progress against certified work and the next milestone in words', async () => {
    mockGet.mockResolvedValue([{ id: 'p1', code: 'PRJ-2026-000001', title: '2 MW Chakan rooftop EPC', role: 'lead', site: 'Chakan', status: 'active', progressPct: 60, certifiedPct: 40, overdue: 1, nextMilestone: { title: 'Electrical BoS', dueDate: '2026-11-20' }, value: 8000000000 }]);
    render(<Projects />);
    await waitFor(() => screen.getByText('2 MW Chakan rooftop EPC'));
    expect(screen.getByTestId('project-PRJ-2026-000001').props.children.join('')).toBe('PRJ-2026-000001 · Lead contractor · Chakan');
    expect(screen.getByText('60% reported · 40% certified')).toBeTruthy();
    expect(screen.getByText('Next: Electrical BoS · due 20 Nov · 1 overdue')).toBeTruthy();
    fireEvent.press(screen.getByText('Site progress & photos →'));
    expect(mockPush).toHaveBeenCalledWith('/projects/p1/progress');
  });
});

describe('Screen 110 (native) — announcements', () => {
  it('marks an unread announcement as read when opened', async () => {
    mockGet.mockResolvedValue([{ id: 'n1', title: 'Q4 tender window opens', body: 'Unite Solar will publish three rooftop tenders.', important: true, publishedAt: '2026-11-02T00:00:00Z', read: false }]);
    mockPost.mockResolvedValue({});
    render(<Announcements />);
    await waitFor(() => screen.getByText('Q4 tender window opens'));
    expect(screen.getByLabelText('New. Q4 tender window opens')).toBeTruthy();
    expect(screen.getByText('Important')).toBeTruthy();
    fireEvent.press(screen.getByTestId('ann-n1'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/announcements/n1/read'));
  });
});

describe('Screen 116 (native) — learning centre', () => {
  it('shows progress or the certificate per course and opens the course', async () => {
    mockGet.mockResolvedValue([
      { id: 'c1', code: 'CZ-101', title: 'Working with Unite Group', summary: 'Essentials', level: 'foundation', minutes: 25, modules: 4, completedModules: 1, certificate: null },
      { id: 'c2', code: 'CZ-201', title: 'Lead protection', summary: 'Certificates', level: 'intermediate', minutes: 30, modules: 3, completedModules: 3, certificate: { code: 'CZC-2026-12345678', expiresAt: '2028-11-08' } },
    ]);
    render(<Learning />);
    await waitFor(() => screen.getByText('Working with Unite Group'));
    expect(screen.getByText('25% complete')).toBeTruthy();
    expect(screen.getByText('Certified · CZC-2026-12345678')).toBeTruthy();
    expect(screen.getByText('Foundation')).toBeTruthy();
    fireEvent.press(screen.getByTestId('course-CZ-101'));
    expect(mockPush).toHaveBeenCalledWith('/learning/c1');
  });
});

describe('Screen 143 (native) — my partner profile', () => {
  it('reads in words: level, business types, regions and certifications', async () => {
    mockGet.mockResolvedValue({
      organization: { displayName: 'Sunrise Traders', verificationStatus: 'verified', membershipLevel: 'verified', partnerTypes: ['trader', 'distributor'] },
      profile: { headline: 'Electrical equipment', about: 'Transformers and panels.', sectors: ['power_equipment'], skills: ['Transformers'], certifications: ['ISO9001'], regions: ['IN-MH', 'IN-GJ'], capacityMax: 50000000000 },
      bankTax: { bankName: 'HDFC Bank', accountMasked: '••••4321', verified: true },
    });
    render(<MyProfile />);
    await waitFor(() => screen.getByText('Verified partner · Trader, Distributor'));
    expect(screen.getByText('Maharashtra, Gujarat')).toBeTruthy();
    expect(screen.getByText('ISO 9001')).toBeTruthy();
    expect(screen.getByText('HDFC Bank ••••4321')).toBeTruthy();
    const all = screen.toJSON() ? JSON.stringify(screen.toJSON()) : '';
    expect(RAW.test(all.replace(/"testID":"[^"]*"/g, ''))).toBe(false);
  });
});

describe('Screen 145 (native) — account security', () => {
  it('sets up an authenticator, enables MFA with a 6-digit code and stores the new session', async () => {
    mockPost.mockImplementation((path: string) => Promise.resolve(path === '/auth/mfa/setup'
      ? { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/COLLABIZ:ravi' }
      : { accessToken: 'a', refreshToken: 'r' }));
    render(<Security />);
    expect(screen.getByText('Not enabled')).toBeTruthy();
    fireEvent.press(screen.getByText('Set up authenticator app'));
    await waitFor(() => screen.getByText('JBSWY3DPEHPK3PXP'));
    fireEvent.press(screen.getByText('Open authenticator app'));
    expect(mockOpenURL).toHaveBeenCalledWith('otpauth://totp/COLLABIZ:ravi');
    fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    fireEvent.press(screen.getByText('Enable MFA'));
    await waitFor(() => screen.getByText('MFA enabled.'));
    expect(mockPost).toHaveBeenLastCalledWith('/auth/mfa/enable', { code: '123456', client: 'mobile' });
    expect(mockSetTokens).toHaveBeenCalledWith('a', 'r');
    expect(mockRefresh).toHaveBeenCalled();
  });
  it('shows the reason when the code is rejected', async () => {
    mockPost.mockImplementation((path: string) => path === '/auth/mfa/setup' ? Promise.resolve({ secret: 'S', otpauthUrl: 'otpauth://x' }) : Promise.reject(new ApiError(400, 'That code is not valid. Check the time on your phone.')));
    render(<Security />);
    fireEvent.press(screen.getByText('Set up authenticator app'));
    await waitFor(() => screen.getByLabelText('6-digit code'));
    fireEvent.changeText(screen.getByLabelText('6-digit code'), '000000');
    fireEvent.press(screen.getByText('Enable MFA'));
    await waitFor(() => screen.getByText('That code is not valid. Check the time on your phone.'));
  });
});

describe('Screen 150 (native) — help & support', () => {
  it('expands answers, raises a support request and lists it with a readable status', async () => {
    let tickets: any[] = [];
    mockGet.mockImplementation((p: string) => Promise.resolve(p === '/help/articles' ? [{ id: 'h1', title: 'When is commission paid?', body: 'After the customer pays the certified milestone.' }] : { tickets }));
    mockPost.mockImplementation(() => { tickets = [{ id: 't1', code: 'SUP-2026-000123', subject: 'Payout not received', status: 'waiting_on_partner', overdue: false }]; return Promise.resolve({ code: 'SUP-2026-000123' }); });
    render(<Help />);
    await waitFor(() => screen.getByText('When is commission paid?'));
    fireEvent.press(screen.getByText('When is commission paid?'));
    expect(screen.getByText('After the customer pays the certified milestone.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Subject'), 'Payout not received');
    fireEvent.changeText(screen.getByLabelText('What happened?'), 'Payout for PRJ-2026-000001 milestone 2 has not arrived.');
    fireEvent.press(screen.getByTestId('send-ticket'));
    await waitFor(() => screen.getByText('Request SUP-2026-000123 sent. We reply within 24 hours.'));
    await waitFor(() => screen.getByText('SUP-2026-000123 · Waiting on partner'));
    expect(mockPost).toHaveBeenCalledWith('/support/tickets', expect.objectContaining({ subject: 'Payout not received' }));
  });
});

describe('Screen 158 (native) — live earnings tracker', () => {
  it('shows where each line is and its history in words', async () => {
    mockGet.mockImplementation((p: string) => Promise.resolve(p === '/earnings'
      ? { lines: [{ id: 'e1', description: 'Milestone 2 commission', project: 'PRJ-2026-000001', payable: 52250000, status: 'approved', holdReason: null }] }
      : [{ id: 'j1', createdAt: '2026-11-05T10:00:00Z', action: 'entry.approved', who: 'Finance', note: null }, { id: 'j2', createdAt: '2026-11-04T10:00:00Z', action: 'entry.hold_released', who: 'Finance', note: 'TDS form received' }]));
    render(<Live />);
    await waitFor(() => screen.getByText('Milestone 2 commission'));
    expect(screen.getByLabelText('Status Approved')).toBeTruthy();
    fireEvent.press(screen.getByText('Show history'));
    await waitFor(() => screen.getByText(/· Approved · Finance/));
    expect(screen.getByText(/· Hold released · Finance — TDS form received/)).toBeTruthy();
  });
  it('explains an empty tracker', async () => {
    mockGet.mockResolvedValue({ lines: [] });
    render(<Live />);
    await waitFor(() => screen.getByText('No earnings yet'));
  });
});

describe('Screen 164 (native) — reviews', () => {
  it('replies publicly and appeals a review; an appealed review cannot be appealed twice', async () => {
    const data = (appeals: any[]) => ({ reviews: [{ id: 'r1', reviewer: 'Volt EPC', quality: 5, timeliness: 4, communication: 5, comment: 'Delivered on time.', status: 'published', response: null, createdAt: '2026-10-01' }], appeals });
    mockGet.mockResolvedValueOnce(data([])).mockResolvedValueOnce(data([])).mockResolvedValue(data([{ reviewId: 'r1', status: 'open' }]));
    mockPost.mockResolvedValue({});
    render(<Reviews />);
    await waitFor(() => screen.getByText('Delivered on time.'));
    expect(screen.getByLabelText('4.7 out of 5')).toBeTruthy();
    expect(screen.getByText('Counted')).toBeTruthy();
    fireEvent.press(screen.getByText('Reply'));
    fireEvent.changeText(screen.getByLabelText('Your public reply'), 'Thank you, it was a pleasure.');
    fireEvent.press(screen.getByText('Post reply'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/reviews/r1/response', { response: 'Thank you, it was a pleasure.' }));
    await waitFor(() => screen.getByText('Appeal'));
    fireEvent.press(screen.getByText('Appeal'));
    fireEvent.changeText(screen.getByLabelText('Why this review is wrong'), 'The delay was caused by the client’s late site handover.');
    fireEvent.press(screen.getByText('Submit appeal'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/reputation/appeals', { reviewId: 'r1', reason: 'The delay was caused by the client’s late site handover.' }));
    await waitFor(() => expect(screen.queryByText('Appeal')).toBeNull());
  });
});

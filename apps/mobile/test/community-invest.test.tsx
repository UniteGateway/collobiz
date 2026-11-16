import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
const mockGet = jest.fn(); const mockPost = jest.fn();
jest.mock('../src/api', () => ({ API_URL: 'http://api', api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }));
jest.mock('../src/session', () => ({ useSession: () => ({ me: { fullName: 'Asha Patil', activeOrg: { verificationStatus: 'verified' } } }) }));

import Community from '../app/community';
import Invest from '../app/invest';
import { HomeFeed } from '../src/components/HomeFeed';

const route = (map: Record<string, unknown>) => mockGet.mockImplementation((p: string) => Promise.resolve(map[p]));
beforeEach(() => { [mockGet, mockPost, mockPush].forEach((m) => m.mockReset()); });

describe('Community, Invest together, Home feed (native)', () => {
  it('posts to the wall and messages a member who is online', async () => {
    route({ '/community/online': { visible: true, members: [{ userId: 'u2', name: 'Meera Iyer', org: 'Meera Iyer Consulting', city: 'Bengaluru' }] }, '/community/posts': [] });
    mockPost.mockResolvedValueOnce({ id: 'p1' }).mockResolvedValueOnce({ threadId: 't9' });
    render(<Community />);
    await waitFor(() => screen.getByTestId('post-btn'));
    fireEvent.changeText(screen.getByLabelText('Thought, question or opportunity'), 'Looking for a structural engineer in Pune.');
    fireEvent.press(screen.getByTestId('post-btn'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/community/posts', { body: 'Looking for a structural engineer in Pune.', topic: 'general' }));
    fireEvent.press(screen.getByText('Online (1)'));
    fireEvent.press(screen.getByTestId('dm-u2'));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Hello Meera');
    fireEvent.press(screen.getByTestId('send-dm'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/chat/t9'));
    expect(mockPost).toHaveBeenCalledWith('/chat/direct', { recipientUserId: 'u2', body: 'Hello Meera' });
  });

  it('shows the pro-rata rent share and registers interest only', async () => {
    route({ '/invest/offers': [{ id: 'o1', title: 'Office floor share', location: 'Hyderabad', sponsor: 'ProDeal', summary: 'x', unitLabel: 'sq ft', totalUnits: 10000, unitPrice: 9_000_00, minUnits: 100, projectedMonthlyRent: 6_00_000_00, rentPerUnitMonth: 6000, grossYieldPct: 8, lockInMonths: 36, status: 'interest_open', regulatoryStatus: 'pending', availableUnits: 10000, subscribedPct: 0, mine: null, notice: '' }] });
    mockPost.mockResolvedValue({ ok: true });
    render(<Invest />);
    await waitFor(() => screen.getByTestId('offer-o1'));
    expect(screen.getByText('Awaiting regulatory clearance')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('How many sq ft?'), '2500');
    expect(screen.getByText('₹1,50,000')).toBeTruthy(); // 2,500 of 10,000 sq ft of ₹6 lakh rent
    fireEvent.press(screen.getByTestId('interest-o1'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/invest/offers/o1/interest', { units: 2500 }));
  });

  it('Home feed shows the theme, house ads, apps and opportunities', async () => {
    route({
      '/me/home/feed': { theme: 'energy', themeLabel: 'Energy & power', ads: [{ id: 'house-0', title: 'Become a Unite Solar franchise or store', body: 'Five plans', url: '/unite-solar', ctaLabel: 'Compare plans', house: true }], videos: [], news: [] },
      '/ventures': [{ id: 'v1', slug: 'prodeal', name: 'ProDeal', sector: 'real_estate', open: false, myInterest: null }],
      '/community/online': { members: [] }, '/invest/offers': [],
      '/opportunities': { items: [{ id: 'op1', title: '2 MW rooftop EPC', sector: 'solar', city: 'Pune', estimatedValue: 80 * 100_000_00 }] },
    });
    render(<HomeFeed />);
    await waitFor(() => screen.getByText('Energy & power'));
    expect(screen.getByText('Become a Unite Solar franchise or store')).toBeTruthy();
    await waitFor(() => screen.getByTestId('app-prodeal'));
    expect(screen.getByText('Coming soon')).toBeTruthy();
    fireEvent.press(screen.getByTestId('ad-house-0'));
    expect(mockPush).toHaveBeenCalledWith('/unite-solar');
    await waitFor(() => screen.getByText('2 MW rooftop EPC'));
  });
});

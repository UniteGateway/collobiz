import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ slug: 'nano-bazar' }), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }));

import Ventures from '../app/ventures/index';
import Venture from '../app/ventures/[slug]';

beforeEach(() => { [mockGet, mockPost, mockPush].forEach((m) => m.mockReset()); });
const row = (over: Record<string, unknown>) => ({ id: 'v', slug: 'x', name: 'X', category: 'Cat', sector: 'solar', tagline: 't', stage: 'pilot', open: true, myInterest: null, openOffers: 0, ...over });

describe('Unite businesses (native)', () => {
  it('lists open businesses across sectors and separates coming-soon ones', async () => {
    mockGet.mockResolvedValue([
      row({ id: '1', slug: 'nano-bazar', name: 'Nano Bazar', sector: 'local_commerce', tagline: 'Digital storefronts for local commerce', category: 'Local Commerce · Marketplace' }),
      row({ id: '2', slug: 'wakin', name: 'WAKIN', sector: 'employment', tagline: 'Live hiring', myInterest: 'approved' }),
      row({ id: '3', slug: 'zuppo', name: 'ZUPPO', sector: 'local_commerce', open: false }),
    ]);
    render(<Ventures />);
    await waitFor(() => screen.getByTestId('venture-nano-bazar'));
    expect(screen.getByText('Retail & Local Commerce')).toBeTruthy();
    expect(screen.getByText('Jobs & Workforce')).toBeTruthy();
    expect(screen.getByText('You promote this')).toBeTruthy();
    expect(screen.queryByTestId('venture-zuppo')).toBeNull();
    fireEvent.press(screen.getByText('Coming soon'));
    expect(screen.getByTestId('venture-zuppo')).toBeTruthy();
    fireEvent.press(screen.getByTestId('venture-zuppo'));
    expect(mockPush).toHaveBeenCalledWith('/ventures/zuppo');
  });

  it('asks to promote a business with the roles it needs and a plan', async () => {
    const d = { slug: 'nano-bazar', name: 'Nano Bazar', category: 'Local Commerce · Marketplace', sector: 'local_commerce', tagline: 'Digital storefronts for local commerce', summary: 'Online storefronts for local shops.', stage: 'pilot', roles: ['recruit_merchants', 'refer_customers'], open: true, availability: 'Open to partners', company: null, rewardNote: 'Rewards are set in each offer.', promoters: 2, offers: [], myInterest: null };
    mockGet.mockResolvedValueOnce(d).mockResolvedValue({ ...d, myInterest: { status: 'pending', roles: ['recruit_merchants'], message: 'x', decisionNote: null } });
    mockPost.mockResolvedValue({ status: 'pending' });
    render(<Venture />);
    await waitFor(() => screen.getByText('Promote Nano Bazar'));
    expect(screen.getByText('Bring merchants and sellers · Refer customers')).toBeTruthy();
    fireEvent.press(screen.getByText('Bring merchants and sellers'));
    fireEvent.changeText(screen.getByLabelText('Your network and plan'), 'We supply 300 shops in Ahmedabad and can onboard them.');
    fireEvent.press(screen.getByTestId('ask-promote'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/ventures/nano-bazar/interest', { roles: ['recruit_merchants'], message: 'We supply 300 shops in Ahmedabad and can onboard them.' }));
    await waitFor(() => screen.getByText('Request sent'));
  });
});

import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }));

import EnquiryDesk from '../app/trading/enquiry';

const market = { isSupplier: false, products: [{ id: 'p1', source: 'supplier', name: '630 kVA transformer', supplier: 'Sunrise Traders', price: 98000000, unit: 'nos' }], catalog: [], openRequirements: [] };

describe('Screen 088 (mobile) — enquiry & price request', () => {
  beforeEach(() => {
    mockGet.mockReset(); mockPost.mockReset();
    mockGet.mockImplementation((path: string) => {
      if (path === '/trading/market') return Promise.resolve(market);
      if (path === '/trading/enquiries') return Promise.resolve([]);
      return Promise.resolve({ code: 'ENQ-2026-000001', subject: '630 kVA transformer', status: 'open', messages: [{ id: 'm1', org: 'Meera Iyer Consulting', body: 'Need two', createdAt: new Date().toISOString() }], quotations: [] });
    });
  });
  it('sends a product price request and shows when it was routed to a distributor', async () => {
    mockPost.mockResolvedValue({ id: 'e1', routedToDistributor: true });
    render(<EnquiryDesk />);
    await waitFor(() => screen.getByText('No enquiries yet'));
    fireEvent.press(screen.getByText('New price request'));
    await waitFor(() => screen.getByTestId('enq-pick-p1'));
    fireEvent.press(screen.getByTestId('enq-pick-p1'));
    expect(screen.getByTestId('enq-send').props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId('enq-qty'), '2 nos');
    fireEvent.changeText(screen.getByTestId('enq-msg'), 'Delivered to Hosur by January please');
    fireEvent.press(screen.getByTestId('enq-send'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/trading/enquiries', { supplierProductId: 'p1', quantity: '2 nos', message: 'Delivered to Hosur by January please' }));
    await waitFor(() => screen.getByText(/authorised distributor for your region/));
  });
});

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

import Powertek from '../app/powertek/index';
import MyEnquiries from '../app/powertek/enquiries';

beforeEach(() => { [mockGet, mockPost, mockPush].forEach((m) => m.mockReset()); });

describe('Powertek products (native)', () => {
  it('picks products and registers a customer enquiry with consent', async () => {
    mockGet.mockResolvedValue({ total: 360, note: 'Prices are quoted by the company.', lines: [{ line: 'POWERTEK AGRI', count: 40 }], items: [{ id: 'i1', name: 'Solar Water Pump 5 HP', productLine: 'POWERTEK AGRI', category: 'Solar Pumps', description: 'x', hasImage: false, commissionBps: 400 }] });
    mockPost.mockResolvedValue({ code: 'PE-2026-000001' });
    render(<Powertek />);
    await waitFor(() => screen.getByText('Solar Water Pump 5 HP'));
    expect(screen.getByText('Earn 4.00% of order')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pt-i1'));
    fireEvent.changeText(screen.getByLabelText('Qty — Solar Water Pump 5 HP'), '12');
    fireEvent.changeText(screen.getByLabelText('Customer (company or person)'), 'Sri Rama Agro');
    fireEvent.changeText(screen.getByLabelText('City'), 'Nalgonda');
    fireEvent.changeText(screen.getByLabelText('State'), 'Telangana');
    fireEvent.changeText(screen.getByLabelText('PIN code'), '508001');
    fireEvent.changeText(screen.getByLabelText('Customer requirement'), 'Pumps for 12 farms before kharif.');
    fireEvent(screen.getByLabelText('Customer agreed to be contacted'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('pt-send'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/product-sales/powertek/enquiries', expect.objectContaining({ customerName: 'Sri Rama Agro', consent: true, lines: [{ catalogItemId: 'i1', qty: 12 }] }), true));
    await waitFor(() => screen.getByText('Enquiry PE-2026-000001 sent'));
  });

  it('lists my enquiries with commission and the no-guarantee note', async () => {
    mockGet.mockResolvedValue({ channel: 'Agent / individual', totals: { open: 1, won: 1, commissionWon: 32_000_00, commissionEarned: 0 }, disclaimer: 'This is not a guaranteed income.',
      enquiries: [{ id: 'e', code: 'PE-1', customerName: 'Sri Rama Agro', city: 'Nalgonda', lines: [{ name: 'Pump', qty: 12 }], status: 'won', statusLabel: 'Order won', protectedUntil: '2027-02-13', quoteValue: 9_00_000_00, orderValue: 8_00_000_00, commission: 32_000_00, rateBps: 400 }] });
    render(<MyEnquiries />);
    await waitFor(() => screen.getByText('Order won'));
    expect(screen.getByText(/commission ₹32,000/)).toBeTruthy();
    expect(screen.getByText('This is not a guaranteed income.')).toBeTruthy();
  });
});

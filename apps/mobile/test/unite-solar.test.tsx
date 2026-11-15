import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn(); const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useLocalSearchParams: () => ({ package: 'basic_franchise' }), Stack: { Screen: () => null } }));
const mockGet = jest.fn(); const mockPost = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }));

import Home from '../app/unite-solar/index';
import Apply from '../app/unite-solar/apply';
import Sales from '../app/unite-solar/sales';
import Earnings from '../app/unite-solar/earnings';

const L = 100_000_00;
const unit = (over = {}) => ({ id: 'u1', code: 'US-1', packageCode: 'store_with_stock', packageName: 'Store Partner — With Stock', status: 'live', statusLabel: 'Live', city: 'Peenya', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560058', territory: 'Catchment', leadDnaAddon: false, paymentStatus: 'verified', decisionNote: null, pricing: { package: 5 * L, leadDnaAddon: 0, subtotal: 5 * L, gst: 0.9 * L, total: 5.9 * L }, ...over });
const route = (map: Record<string, unknown>) => mockGet.mockImplementation((p: string) => Promise.resolve(map[p]));
beforeEach(() => { [mockGet, mockPost, mockPush, mockReplace].forEach((m) => m.mockReset()); });

describe('Unite Solar (native)', () => {
  it('home shows progress, catchment, LeadDNA and the five earnings streams without promising income', async () => {
    route({
      '/network/mine': { verified: true, units: [unit()] },
      '/network/units/u1/dashboard': { unit: { ...unit(), packageName: 'Store' }, package: { name: 'Store Partner — With Stock', inventoryEnabled: true }, steps: [{ key: 'submitted', label: 'Application submitted', done: true }, { key: 'active', label: 'Partnership active', done: true }],
        territory: null, catchment: { pincode: '560058' }, leadDna: { entitled: false, offered: 'not available' }, sales: { orders: 1, value: 72000_00, awaitingAcceptance: 0, margin: 4000_00 }, inventory: { value: 3_13_700_00, lowStock: 7 },
        earnings: ['Product / kit sales commission', 'District partner profit share', 'Inter-franchise commission', 'Solar park development commission', 'Investment facilitation commission'].map((label, i) => ({ stream: `s${i}`, label, pending: 0, approved: 0, paid: 0 })) },
    });
    render(<Home />);
    await waitFor(() => screen.getByText('✓ Partnership active'));
    expect(screen.getByText('PIN 560058 — not exclusive')).toBeTruthy();
    expect(screen.getByText(/Investment facilitation commission/)).toBeTruthy();
    expect(screen.getByText(/do not promise any fixed/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('us-stock'));
    expect(mockPush).toHaveBeenCalledWith('/unite-solar/stock');
  });

  it('apply: the server prices the plan with LeadDNA; submit needs verification', async () => {
    route({
      '/network/packages': [{ code: 'basic_franchise', name: 'Basic Franchise', price: 2 * L, exclusive: true, territoryLevel: 'mandal', leadDnaIncluded: false, leadDnaAddonPrice: 5 * L }],
      '/network/mine': { verified: true, units: [] },
      '/network/territories': [{ id: 't1', name: 'Ghatkesar mandal', district: 'Medchal-Malkajgiri', pincodes: ['501301'] }],
    });
    mockPost.mockResolvedValueOnce({ ...unit({ id: 'd1', status: 'draft' }), pricing: { package: 2 * L, leadDnaAddon: 5 * L, subtotal: 7 * L, gst: 1.26 * L, total: 8.26 * L } }).mockResolvedValue({ ok: true });
    render(<Apply />);
    await waitFor(() => screen.getByTestId('pick-basic_franchise'));
    fireEvent(screen.getByLabelText('Add LeadDNA software'), 'valueChange', true);
    fireEvent.changeText(screen.getByLabelText('State'), 'Telangana');
    await waitFor(() => screen.getByText('Ghatkesar mandal'));
    fireEvent.press(screen.getByText('Ghatkesar mandal'));
    fireEvent.changeText(screen.getByLabelText('City / town'), 'Ghatkesar');
    fireEvent.changeText(screen.getByLabelText('PIN code'), '501301');
    fireEvent.changeText(screen.getByLabelText('About your business'), 'Electrical contractor moving into rooftop solar.');
    fireEvent.press(screen.getByTestId('us-save'));
    await waitFor(() => screen.getByText('₹8,26,000'));
    expect(mockPost).toHaveBeenCalledWith('/network/applications', expect.objectContaining({ packageCode: 'basic_franchise', leadDnaAddon: true, territoryId: 't1', district: 'Medchal-Malkajgiri' }));
    fireEvent.press(screen.getByTestId('us-submit'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/network/applications/d1/submit'));
    expect(mockReplace).toHaveBeenCalledWith('/unite-solar');
  });

  it('sales: a stock store records a sale from its stock with catalogue prices only', async () => {
    route({
      '/network/mine': { verified: true, units: [unit()] },
      '/network/units/u1/sales': [],
      '/network/products': { products: [{ id: 'p1', name: '30 W solar street light', sku: 'US-SL-30', customerPrice: 12_400_00 }] },
    });
    mockPost.mockResolvedValue({ id: 'o1' });
    render(<Sales />);
    await waitFor(() => screen.getByTestId('product-US-SL-30'));
    fireEvent.press(screen.getByText('From my stock'));
    fireEvent.changeText(screen.getByLabelText('Customer name'), 'Lakshmi Narayan');
    fireEvent.press(screen.getByTestId('product-US-SL-30'));
    fireEvent.press(screen.getByTestId('us-sale'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/network/units/u1/sales', { customerName: 'Lakshmi Narayan', pincode: '560058', fulfilment: 'from_stock', lines: [{ productId: 'p1', qty: 1 }] }, true));
  });

  it('earnings: five streams with base × rate and status', async () => {
    route({ '/network/earnings': { resaleMargin: 4000_00, settlements: [], streams: ['product', 'district_profit', 'inter_franchise', 'solar_park', 'investment'].map((s) => ({ stream: s, label: s, totals: { earned: 0, pending: 0, approved: 0, paid: 0, reversed: 0 }, entries: s === 'inter_franchise' ? [{ id: 'e', reference: 'interfranchise:PRJ-7', description: 'x', base: 4 * L, rateBps: 1250, amount: 50_000_00, status: 'qualified', statusLabel: 'Qualified' }] : [] })) } });
    render(<Earnings />);
    await waitFor(() => screen.getByTestId('stream-investment'));
    expect(screen.getByText('interfranchise:PRJ-7 · ₹4,00,000 × 12.5%')).toBeTruthy();
    expect(screen.getByText('Qualified')).toBeTruthy();
  });
});

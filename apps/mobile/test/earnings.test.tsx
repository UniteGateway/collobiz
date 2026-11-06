import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a) } }));

import Earnings from '../app/earnings/index';
import Payments from '../app/payments';

describe('Screens 095/100 (mobile) — earnings and payments', () => {
  beforeEach(() => mockGet.mockReset());
  it('shows projected vs earned separately and labels each line by ledger state', async () => {
    mockGet.mockResolvedValue({ totals: { projected: 1800000, earnedNotPaid: 522500, paidThisFy: 0, tdsThisFy: 0 }, buckets: {}, readyToRequest: 0, lines: [
      { id: 'l1', description: 'Milestone 1: Civil', project: 'Chakan', status: 'earned', payable: 522500, tds: 27500 },
      { id: 'l2', description: 'Milestone 2: BoS', project: 'Chakan', status: 'estimated', payable: 47500, tds: 2500 },
    ] });
    render(<Earnings />);
    await waitFor(() => screen.getByTestId('line-l1'));
    expect(screen.getByText('Earned')).toBeTruthy();
    expect(screen.getAllByText('Projected')).toHaveLength(2); // KPI and estimated line both say "Projected"
    expect(screen.getByText(/earned only when the customer pays/)).toBeTruthy();
  });
  it('lists settlements with their bank reference', async () => {
    mockGet.mockResolvedValue([{ id: 'p1', code: 'PAY-2026-000001', payable: 522500, tds: 27500, partnerInvoiceNo: 'MIC/001', status: 'settled', settlement: { method: 'neft', bankReference: 'HDFCN26310000001', paidAt: new Date().toISOString() } }]);
    render(<Payments />);
    await waitFor(() => screen.getByTestId('utr-PAY-2026-000001'));
    expect(screen.getByTestId('utr-PAY-2026-000001').props.children.join('')).toMatch(/HDFCN26310000001/);
  });
});

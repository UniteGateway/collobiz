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

import ActionBoard from '../app/action-os';

const item = (o: object) => ({ id: 'n1', title: 'Collect invoice INV-2026-900002', kindLabel: 'Collection', sourceApp: 'projects', organization: 'Volt EPC', recordUrl: '/projects/p1/payments', dueAt: '2026-10-21T13:00:00Z', valuePaise: 2_00_00_000_00, band: 'P1', why: ['overdue by 26 days'], verificationLabel: 'Confirmed', verification: 'confirmed', nextStep: 'Contact the payer and confirm a payment date.', confidentiality: 'normal', status: 'open', kind: 'collection', ...o });
beforeEach(() => { [mockGet, mockPost, mockPush].forEach((m) => m.mockReset()); });

describe('ACTION OS (native)', () => {
  it('shows counts and ranked notices with why, the suggestion and source links; Done calls the API', async () => {
    mockGet.mockResolvedValue({ counts: { open: 2, critical: 0, high: 1, overdue: 1, decisions: 1, followUps: 0, thisWeek: 2 }, items: [item({}), item({ id: 'n2', title: 'Review application for OFF-1', why: [], nextStep: 'Review the record and record your decision.', band: 'P2', kind: 'decision', kindLabel: 'Decision', dueAt: null, valuePaise: null, recordUrl: '/business-offers/o1' })] });
    mockPost.mockResolvedValue({});
    render(<ActionBoard />);
    await waitFor(() => screen.getByText('Collect invoice INV-2026-900002'));
    expect(screen.getByText(/Why it matters: overdue by 26 days/)).toBeTruthy();
    expect(screen.getByText(/Suggested next step: Contact the payer/)).toBeTruthy();
    expect(screen.getByText('No due date in the source')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-n1'));
    expect(mockPush).toHaveBeenCalledWith('/projects/p1/payments');
    fireEvent.press(screen.getByTestId('done-n1'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/action-os/notices/n1/complete', {}));
    fireEvent.press(screen.getAllByText('Decisions').slice(-1)[0]);
    await waitFor(() => expect(screen.queryByText('Collect invoice INV-2026-900002')).toBeNull());
    expect(screen.getByText('Review application for OFF-1')).toBeTruthy();
  });
  it('empty board explains what will appear', async () => {
    mockGet.mockResolvedValue({ counts: { open: 0, critical: 0, high: 0, overdue: 0, decisions: 0, followUps: 0, thisWeek: 0 }, items: [] });
    render(<ActionBoard />);
    await waitFor(() => screen.getByText('Nothing needs attention'));
  });
});

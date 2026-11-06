import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), Stack: { Screen: () => null } }));
jest.mock('../src/session', () => ({ useSession: () => ({ refresh: jest.fn() }) }));
const mockGet = jest.fn();
const mockRequest = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), request: (...a: unknown[]) => mockRequest(...a) } }));

import Status from '../app/onboarding/status';

const base = { organization: { displayName: 'Nova Projects', verificationStatus: 'not_started' }, steps: [{ step: 'account_type', complete: true }], canSubmit: false, history: [] };

describe('Screen 022 (mobile) — verification status', () => {
  beforeEach(() => { mockGet.mockReset(); mockRequest.mockReset(); });
  it('disables submission until every step is complete', async () => {
    mockGet.mockResolvedValue(base);
    render(<Status />);
    await waitFor(() => expect(screen.getByTestId('kyb-submit')).toBeTruthy());
    expect(screen.getByTestId('kyb-submit').props.accessibilityState.disabled).toBe(true);
  });
  it('submits with a stable idempotency key and shows the reviewer reason on re-upload', async () => {
    mockGet.mockResolvedValueOnce({ ...base, canSubmit: true }).mockResolvedValue({ ...base, organization: { displayName: 'Nova', verificationStatus: 'reupload_requested' }, history: [{ at: new Date().toISOString(), from: 'under_review', to: 'reupload_requested', reason: 'PAN copy unreadable' }] });
    mockRequest.mockResolvedValue({});
    render(<Status />);
    await waitFor(() => screen.getByTestId('kyb-submit'));
    fireEvent.press(screen.getByTestId('kyb-submit'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('POST', '/onboarding/submit', {}, { idempotencyKey: expect.any(String) }));
    await waitFor(() => expect(screen.getAllByText('PAN copy unreadable').length).toBeGreaterThan(0));
  });
});

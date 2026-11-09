import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }));

import PilotScreen from '../app/pilot';

beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); });

describe('Pilot check-in (native)', () => {
  it('needs the four required answers, then sends them from the mobile app', async () => {
    mockGet.mockResolvedValue({ lastAt: null, canAnswer: true, nextAt: null });
    mockPost.mockResolvedValue({ id: 'f1', thanks: true });
    render(<PilotScreen />);
    await waitFor(() => screen.getByTestId('send-pilot'));
    expect(screen.getByTestId('send-pilot').props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('Usefulness-4'));
    fireEvent.press(screen.getByTestId('Ease-3'));
    fireEvent.press(screen.getByTestId('Recommend-9'));
    fireEvent.press(screen.getByText('Offers for you'));
    fireEvent.changeText(screen.getByLabelText('6. What stopped you or didn’t work? (optional)'), 'Could not attach the quote');
    fireEvent.press(screen.getByText('Not sure yet'));
    fireEvent.press(screen.getByTestId('send-pilot'));
    await waitFor(() => screen.getByText('Thank you'));
    expect(mockPost).toHaveBeenCalledWith('/pilot-feedback', expect.objectContaining({ usefulness: 4, ease: 3, recommend: 9, used: ['offers'], blockers: 'Could not attach the quote', continueUse: 'maybe', platform: 'mobile', contactOk: false }));
  });

  it('tells people who already checked in today when they can send the next one', async () => {
    mockGet.mockResolvedValue({ lastAt: new Date().toISOString(), canAnswer: false, nextAt: new Date(Date.now() + 20 * 3600_000).toISOString() });
    render(<PilotScreen />);
    await waitFor(() => screen.getByText('You’ve already checked in today'));
    expect(screen.queryByTestId('send-pilot')).toBeNull();
  });
});

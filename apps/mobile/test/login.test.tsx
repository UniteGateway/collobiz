import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@collabiz/types';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn() }), useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
const mockSignIn = jest.fn();
jest.mock('../src/session', () => ({ useSession: () => ({ signIn: mockSignIn, refresh: jest.fn() }) }));
jest.mock('../src/api', () => ({ api: { post: jest.fn() }, tokens: { set: jest.fn() } }));

import Login from '../app/login';

describe('Screen 011 (mobile) — login', () => {
  beforeEach(() => { mockSignIn.mockReset(); mockReplace.mockReset(); });
  it('signs in and routes to home', async () => {
    mockSignIn.mockResolvedValueOnce(undefined);
    render(<Login />);
    fireEvent.changeText(screen.getByTestId('login-email'), 'asha@voltepc.example');
    fireEvent.changeText(screen.getByTestId('login-password'), 'Collabiz#2026');
    fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
    expect(mockSignIn).toHaveBeenCalledWith('asha@voltepc.example', 'Collabiz#2026', undefined);
  });
  it('reveals the authenticator code field when the API requires MFA', async () => {
    mockSignIn.mockRejectedValueOnce(new ApiError(401, 'Enter the 6-digit code', [], { mfaRequired: true }));
    render(<Login />);
    fireEvent.changeText(screen.getByTestId('login-email'), 'superadmin@collabiz.local');
    fireEvent.changeText(screen.getByTestId('login-password'), 'Collabiz#2026');
    fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(screen.getByLabelText('Authentication code')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('shows server validation errors inline', async () => {
    mockSignIn.mockRejectedValueOnce(new ApiError(401, 'Incorrect email or password'));
    render(<Login />);
    fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(screen.getByText('Incorrect email or password')).toBeTruthy());
  });
});

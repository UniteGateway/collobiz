import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }));

import CountryPartner from '../app/global/country-partner';

describe('Screen 120 (mobile) — country partner registration', () => {
  it('needs sectors and a real plan, then submits the application for Unite Group review', async () => {
    mockGet.mockResolvedValue({ applications: [] });
    mockPost.mockResolvedValue({ id: 'a1' });
    render(<CountryPartner />);
    await waitFor(() => screen.getByTestId('apply'));
    expect(screen.getByTestId('apply').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByText('Kenya'));
    fireEvent.press(screen.getByTestId('sector-solar'));
    fireEvent.changeText(screen.getByLabelText('Local company'), 'Volt EPC Kenya Ltd');
    fireEvent.changeText(screen.getByLabelText('Registration number'), 'PVT-KE-2207');
    fireEvent.changeText(screen.getByLabelText('First-year plan'), 'Serve C&I rooftop demand in Nairobi with Unite Exim supply and two local installation crews.');
    fireEvent.press(screen.getByTestId('apply'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/global/country-partner/applications', expect.objectContaining({ country: 'KE', sectors: ['solar'], localEntity: 'Volt EPC Kenya Ltd', teamSize: 3 })));
    await waitFor(() => screen.getByText('Application sent'));
  });
});

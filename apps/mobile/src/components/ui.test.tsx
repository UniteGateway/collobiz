import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { Button, Badge, Field, ScreenView } from './ui';
import { colors } from '@collabiz/ui/tokens';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

describe('mobile design system', () => {
  it('uses brand tokens shared with web', () => {
    expect(colors.navy900).toBe('#011E48');
    expect(colors.green500).toBe('#55A444');
  });
  it('Button fires onPress and is disabled while loading', () => {
    const onPress = jest.fn();
    const { rerender } = render(<Button title="Submit" onPress={onPress} testID="b" />);
    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Button title="Submit" onPress={onPress} testID="b" loading />);
    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('Badge humanises workflow states', () => {
    render(<Badge status="reupload_requested" />);
    expect(screen.getByText('Reupload requested')).toBeTruthy();
  });
  it('Field shows validation errors', () => {
    render(<Field label="Email" error="Enter a valid email" />);
    expect(screen.getByText('Enter a valid email')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
  it('ScreenView renders registry title and screen id', () => {
    render(<ScreenView id="011"><></></ScreenView>);
    expect(screen.getByText('Login / Create Account')).toBeTruthy();
    expect(screen.getByTestId('screen-011')).toBeTruthy();
  });
});

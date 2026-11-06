import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'p1' }), useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
const mockGet = jest.fn();
const mockUpload = jest.fn();
jest.mock('../src/api', () => ({ API_URL: 'http://x', api: { get: (...a: unknown[]) => mockGet(...a), upload: (...a: unknown[]) => mockUpload(...a) } }));

import SiteProgress from '../app/projects/[id]/progress';

const milestones = { milestones: [{ id: 'm1', seq: 1, title: 'Shed A mounting', status: 'in_progress', progressPct: 60 }, { id: 'm2', seq: 2, title: 'BoS', status: 'planned', progressPct: 0 }] };

describe('Screen 079 (mobile) — site progress & photos', () => {
  beforeEach(() => {
    mockGet.mockReset(); mockUpload.mockReset();
    mockGet.mockImplementation((path: string) => Promise.resolve(path.endsWith('/milestones') ? milestones : [{ id: 'u1', note: 'Purlins fixed', org: 'Volt EPC', createdAt: new Date().toISOString(), milestone: 'Shed A mounting', progressPct: 60, attachments: [] }]));
  });
  it('lists only milestones that can take progress and posts the update as multipart', async () => {
    mockUpload.mockResolvedValue({});
    render(<SiteProgress />);
    await waitFor(() => screen.getByText('Purlins fixed'));
    expect(screen.queryByText(/BoS/)).toBeNull(); // planned milestones cannot take progress
    fireEvent.press(screen.getByText('1. Shed A mounting (60%)'));
    fireEvent.changeText(screen.getByTestId('update-note'), 'Modules mounted on Shed A');
    fireEvent.changeText(screen.getByTestId('update-pct'), '80');
    fireEvent.press(screen.getByTestId('update-post'));
    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith('/projects/p1/updates', expect.any(FormData)));
    const fd = mockUpload.mock.calls[0][1] as FormData & { _parts?: [string, unknown][] };
    const get = (k: string) => (typeof fd.get === 'function' ? fd.get(k) : Object.fromEntries(fd._parts ?? [])[k]); // Node or React Native FormData
    expect([get('note'), get('milestoneId'), get('progressPct')]).toEqual(['Modules mounted on Shed A', 'm1', '80']);
    await waitFor(() => screen.getByText(/Update posted/));
  });
  it('keeps the post button disabled until there is a note', async () => {
    render(<SiteProgress />);
    await waitFor(() => screen.getByTestId('update-post'));
    expect(screen.getByTestId('update-post').props.accessibilityState.disabled).toBe(true);
  });
});

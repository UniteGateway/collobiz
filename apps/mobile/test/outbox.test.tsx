import React from 'react';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react-native';
import { ApiError } from '@collabiz/types';
import { Outbox, memoryStore, setOutbox } from '../src/outbox';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'p1' }), useRouter: () => ({ push: jest.fn() }), Stack: { Screen: () => null } }));
jest.mock('expo-image-picker', () => ({ requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => undefined }) }));
const mockGet = jest.fn();
const mockUpload = jest.fn();
jest.mock('../src/api', () => ({ API_URL: 'http://x', api: { get: (...a: unknown[]) => mockGet(...a), upload: (...a: unknown[]) => mockUpload(...a) } }));

import SiteProgress from '../app/projects/[id]/progress';

describe('Offline outbox', () => {
  it('sends in order, stops when offline, marks rejected items instead of retrying them', async () => {
    const box = new Outbox(memoryStore());
    await box.add({ projectId: 'p1', note: 'First', photos: [] });
    await box.add({ projectId: 'p1', note: 'Rejected one', photos: [] });
    await box.add({ projectId: 'p1', note: 'Third', photos: [] });
    const offline = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    expect(await box.flush(offline)).toEqual({ sent: 0, left: 3 });
    expect(offline).toHaveBeenCalledTimes(1); // stopped at the first network failure
    const online = jest.fn().mockImplementation(async (it) => { if (it.note === 'Rejected one') throw new ApiError(400, 'Progress cannot go backwards'); });
    expect(await box.flush(online)).toEqual({ sent: 2, left: 1 });
    const [left] = await box.list();
    expect(left).toMatchObject({ note: 'Rejected one', error: 'Progress cannot go backwards' });
    expect(await box.flush(online)).toEqual({ sent: 0, left: 1 }); // not retried in a loop
  });

  it('site progress saves the update on the phone when there is no signal, then sends it', async () => {
    const box = new Outbox(memoryStore());
    setOutbox(box);
    mockGet.mockImplementation((path: string) => Promise.resolve(path.endsWith('/milestones') ? { milestones: [] } : []));
    mockUpload.mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValue({});
    render(<SiteProgress />);
    await waitFor(() => screen.getByTestId('update-post'));
    fireEvent.changeText(screen.getByTestId('update-note'), 'Inverter room roof done');
    fireEvent.press(screen.getByTestId('update-post'));
    await waitFor(() => screen.getByText(/saved on this phone/));
    expect(screen.getByTestId('outbox-item')).toHaveTextContent('Inverter room roof done');
    await act(async () => { fireEvent.press(screen.getByTestId('outbox-send')); });
    await waitFor(() => expect(screen.queryByTestId('outbox-item')).toBeNull());
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it('a validation error from the server is shown, not queued', async () => {
    setOutbox(new Outbox(memoryStore()));
    mockGet.mockImplementation((path: string) => Promise.resolve(path.endsWith('/milestones') ? { milestones: [] } : []));
    mockUpload.mockReset().mockRejectedValue(new ApiError(400, 'Add a longer note'));
    render(<SiteProgress />);
    await waitFor(() => screen.getByTestId('update-post'));
    fireEvent.changeText(screen.getByTestId('update-note'), 'Short');
    fireEvent.press(screen.getByTestId('update-post'));
    await waitFor(() => screen.getByText('Add a longer note'));
    expect(screen.queryByTestId('outbox-item')).toBeNull();
  });
});

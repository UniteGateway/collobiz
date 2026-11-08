import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ id: 't1' }), Redirect: () => null, Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), put: (...a: unknown[]) => mockPut(...a) } }));
jest.mock('../src/session', () => ({ useSession: () => ({ me: { id: 'u-asha', fullName: 'Asha Patil' } }) }));

import Messages from '../app/(tabs)/messages';
import Chat from '../app/chat/[id]';
import MeetingRoom from '../app/meetings/[id]';
import Notifications from '../app/notifications';
import NotificationPrefs from '../app/settings/notifications';

beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockPut.mockReset(); mockPush.mockReset(); });

describe('Stage 13 (native)', () => {
  it('Screen 105 — inbox lists conversations with unread counts and opens a thread', async () => {
    mockGet.mockResolvedValue([
      { id: 't1', kind: 'direct', title: 'Deepak Rao (Deccan Distributors)', lastMessageAt: new Date().toISOString(), unread: 2, preview: { author: 'Deepak Rao', text: 'Price holds until Friday' } },
      { id: 't2', kind: 'project', title: 'PRJ-2026-000001 · Chakan rooftop', lastMessageAt: null, unread: 0, preview: null },
    ]);
    render(<Messages />);
    await waitFor(() => screen.getByText('Price holds until Friday'));
    expect(screen.getByLabelText('Deepak Rao (Deccan Distributors), 2 unread')).toBeTruthy();
    fireEvent.press(screen.getByText('Unread'));
    expect(screen.queryByText('PRJ-2026-000001 · Chakan rooftop')).toBeNull();
    fireEvent.press(screen.getByTestId('thread-t1'));
    expect(mockPush).toHaveBeenCalledWith('/chat/t1');
  });

  it('Screen 106 — chat shows bubbles, placeholders for removed messages, and sends', async () => {
    mockGet.mockResolvedValue({ id: 't1', kind: 'direct', subject: null, retentionDays: 730, members: [{ userId: 'u-asha', name: 'Asha Patil', org: 'Volt EPC' }, { userId: 'u-deepak', name: 'Deepak Rao', org: 'Deccan' }],
      messages: [
        { id: 'm1', author: 'Deepak Rao', org: 'Deccan', mine: false, createdAt: new Date().toISOString(), body: 'Two units in stock', state: 'visible', canDelete: false },
        { id: 'm2', author: 'Asha Patil', org: 'Volt EPC', mine: true, createdAt: new Date().toISOString(), body: null, state: 'deleted', canDelete: false },
      ] });
    mockPost.mockResolvedValue({ id: 'm3' });
    render(<Chat />);
    await waitFor(() => screen.getByText('Two units in stock'));
    expect(screen.getByText('Message deleted')).toBeTruthy();
    expect(screen.getByText(/Encrypted at rest · kept 2 years/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Message'), 'Please hold both');
    fireEvent.press(screen.getByTestId('send'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/chat/threads/t1/messages', { body: 'Please hold both' }));
  });

  it('Screen 108 — room shows my own RSVP, people, and explains that video is not connected', async () => {
    const soon = Date.now() + 5 * 60_000;
    mockGet.mockResolvedValue({ id: 'mt', title: 'Transformer delivery', agenda: 'Confirm dates', startsAt: new Date(soon).toISOString(), endsAt: new Date(soon + 1800_000).toISOString(), status: 'scheduled', cancelReason: null, minutes: null, actionItems: [], isOrganizer: false,
      attendees: [{ userId: 'u-deepak', name: 'Deepak Rao', org: 'Deccan', rsvp: 'accepted', joinedAt: null }, { userId: 'u-asha', name: 'Asha Patil', org: 'Volt EPC', rsvp: 'tentative', joinedAt: null }],
      video: { configured: false, joinable: true, joinUrl: null } });
    render(<MeetingRoom />);
    await waitFor(() => screen.getByText('Confirm dates'));
    expect(screen.getByRole('tab', { name: 'Maybe' }).props.accessibilityState.selected).toBe(true); // mine, not the organiser's
    expect(screen.getByText(/Video isn’t connected in this environment/)).toBeTruthy();
    expect(screen.getByTestId('join')).toBeTruthy();
  });

  it('Screen 111 — notifications open the matching native screen and mark read', async () => {
    mockGet.mockResolvedValue({ unread: 1, items: [{ id: 'n1', kind: 'meeting', title: 'Meeting invite', body: 'Tomorrow 11:00', link: '/meetings?id=11111111-2222-3333-4444-555555555555', createdAt: new Date().toISOString(), readAt: null }] });
    mockPost.mockResolvedValue({ ok: true });
    render(<Notifications />);
    await waitFor(() => screen.getByText('Meeting invite'));
    fireEvent.press(screen.getByTestId('notif-n1'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/meetings/11111111-2222-3333-4444-555555555555'));
    expect(mockPost).toHaveBeenCalledWith('/notifications/read', { ids: ['n1'] });
  });

  it('Screen 147 — mandatory email cannot be switched off; changes save', async () => {
    mockGet.mockResolvedValue([{ kind: 'contract', email: true, sms: false, push: true, mandatory: true }, { kind: 'message', email: false, sms: false, push: true, mandatory: false }]);
    mockPut.mockResolvedValue([]);
    render(<NotificationPrefs />);
    await waitFor(() => screen.getByTestId('pref-contract-email'));
    expect(screen.getByTestId('pref-contract-email').props.disabled).toBe(true);
    fireEvent(screen.getByTestId('pref-message-email'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('save-prefs'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/me/notification-preferences', { preferences: expect.arrayContaining([{ kind: 'message', email: true, sms: false, push: true }]) }));
  });
});

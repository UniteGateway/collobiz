import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => mockParams, Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('../src/api', () => ({ API_URL: 'http://x', api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), put: (...a: unknown[]) => mockPut(...a) } }));

import ProjectPayments from '../app/projects/[id]/payments';
import DisputeCase from '../app/disputes/[id]';
import VoiceLead from '../app/leads/voice';
import Challenge from '../app/challenges/[cid]';
import RescueOffer from '../app/rescue/[rid]';
import { WhatsappPrefs } from '../src/components/WhatsappPrefs';

beforeEach(() => { mockGet.mockReset(); mockPost.mockReset().mockResolvedValue({}); mockPut.mockReset().mockResolvedValue({}); mockPush.mockReset(); });

describe('V2 native screens', () => {
  it('payments: the client confirms a payment the supplier reported', async () => {
    mockParams = { id: 'p1' };
    mockGet.mockResolvedValue({ project: { code: 'PRJ-1', title: 'Rooftop' }, canConfirm: true, note: 'COLLABIZ does not hold funds.', totals: { invoiced: 100_00, received: 0, outstanding: 100_00, overdue: 0 },
      milestones: [{ id: 'm1', seq: 1, title: 'Mounting', amount: 100_00, state: 'invoiced', invoice: { number: 'INV-1', amount: 100_00, received: 0, overdueDays: 0, reported: [{ id: 'r1', amount: 100_00, reference: 'UTR1' }] } }] });
    render(<ProjectPayments />);
    await waitFor(() => screen.getByTestId('reported'));
    fireEvent.press(screen.getByTestId('confirm-r1'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/payment-receipts/r1/confirm'));
  });

  it('disputes: a party appeals a decision with reasons', async () => {
    mockParams = { id: 'c1' };
    mockGet.mockResolvedValue({ code: 'RC-1', subject: 'Balance withheld', raisedBy: 'Volt EPC', against: 'Unite Solar', status: 'decided', decision: 'partly_upheld', decisionNote: 'Half released.', events: [{ org: 'Volt EPC', kind: 'statement', body: 'Please release', at: new Date().toISOString() }], canRespond: false, canAppeal: true });
    render(<DisputeCase />);
    await waitFor(() => screen.getByText('Decision: Partly upheld'));
    fireEvent.changeText(screen.getByTestId('dispute-text'), 'Clause 7 places the certificate on the owner, not on us.');
    fireEvent.press(screen.getByTestId('dispute-appeal'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/resolution/c1/appeal', { note: 'Clause 7 places the certificate on the owner, not on us.' }));
  });

  it('voice: dictated text is read into fields and handed to the lead form', async () => {
    render(<VoiceLead />);
    fireEvent.changeText(screen.getByTestId('voice-text'), 'Customer is Shree Ganesh Engineering Pvt Ltd in Pune, 500 kW rooftop solar, budget 2.4 crore');
    fireEvent.press(screen.getByTestId('voice-read'));
    await waitFor(() => expect(screen.getByTestId('voice-City')).toHaveTextContent('Pune'));
    fireEvent.press(screen.getByTestId('voice-use'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/leads/new', params: expect.objectContaining({ legalName: 'Shree Ganesh Engineering Pvt Ltd', city: 'Pune', sector: 'solar', value: '24000000' }) });
  });

  it('challenge: a partner puts itself forward for a role', async () => {
    mockParams = { cid: 'ch1' };
    mockGet.mockResolvedValue({ opportunity: { title: '2 MW plant' }, roles: ['EPC lead', 'Civil works'], coverage: { rows: [{ role: 'EPC lead', covered: false }, { role: 'Civil works', covered: false }], covered: 0, total: 2 }, canJoin: true, myInterest: null, note: 'Not a guarantee.' });
    render(<Challenge />);
    await waitFor(() => screen.getByText('Roles covered: 0 of 2'));
    const chips = screen.getAllByText('EPC lead'); // the coverage row, then the selectable chip
    fireEvent.press(chips[chips.length - 1]);
    fireEvent.changeText(screen.getByTestId('challenge-note'), 'We have delivered 12 rooftop EPC projects.');
    fireEvent.press(screen.getByTestId('challenge-join'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/challenges/ch1/interest', { items: ['EPC lead'], note: 'We have delivered 12 rooftop EPC projects.' }));
  });

  it('rescue: a partner offers what it can provide', async () => {
    mockParams = { rid: 'r1' };
    mockGet.mockResolvedValue({ project: 'PRJ-1 — Rooftop', note: 'Crane needed for four weeks.', gaps: [{ key: 'equipment', label: 'Equipment or machinery' }], myInterest: null });
    render(<RescueOffer />);
    await waitFor(() => screen.getByText('Crane needed for four weeks.'));
    fireEvent.press(screen.getByText('Equipment or machinery'));
    fireEvent.changeText(screen.getByTestId('rescue-note'), '25 t crane with operator from Monday.');
    fireEvent.press(screen.getByTestId('rescue-offer'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/rescue/r1/interest', { items: ['equipment'], note: '25 t crane with operator from Monday.' }));
  });

  it('WhatsApp: opting in sends the number and update types', async () => {
    mockGet.mockResolvedValue({ optIn: false, number: '', kinds: [], optInAt: null, consentText: 'I agree to receive transactional messages', templates: [{ key: 'payment', label: 'Payments' }, { key: 'approval', label: 'Approvals' }], connected: false, note: 'In the app meanwhile.' });
    render(<WhatsappPrefs />);
    await waitFor(() => screen.getByTestId('wa-number'));
    fireEvent.changeText(screen.getByTestId('wa-number'), '98220 11223');
    fireEvent(screen.getByTestId('wa-agree'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('wa-save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/me/whatsapp', { optIn: true, number: '98220 11223', kinds: ['payment', 'approval'] }));
  });
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ id: 'app1' }), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockRequest = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), request: (...a: unknown[]) => mockRequest(...a) } }));

import CollabTab from '../app/(tabs)/collab';
import PostTab from '../app/(tabs)/post';
import BusinessOffer from '../app/business-offers/[id]';
import ProposalRoom from '../app/collab/room/[id]';
import CollabWorkspace from '../app/collab/workspace';

beforeEach(() => { [mockGet, mockRequest, mockPush].forEach((m) => m.mockReset()); });
const offer = { id: 'o1', code: 'OPP-2026-01006', title: '40 seats for customer support', summary: 'Ready support desk in Hyderabad with trained agents.', sectorName: 'Technology', city: 'Hyderabad', region: 'Telangana', estimatedValue: 24_00_000_00, category: 'bpo_contract', categoryLabel: 'BPO / customer-support contract', side: 'offering', status: 'active', statusLabel: 'Active', expiresOn: '2027-01-01', upfrontRequired: false, upfrontAmount: null, regulated: false, checks: ['Publisher’s business verification (KYB) is complete'], publisher: 'Sunrise Traders', isOwner: false, eligibility: null };
const route = (map: Record<string, unknown>) => mockGet.mockImplementation((p: string) => { const k = Object.keys(map).find((x) => p.startsWith(x)); return k ? Promise.resolve(map[k]) : Promise.reject(new Error(`unexpected ${p}`)); });

describe('COLLAB (native)', () => {
  it('shows what you have and need, and matches with their reasons; adding a resource posts it with an idempotency key', async () => {
    route({ '/collab/profile': { assets: [{ id: 'a1', kind: 'office', title: 'Hyderabad office', capacity: 40, city: 'Hyderabad', verification: 'self_declared' }], needs: [], canEdit: true },
      '/collab/matches': { empty: false, note: 'Suggestions only.', offers: [{ offer, score: 85, reasons: [{ code: 'need', text: 'You are looking for a service provider', points: 30 }, { code: 'zero_upfront', text: 'No upfront fee', points: 0 }] }], programs: [] } });
    mockRequest.mockResolvedValue({});
    render(<CollabTab />);
    await waitFor(() => screen.getByTestId('match-o1'));
    expect(screen.getByText('Hyderabad office')).toBeTruthy();
    expect(screen.getByText('You are looking for a service provider')).toBeTruthy();
    expect(screen.queryByText('No upfront fee')).toBeNull(); // zero-point notes are not shown as reasons
    fireEvent.press(screen.getByTestId('match-o1'));
    expect(mockPush).toHaveBeenCalledWith('/business-offers/o1');
    fireEvent.press(screen.getByText('+ Store or showroom'));
    fireEvent.changeText(screen.getByLabelText('Short title'), 'Electronics store, MG Road');
    fireEvent.changeText(screen.getByLabelText('Describe it'), '1,500 sq ft showroom with walk-in customers.');
    fireEvent.press(screen.getByTestId('save-asset'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('POST', '/collab/assets', expect.objectContaining({ kind: 'store', title: 'Electronics store, MG Road' }), { idempotent: true }));
  });

  it('Post submits a business offer for checks and opens it', async () => {
    route({ '/collab/profile': { verified: true, canEdit: true } });
    mockRequest.mockResolvedValue({ id: 'new1' });
    render(<PostTab />);
    await waitFor(() => screen.getByTestId('submit-offer'));
    fireEvent.changeText(screen.getByLabelText('Title'), '40 seats for customer support');
    fireEvent.changeText(screen.getByLabelText('Describe the offer'), 'Ready support desk in Hyderabad, 30 trained agents, two shifts.');
    fireEvent.press(screen.getByTestId('submit-offer'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/business-offers/new1'));
    expect(mockRequest.mock.calls[0][2]).toMatchObject({ category: 'idle_capacity', side: 'offering', upfrontRequired: false, submit: true });
  });

  it('offer detail shows the checks and lets a partner apply', async () => {
    route({ '/business-offers/': { ...offer, notice: null, myApplication: null, applyCheck: { eligible: true, checks: [] }, applications: [] } });
    mockRequest.mockResolvedValue({});
    render(<BusinessOffer />);
    await waitFor(() => screen.getByText('Publisher’s business verification (KYB) is complete'));
    fireEvent.changeText(screen.getByLabelText('Why you are a good fit'), 'We need a dealer helpline, Mon–Sat 9am–7pm.');
    fireEvent.press(screen.getByTestId('apply'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('POST', '/opportunities/app1/apply', { message: 'We need a dealer helpline, Mon–Sat 9am–7pm.' }, { idempotent: true }));
  });

  it('proposal room: the receiving party accepts the open round; money stays in four separate lines', async () => {
    route({ '/collab/applications/': { side: 'applicant', stage: 'proposal', waitingFor: 'you', prerequisite: null, offer: { id: 'o1', title: offer.title, publisher: 'Sunrise Traders' }, application: { id: 'app1', applicant: 'Deccan Distributors' },
      rounds: [{ id: 'p1', round: 1, mine: false, status: 'sent', pricingLabel: 'Monthly retainer', terms: { scope: 'Inbound dealer support desk, 12 agents.', deliverables: 'Weekly SLA report', pricingModel: 'monthly_retainer', value: 21_60_000_00, paymentTerms: 'Monthly', durationMonths: 12, startDate: '2027-01-01', payer: 'applicant' } }],
      can: { propose: true, accept: true, decline: true }, agreement: null, project: null, money: { pipelineValue: 21_60_000_00, contractValue: 0, invoiced: 0, collected: 0 } } });
    mockRequest.mockResolvedValue({});
    render(<ProposalRoom />);
    await waitFor(() => screen.getByTestId('accept'));
    expect(screen.getByText('Step 3 of 6: Proposal')).toBeTruthy();
    expect(screen.getByText(/paid by you/)).toBeTruthy();
    ['Pipeline', 'Contract value', 'Invoiced', 'Collected'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    fireEvent.press(screen.getByTestId('accept'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('POST', '/collab/proposals/p1/accept', {}, { idempotent: true }));
  });

  it('my collaborations lists each one with its stage and opens the room', async () => {
    route({ '/collab/workspace': { items: [{ applicationId: 'app1', title: offer.title, counterparty: 'Sunrise Traders', stage: 'agreement', waitingOnYou: true, money: { pipelineValue: 0, contractValue: 21_60_000_00, invoiced: 0, collected: 0 } }], totals: { pipelineValue: 0, contractValue: 21_60_000_00, invoiced: 0, collected: 0, toReceive: 0, toPay: 0 } } });
    render(<CollabWorkspace />);
    await waitFor(() => screen.getByTestId('collab-app1'));
    expect(screen.getByText(/With Sunrise Traders · Agreement · waiting for you/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('collab-app1'));
    expect(mockPush).toHaveBeenCalledWith('/collab/room/app1');
  });
});

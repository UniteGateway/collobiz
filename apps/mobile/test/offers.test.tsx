import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@collabiz/types';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ id: 'of1' }), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockRequest = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), put: (...a: unknown[]) => mockPut(...a), request: (...a: unknown[]) => mockRequest(...a) } }));

import Offers from '../app/offers/index';
import OfferDetail from '../app/offers/[id]';
import CapacityScreen from '../app/capacity';

beforeEach(() => { [mockGet, mockPost, mockPut, mockRequest, mockPush].forEach((m) => m.mockReset()); });
const soon = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
const offer = (over: Record<string, unknown> = {}) => ({
  id: 'of1', code: 'DO-2026-100002', title: 'Run an O&M service desk', summary: 'Local office and trained people for module cleaning and breakdown visits.', issuer: 'Unite Solar',
  kind: 'local_presence', sector: 'solar', regions: ['IN-KA', 'IN-TN'], pricing: 'either', unitePrice: 6_50_000_00, priceUnit: 'per month', uniteReward: { model: 'fixed_fee', bps: null, amount: 6_50_000_00, text: 'Fixed fee · ₹6,50,000' },
  rewardModels: ['fixed_fee', 'profit_share'], needsOffice: true, minManpower: 4, exclusive: true, places: 1, deadline: soon(10), status: 'open', open: true,
  agreementNote: 'Profit share and equity are indicative. They become binding only through an agreement drafted and signed in Contracts.',
  myStatus: 'viewed', declineReason: null, myResponse: null, myCapacity: { hasOffice: true, officeLocations: ['Pune'], idleManpower: 12 }, ...over,
});

describe('Direct offers (native)', () => {
  it('lists offers to answer with their terms in words and opens one', async () => {
    mockGet.mockResolvedValue([{ ...offer(), myResponse: null }, { ...offer({ id: 'of2', code: 'DO-2026-100001', title: 'Sell rooftop packages', pricing: 'unite_price', myStatus: 'selected', exclusive: false }) }]);
    render(<Offers />);
    await waitFor(() => screen.getByTestId('offer-DO-2026-100002'));
    expect(screen.getByText('Represent us locally (office / setup)')).toBeTruthy();
    expect(screen.getByText('₹6,50,000 per month · Fixed fee · ₹6,50,000')).toBeTruthy();
    expect(screen.getByText(/Karnataka, Tamil Nadu/)).toBeTruthy();
    expect(screen.queryByTestId('offer-DO-2026-100001')).toBeNull(); // selected → "Answered"
    fireEvent.press(screen.getByText('Answered'));
    expect(screen.getByTestId('offer-DO-2026-100001')).toBeTruthy();
    fireEvent.press(screen.getByTestId('offer-DO-2026-100001'));
    expect(mockPush).toHaveBeenCalledWith('/offers/of2');
  });

  it('accepting the stated terms sends only the commitment, with an idempotency key', async () => {
    mockGet.mockResolvedValue(offer());
    mockRequest.mockResolvedValue({});
    render(<OfferDetail />);
    await waitFor(() => screen.getByText('Respond'));
    expect(screen.getByText(/binding only through an agreement/)).toBeTruthy();
    expect(screen.getByText('An existing office or setup · At least 4 people')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('People you will commit (min 4)'), '6');
    fireEvent.changeText(screen.getByLabelText('Office location'), 'Pune');
    fireEvent.changeText(screen.getByLabelText('Why your company'), 'Six trained technicians and two vans from our Pune office.');
    fireEvent.press(screen.getByTestId('send-response'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    const [method, path, body, opts] = mockRequest.mock.calls[0];
    expect([method, path]).toEqual(['POST', '/offers/of1/respond']);
    expect(body).toEqual({ mode: 'accept_terms', message: 'Six trained technicians and two vans from our Pune office.', hasOffice: true, officeLocation: 'Pune', manpower: 6 });
    expect(opts.idempotencyKey).toEqual(expect.any(String));
  });

  it('a proposal carries the price in paise and the reward as a percentage; server errors show inline', async () => {
    mockGet.mockResolvedValue(offer());
    mockRequest.mockRejectedValueOnce(new ApiError(400, 'This offer needs at least 4 people', [{ path: 'manpower', message: 'At least 4' }])).mockResolvedValueOnce({});
    render(<OfferDetail />);
    await waitFor(() => screen.getByText('Respond'));
    fireEvent.press(screen.getByText('Propose mine'));
    fireEvent.changeText(screen.getByLabelText('Your price (₹, optional)'), '5,80,000');
    fireEvent.press(screen.getByText('Profit share'));
    fireEvent.changeText(screen.getByLabelText('Profit share (%)'), '15');
    fireEvent.changeText(screen.getByLabelText('Why your company'), 'Lower monthly fee plus a share of savings from better availability.');
    fireEvent.press(screen.getByTestId('send-response'));
    await waitFor(() => screen.getByText('At least 4'));
    fireEvent.changeText(screen.getByLabelText('People you will commit (min 4)'), '6');
    fireEvent.press(screen.getByTestId('send-response'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(2));
    expect(mockRequest.mock.calls[1][2]).toMatchObject({ mode: 'proposal', price: 58000000, priceUnit: 'per month', reward: { model: 'profit_share', bps: 1500 }, manpower: 6 });
  });

  it('declining needs a reason; a decided offer shows the outcome instead of the form', async () => {
    mockGet.mockResolvedValueOnce(offer());
    mockPost.mockResolvedValue({ status: 'declined' });
    const r = render(<OfferDetail />);
    await waitFor(() => screen.getByTestId('decline'));
    fireEvent.press(screen.getByTestId('decline'));
    fireEvent.changeText(screen.getByLabelText('Reason for declining'), 'No team free in Tamil Nadu');
    mockGet.mockResolvedValueOnce(offer({ myStatus: 'declined', declineReason: 'No team free in Tamil Nadu' }));
    fireEvent.press(screen.getByTestId('confirm-decline'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/offers/of1/decline', { reason: 'No team free in Tamil Nadu' }));
    r.unmount();
    mockGet.mockResolvedValue(offer({ myStatus: 'selected', open: false, myResponse: { mode: 'proposal', price: 58000000, priceUnit: 'per month', rewardModel: 'profit_share', rewardBps: 1500, rewardAmount: null, rewardText: 'Profit share · 15%', manpower: 6, hasOffice: true, officeLocation: 'Hosur', message: 'x', status: 'selected', version: 2, decisionNote: 'Local office in Hosur.' } }));
    render(<OfferDetail />);
    await waitFor(() => screen.getByText('You were selected'));
    expect(screen.getByText(/Profit share · 15% · ₹5,80,000 per month/)).toBeTruthy();
    expect(screen.queryByText('Respond')).toBeNull();
  });

  it('capacity: saves offices, people and what the partner wants', async () => {
    mockGet.mockResolvedValue({ hasOffice: false, officeLocations: [], totalManpower: 10, idleManpower: 2, idleSkills: [], lookingFor: [], notes: null });
    mockPut.mockResolvedValue({});
    render(<CapacityScreen />);
    await waitFor(() => screen.getByDisplayValue('10'));
    fireEvent(screen.getByLabelText('We have an office or setup'), 'valueChange', true);
    fireEvent.changeText(screen.getByLabelText('Locations (comma-separated)'), 'Pune, Nashik');
    fireEvent.changeText(screen.getByLabelText('People free now'), '6');
    fireEvent.press(screen.getByText('Supply manpower'));
    fireEvent.press(screen.getByTestId('save-capacity'));
    await waitFor(() => screen.getByText('Saved.'));
    expect(mockPut).toHaveBeenCalledWith('/me/capacity', { hasOffice: true, officeLocations: ['Pune', 'Nashik'], totalManpower: 10, idleManpower: 6, idleSkills: [], lookingFor: ['manpower'] });
  });

  it('selected: shows the agreement and sales with commission; registering a buyer needs consent', async () => {
    const selected = offer({ myStatus: 'selected', open: false, myResponse: { mode: 'accept_terms', price: null, priceUnit: null, rewardModel: 'commission', rewardBps: 300, rewardAmount: null, rewardText: 'Commission on sales · 3%', manpower: null, hasOffice: false, officeLocation: null, message: 'x', status: 'selected', version: 1, decisionNote: null },
      papers: { contract: { id: 'c1', code: 'CTR-2026-123456', status: 'approved' }, agreement: { id: 'a1', code: 'CA-2026-654321' } },
      sales: [{ id: 's1', code: 'OS-2026-111111', buyerName: 'Apex Castings', buyerCity: 'Kolhapur', status: 'won', saleValue: 2_00_00_000_00, estimatedValue: null, lostReason: null, commission: { status: 'estimated', payable: 6_78_000_00 } }] });
    mockGet.mockResolvedValue(selected);
    mockRequest.mockResolvedValue({});
    render(<OfferDetail />);
    await waitFor(() => screen.getByText('CTR-2026-123456'));
    expect(screen.getByText('Ready for your signature')).toBeTruthy();
    expect(screen.getByText('Commission can be earned once the agreement is signed by both sides.')).toBeTruthy();
    expect(screen.getByText('Kolhapur · ₹2,00,00,000 · Commission ₹6,78,000 · Projected')).toBeTruthy();
    fireEvent.press(screen.getByTestId('open-sale'));
    fireEvent.changeText(screen.getByLabelText('Buyer (company name)'), 'Western Auto Components');
    fireEvent.changeText(screen.getByLabelText('City'), 'Pune');
    fireEvent.changeText(screen.getByLabelText('What the buyer needs'), '300 kW rooftop on plant 2');
    fireEvent.changeText(screen.getByLabelText('Expected order value ₹ (optional)'), '1,20,00,000');
    fireEvent.press(screen.getByTestId('register-sale'));
    expect(mockRequest).not.toHaveBeenCalled(); // consent not given
    fireEvent(screen.getByLabelText('Buyer agreed to be introduced'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('register-sale'));
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    const [method, path, body] = mockRequest.mock.calls[0];
    expect([method, path]).toEqual(['POST', '/offers/of1/sales']);
    expect(body).toMatchObject({ buyerName: 'Western Auto Components', buyerCity: 'Pune', estimatedValue: 1_20_00_000_00, consent: true });
  });
});

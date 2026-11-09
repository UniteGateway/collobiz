import React from 'react';
import { Share } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@collabiz/types';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }), useLocalSearchParams: () => ({ id: 'l1' }), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockRequest = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), request: (...a: unknown[]) => mockRequest(...a) } }));

import MyLeads from '../app/(tabs)/leads';
import Apply from '../app/opportunities/[id]/apply';
import NewLead from '../app/leads/new';
import Duplicates from '../app/leads/[id]/duplicates';
import LeadStatus from '../app/leads/[id]/index';
import Certificate from '../app/leads/[id]/certificate';
import Pipeline from '../app/pipeline';
import LeadProtection from '../app/lead-protection';

beforeEach(() => { [mockGet, mockPost, mockRequest, mockPush, mockReplace, mockBack].forEach((m) => m.mockReset()); });

const detail = (over: Record<string, unknown> = {}) => ({
  claim: { id: 'l1', status: 'protected', certificateCode: 'CZL-2026-48621253', protectedUntil: '2027-05-08T00:00:00Z', evidenceHash: 'a3f9c2…' },
  opportunity: { code: 'OPP-2026-00011', title: 'Foundry rooftop solar', status: 'unite_priority_review' },
  customer: { legalName: 'Apex Castings Pvt Ltd' },
  routing: { slaMinutes: 2880, remainingMinutes: 1500, dueAt: '2026-11-10T10:00:00Z', timezone: 'Asia/Kolkata', breached: false, decision: null, paused: false },
  duplicates: [],
  ...over,
});

describe('Screen 026 (native) — my leads', () => {
  it('lists leads with value and status, opens one, and offers to register a new lead', async () => {
    mockGet.mockResolvedValue([{ id: 'l1', code: 'OPP-2026-00011', title: 'Foundry rooftop solar', customer: 'Apex Castings', estimatedValue: 4500000000, claimStatus: 'protected', opportunityStatus: 'unite_priority_review' }]);
    render(<MyLeads />);
    await waitFor(() => screen.getByText('Foundry rooftop solar'));
    expect(screen.getByText('Apex Castings · ₹4.5 Cr')).toBeTruthy();
    expect(screen.getByText('Protected')).toBeTruthy(); // status in words
    fireEvent.press(screen.getByLabelText('Foundry rooftop solar, Apex Castings'));
    expect(mockPush).toHaveBeenCalledWith('/leads/l1');
    fireEvent.press(screen.getByTestId('new-lead'));
    expect(mockPush).toHaveBeenCalledWith('/leads/new');
  });
  it('explains protection when there are no leads', async () => {
    mockGet.mockResolvedValue([]);
    render(<MyLeads />);
    await waitFor(() => screen.getByText('No leads yet'));
  });
});

describe('Screen 042 (native) — apply', () => {
  it('submits once with an idempotency key and the value in paise', async () => {
    mockRequest.mockResolvedValue({});
    render(<Apply />);
    fireEvent.changeText(screen.getByLabelText('Why your organization?'), 'We have delivered 14 MW of rooftop EPC in Pune.');
    fireEvent.changeText(screen.getByLabelText('Indicative value ₹ (optional)'), '80,00,000');
    fireEvent.press(screen.getByTestId('apply-submit'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    const [method, path, body, opts] = mockRequest.mock.calls[0];
    expect([method, path]).toEqual(['POST', '/opportunities/l1/apply']);
    expect(body).toEqual({ message: 'We have delivered 14 MW of rooftop EPC in Pune.', proposedValue: 800000000 });
    expect(opts.idempotencyKey).toEqual(expect.any(String));
  });
});

describe('Screens 043–046 (native) — register a lead', () => {
  it('records consent and evidence, shows server field errors inline, then opens the new lead', async () => {
    mockRequest.mockRejectedValueOnce(new ApiError(400, 'Check the highlighted fields', [{ path: 'customer.legalName', message: 'Enter the customer’s legal name' }]));
    render(<NewLead />);
    expect(screen.queryByText(/\(04\d/)).toBeNull(); // no screen numbers in titles
    expect(screen.getByText('Construction & EPC')).toBeTruthy(); // full sector names
    fireEvent.press(screen.getByText('Signed letter'));
    fireEvent.changeText(screen.getByLabelText('Evidence of introduction'), 'Meeting minutes dated 2 Nov signed by the plant head.');
    fireEvent.press(screen.getByTestId('lead-submit'));
    await waitFor(() => screen.getByText('Enter the customer’s legal name'));
    mockRequest.mockResolvedValueOnce({ claim: { id: 'l9' } });
    fireEvent.changeText(screen.getByLabelText('Customer legal name'), 'Apex Castings Pvt Ltd');
    fireEvent.changeText(screen.getByLabelText('Estimated value ₹'), '45000000');
    fireEvent.press(screen.getByTestId('lead-submit'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/leads/l9'));
    const body = mockRequest.mock.calls[1][2];
    expect(body.consent).toEqual(expect.objectContaining({ method: 'signed_letter', disclosureScope: 'unite_and_approved_partners' }));
    expect(body.customer.legalName).toBe('Apex Castings Pvt Ltd');
    expect(body.estimatedValue).toBe(4500000000);
    expect(mockRequest.mock.calls[0][3].idempotencyKey).toBe(mockRequest.mock.calls[1][3].idempotencyKey); // a retry is the same submission
  });
});

describe('Screens 048/050/051 (native) — lead status, duplicates, certificate', () => {
  it('050: shows the review clock and links onward without developer labels', async () => {
    mockGet.mockResolvedValue(detail());
    render(<LeadStatus />);
    await waitFor(() => screen.getByText('Foundry rooftop solar'));
    expect(screen.getByText('48h 0m')).toBeTruthy();
    expect(screen.getByText('25h 0m')).toBeTruthy();
    expect(screen.queryByText(/Screen \d{3}/)).toBeNull();
    fireEvent.press(screen.getByText('Duplicate check'));
    expect(mockPush).toHaveBeenCalledWith('/leads/l1/duplicates');
  });
  it('050: states the decision in words', async () => {
    mockGet.mockResolvedValue(detail({ routing: { ...detail().routing, decision: 'release', reason: 'Outside Unite capacity this quarter' } }));
    render(<LeadStatus />);
    await waitFor(() => screen.getByText('Released to the partner exchange — Outside Unite capacity this quarter'));
  });
  it('048: reports similar registrations without naming the other party', async () => {
    mockGet.mockResolvedValue(detail({ duplicates: [{ id: 'd1', score: 0.82, reasons: ['Same GSTIN', 'Similar project'], ruling: 'pending', rulingReason: null, otherIntroducer: undefined }] }));
    render(<Duplicates />);
    await waitFor(() => screen.getByText('82% similar'));
    expect(screen.getByText('Same GSTIN; Similar project')).toBeTruthy();
    expect(screen.getByText(/1 similar registration/)).toBeTruthy();
  });
  it('051: shows the certificate and shares a code that never contains the customer', async () => {
    mockGet.mockResolvedValue(detail());
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    render(<Certificate />);
    await waitFor(() => screen.getByText('CZL-2026-48621253'));
    expect(screen.getByText('8 May 2027')).toBeTruthy();
    fireEvent.press(screen.getByText('Share verification code'));
    const msg = share.mock.calls[0][0].message as string;
    expect(msg).toContain('CZL-2026-48621253');
    expect(msg).not.toContain('Apex');
  });
});

describe('Screens 053/151 (native) — pipeline and protection', () => {
  const pipe = { metrics: { open: 2, openValue: 8800000000 }, columns: ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'].map((st) => ({ stage: st, deals: st === 'qualified' ? [{ id: 'd1', title: '2 MW rooftop', customer: 'Apex', value: 8000000000, stage: 'qualified', version: 3 }] : [] })) };
  it('053: stage names in words; moving to lost asks why and sends the version for safe concurrent edits', async () => {
    mockGet.mockResolvedValue(pipe);
    mockPost.mockResolvedValue({});
    render(<Pipeline />);
    await waitFor(() => screen.getByText('2 MW rooftop'));
    expect(screen.getByText('Qualified (1)')).toBeTruthy();
    fireEvent.press(screen.getByText('Move stage'));
    fireEvent.press(screen.getByText('Lost'));
    fireEvent.changeText(screen.getByLabelText('Why lost?'), 'Customer chose a cheaper bidder');
    fireEvent.press(screen.getByText('Move'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/crm/deals/d1/move', { stage: 'lost', lostReason: 'Customer chose a cheaper bidder', expectedVersion: 3 }));
    fireEvent.press(screen.getByText('New (0)'));
    expect(screen.getByText('No deals at this stage.')).toBeTruthy();
  });
  it('151: counts, disputes notice and expiring certificates', async () => {
    mockGet.mockResolvedValue({ protected: 4, inUniteReview: 1, contested: 1, openDisputes: 1, expiringSoon: [{ id: 'l1', code: 'OPP-2026-00011', protectedUntil: '2026-11-15T00:00:00Z' }] });
    render(<LeadProtection />);
    await waitFor(() => screen.getByText('OPP-2026-00011'));
    expect(screen.getByText('Expires 15 Nov 2026')).toBeTruthy();
    expect(screen.getByText(/open ownership disputes/)).toBeTruthy();
    expect(screen.queryByText(/screen \d{3}/i)).toBeNull();
    fireEvent.press(screen.getByText('OPP-2026-00011'));
    expect(mockPush).toHaveBeenCalledWith('/leads/l1/certificate');
  });
});

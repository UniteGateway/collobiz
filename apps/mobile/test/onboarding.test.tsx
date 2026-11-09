import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@collabiz/types';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), useLocalSearchParams: () => ({}), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockUpload = jest.fn();
const mockSetOrg = jest.fn();
jest.mock('../src/api', () => ({
  API_URL: 'http://x',
  api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a), put: (...a: unknown[]) => mockPut(...a), upload: (...a: unknown[]) => mockUpload(...a) },
  tokens: { setOrg: (...a: unknown[]) => mockSetOrg(...a) },
}));
const mockRefresh = jest.fn();
const mockSession: { me: any; refresh: jest.Mock } = { me: null, refresh: mockRefresh };
jest.mock('../src/session', () => ({ useSession: () => mockSession }));
const mockPick = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...a: unknown[]) => mockPick(...a) }));
jest.mock('expo-linking', () => ({ openURL: jest.fn() }));

import Verify from '../app/verify';
import AccountType from '../app/onboarding/account-type';
import Details from '../app/onboarding/details';
import Industries from '../app/onboarding/industries';
import Coverage from '../app/onboarding/coverage';
import ProfileBuilder from '../app/onboarding/profile';
import Kyc from '../app/onboarding/kyc';
import BankTax from '../app/onboarding/bank-tax';
import Agreements from '../app/onboarding/agreements';

const asha = { fullName: 'Asha Patil', email: 'asha@voltepc.example', emailVerified: true, activeOrg: { id: 'org1', type: 'partner_company' } };
beforeEach(() => {
  [mockGet, mockPost, mockPut, mockUpload, mockPush, mockReplace, mockRefresh, mockSetOrg, mockPick].forEach((m) => m.mockReset());
  mockSession.me = asha;
});

describe('Screen 012 (native) — email verification', () => {
  it('accepts only a 6-digit code, verifies it and refreshes the session', async () => {
    mockSession.me = { ...asha, emailVerified: false };
    mockPost.mockResolvedValue({ ok: true });
    render(<Verify />);
    expect(screen.getByText(/asha@voltepc\.example/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Verification code'), '12a34');
    expect(screen.getByLabelText('Verification code').props.value).toBe('1234'); // digits only
    fireEvent.changeText(screen.getByLabelText('Verification code'), '123456');
    fireEvent.press(screen.getByText('Verify'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/auth/otp/verify', { channel: 'email', code: '123456' }));
    await waitFor(() => screen.getByText('Email verified.'));
    expect(mockRefresh).toHaveBeenCalled();
  });
  it('shows the server message when the code is wrong', async () => {
    mockSession.me = { ...asha, emailVerified: false };
    mockPost.mockRejectedValue(new ApiError(400, 'That code has expired. Request a new one.'));
    render(<Verify />);
    fireEvent.changeText(screen.getByLabelText('Verification code'), '000000');
    fireEvent.press(screen.getByText('Verify'));
    await waitFor(() => screen.getByText('That code has expired. Request a new one.'));
  });
});

describe('Screen 013 (native) — account type', () => {
  it('shows business types in words and creates the organization before moving on', async () => {
    mockPost.mockResolvedValue({ organizationId: 'org9' });
    render(<AccountType />);
    expect(screen.getByText('Contractor / EPC')).toBeTruthy();
    expect(screen.queryByText(/finance_associate|finance associate$/)).toBeNull();
    fireEvent.press(screen.getByText('Individual partner'));
    fireEvent.press(screen.getByText('Consultant'));
    fireEvent.press(screen.getByTestId('acct-continue'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/details'));
    expect(mockPost).toHaveBeenCalledWith('/onboarding/account-type', { kind: 'individual', partnerTypes: ['consultant'] });
    expect(mockSetOrg).toHaveBeenCalledWith('org9');
  });
  it('blocks an unverified user', () => {
    mockSession.me = { ...asha, emailVerified: false };
    render(<AccountType />);
    expect(screen.getByText('Verify your email first.')).toBeTruthy();
  });
});

describe('Screens 014/015 (native) — registration details', () => {
  it('015: company fields, rupees sent in paise, field errors shown inline', async () => {
    mockPut.mockRejectedValueOnce(new ApiError(400, 'Check the highlighted fields', [{ path: 'registrationNumber', message: 'Enter a valid CIN or LLPIN' }]));
    render(<Details />);
    fireEvent.changeText(screen.getByLabelText('Registered legal name'), 'Volt EPC Private Limited');
    fireEvent.changeText(screen.getByLabelText('Registration number (CIN / LLPIN)'), 'bad');
    fireEvent.changeText(screen.getByLabelText('Annual turnover ₹ (optional)'), '1,50,00,000');
    fireEvent.changeText(screen.getByLabelText('City'), 'Pune');
    fireEvent.press(screen.getByText('Save and continue'));
    await waitFor(() => screen.getByText('Enter a valid CIN or LLPIN'));
    expect(mockPut).toHaveBeenCalledWith('/onboarding/company', expect.objectContaining({ legalName: 'Volt EPC Private Limited', annualTurnover: 1500000000, country: 'IN', city: 'Pune' }));
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('014: an individual sees personal fields and moves to industries', async () => {
    mockSession.me = { ...asha, activeOrg: { id: 'o2', type: 'partner_individual' } };
    mockPut.mockResolvedValue({});
    render(<Details />);
    expect(screen.queryByLabelText('Registered legal name')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Name shown to partners'), 'Meera Iyer');
    fireEvent.changeText(screen.getByLabelText('PAN (optional)'), 'abcde1234f');
    expect(screen.getByLabelText('PAN (optional)').props.value).toBe('ABCDE1234F');
    fireEvent.press(screen.getByText('Save and continue'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/industries'));
    expect(mockPut).toHaveBeenCalledWith('/onboarding/individual', expect.objectContaining({ displayName: 'Meera Iyer', pan: 'ABCDE1234F' }));
  });
});

describe('Screens 016/017/018 (native) — industries, coverage, profile', () => {
  it('016: sends chosen sectors and splits comma lists', async () => {
    mockPut.mockResolvedValue({});
    render(<Industries />);
    fireEvent.press(screen.getByText('Solar & Renewable Energy'));
    fireEvent.changeText(screen.getByLabelText('Skills (comma-separated)'), 'Rooftop EPC, O&M ,');
    fireEvent.press(screen.getByText('Save and continue'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/coverage'));
    expect(mockPut).toHaveBeenCalledWith('/onboarding/industries', expect.objectContaining({ sectors: ['solar'], skills: ['Rooftop EPC', 'O&M'] }));
  });
  it('017: needs at least one region, then saves regions and travel', async () => {
    mockPut.mockRejectedValueOnce(new ApiError(400, 'Invalid', [{ path: 'regions', message: 'Required' }])).mockResolvedValueOnce({});
    render(<Coverage />);
    fireEvent.press(screen.getByText('Save and continue'));
    await waitFor(() => screen.getByText('Select at least one region'));
    fireEvent.press(screen.getByText('Maharashtra'));
    fireEvent(screen.getByLabelText('Willing to travel'), 'valueChange', true);
    fireEvent.press(screen.getByText('Save and continue'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/profile'));
    expect(mockPut).toHaveBeenLastCalledWith('/onboarding/coverage', { regions: ['IN-MH'], willingToTravel: true });
  });
  it('018: matching consent is on by default and can be withdrawn', async () => {
    mockPut.mockResolvedValue({});
    render(<ProfileBuilder />);
    fireEvent.changeText(screen.getByLabelText('Headline'), 'Rooftop solar EPC across Maharashtra');
    fireEvent(screen.getByLabelText('Consent to explainable matching'), 'valueChange', false);
    fireEvent.press(screen.getByText('Save and continue'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/kyc'));
    expect(mockPut).toHaveBeenCalledWith('/onboarding/profile', expect.objectContaining({ headline: 'Rooftop solar EPC across Maharashtra', consentToMatch: false }));
  });
});

describe('Screen 019 (native) — KYC / KYB documents', () => {
  it('lists missing documents in words, uploads the chosen type and keeps Continue locked until complete', async () => {
    mockGet.mockImplementation((p: string) => Promise.resolve(p === '/onboarding/status'
      ? { missingDocs: ['gst_certificate'] }
      : [{ id: 'd1', docType: 'pan', fileName: 'pan.pdf', status: 'pending' }]));
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///gst.pdf', name: 'gst.pdf', mimeType: 'application/pdf' }] });
    mockUpload.mockResolvedValue({});
    render(<Kyc />);
    await waitFor(() => screen.getByText('Still required: GST certificate'));
    expect(screen.getByText('pan.pdf')).toBeTruthy();
    fireEvent.press(screen.getByText('GST certificate'));
    fireEvent.press(screen.getByText('Choose file and upload'));
    await waitFor(() => screen.getByText('GST certificate uploaded'));
    expect(mockUpload.mock.calls[0][0]).toBe('/onboarding/kyb/documents');
    const fd = mockUpload.mock.calls[0][1] as FormData;
    expect(fd.get('docType')).toBe('gst_certificate');
    expect(fd.has('file')).toBe(true);
    fireEvent.press(screen.getByText('Continue'));
    expect(mockPush).not.toHaveBeenCalled(); // still missing until the server says otherwise
  });
});

describe('Screens 020/021 (native) — bank & tax, agreements', () => {
  it('020: shows only masked values on file and asks for GSTIN only when GST registered', async () => {
    mockGet.mockResolvedValue({ bankName: 'HDFC Bank', accountMasked: '••••4321', panMasked: '••••234F' });
    mockPut.mockResolvedValue({});
    render(<BankTax />);
    await waitFor(() => screen.getByText(/HDFC Bank ••••4321 · PAN ••••234F/));
    expect(screen.queryByLabelText('GSTIN')).toBeNull();
    fireEvent(screen.getByLabelText('GST registered'), 'valueChange', true);
    fireEvent.changeText(screen.getByLabelText('GSTIN'), '27abcde1234f1z5');
    fireEvent.changeText(screen.getByLabelText('IFSC'), 'hdfc0001234');
    fireEvent.press(screen.getByText('Save and continue'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/agreements'));
    expect(mockPut).toHaveBeenCalledWith('/onboarding/bank-tax', expect.objectContaining({ gstRegistered: true, gstin: '27ABCDE1234F1Z5', ifsc: 'HDFC0001234', tdsSection: '194H' }));
  });
  it('021: signs with the typed name and unlocks review only when every agreement is signed', async () => {
    const list = (accepted: boolean) => [{ code: 'partner_terms', title: 'Partner terms', version: 2, body: 'Terms text', accepted }];
    mockGet.mockResolvedValueOnce(list(false)).mockResolvedValueOnce(list(true));
    mockPost.mockResolvedValue({});
    render(<Agreements />);
    await waitFor(() => screen.getByText('Partner terms v2'));
    expect(screen.getByText('Draft templates pending legal review.')).toBeTruthy();
    fireEvent.press(screen.getByText('Continue to review'));
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('Type "Asha Patil" to sign'), 'Asha Patil');
    fireEvent.press(screen.getByText('Sign'));
    await waitFor(() => screen.getByText('Signed'));
    expect(mockPost).toHaveBeenCalledWith('/onboarding/agreements/accept', { templateCode: 'partner_terms', version: 2, typedName: 'Asha Patil' });
    fireEvent.press(screen.getByText('Continue to review'));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/status');
  });
});

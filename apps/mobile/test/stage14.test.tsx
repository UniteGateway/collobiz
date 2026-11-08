import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ id: 'c1' }), Stack: { Screen: () => null } }));
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../src/api', () => ({ api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } }));

import CoursePlayer from '../app/learning/[id]';
import AiMatches from '../app/ai-matches';
import Reputation from '../app/reputation/index';
import Excellence from '../app/reputation/excellence';

beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockPush.mockReset(); });

const course = (completed: number[]) => ({ id: 'c1', code: 'CZ-101', title: 'Working with Unite Group', summary: 'Essentials', passMark: 75, modules: [{ title: 'Model', body: 'Four routes.' }, { title: 'Leads', body: 'Certificates.' }], completedModules: completed, assessment: { questions: [{ q: 'When is commission earned?', options: ['On signature', 'When the customer pays'] }], attemptsLeftToday: 3 }, certificate: null });

describe('Stage 14 (native)', () => {
  it('117 locks the assessment until modules are read, then grades on the server', async () => {
    mockGet.mockResolvedValueOnce(course([0]));
    render(<CoursePlayer />);
    await waitFor(() => screen.getByText('Read every module to unlock the assessment.'));
    expect(screen.getByText('Certificates.')).toBeTruthy(); // first unread module opens on arrival
    mockGet.mockResolvedValue(course([0, 1]));
    mockPost.mockResolvedValueOnce({ completedModules: [0, 1] });
    fireEvent.press(screen.getByTestId('read-1'));
    await waitFor(() => screen.getByText(/When is commission earned\?/));
    expect(JSON.stringify(mockGet.mock.calls)).not.toContain('answer');
    fireEvent.press(screen.getByTestId('q0-o1'));
    mockPost.mockResolvedValueOnce({ score: 100, passed: true, correct: 1, total: 1, incorrect: [], certificate: { code: 'CZC-2026-12345678' } });
    fireEvent.press(screen.getByTestId('submit'));
    await waitFor(() => screen.getByText(/Passed — 100%/));
    expect(mockPost).toHaveBeenLastCalledWith('/learning/courses/c1/assessment', { answers: [1] });
    expect(screen.getByText(/Certificate CZC-2026-12345678 issued/)).toBeTruthy();
  });

  it('160 shows reasons for each match and hides a dismissed one', async () => {
    mockGet.mockResolvedValue({ consent: true, promptVersion: 'rules-2026.11', items: [{ opportunity: { id: 'o1', code: 'OPP-2026-00001', title: '2 MW rooftop solar EPC', sector: 'solar', city: 'Pune', estimatedValue: 8000000, publisher: 'Unite Solar' }, match: { score: 93, factors: [{ factor: 'Geography', score: 1, detail: 'Covers Maharashtra' }, { factor: 'Verified reputation', score: 0.73, detail: 'Reputation 73/100' }] } }] });
    mockPost.mockResolvedValue({ ok: true });
    render(<AiMatches />);
    await waitFor(() => screen.getByText('2 MW rooftop solar EPC'));
    expect(screen.getByText(/Covers Maharashtra/)).toBeTruthy();
    expect(screen.getByText(/Reputation 73\/100/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('dismiss-OPP-2026-00001'));
    expect(screen.queryByText('2 MW rooftop solar EPC')).toBeNull();
    expect(mockPost).toHaveBeenCalledWith('/ai/matching/o1/feedback', { useful: false, reason: 'Not relevant' });
  });

  it('163 shows the score with its verified record; 165 lists the next-level criteria', async () => {
    mockGet.mockResolvedValueOnce({ score: { score: 73, tier: 'trusted', outcomes: 3, onTimeOutcomes: 2, publishedReviews: 1, excludedReviews: 0, components: { onTimeRate: 0.67, reviews: 4.7 } }, outcomes: [{ id: 'm1', title: 'Electrical BoS', projectCode: 'PRJ-2025-000014', certifiedAt: '2025-08-06', onTime: false }], tips: [] });
    const r = render(<Reputation />);
    await waitFor(() => screen.getByText('73'));
    expect(screen.getByText('Trusted')).toBeTruthy();
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(screen.getByText('Late')).toBeTruthy();
    r.unmount();
    mockGet.mockResolvedValueOnce({ levelName: 'Verified partner', nextName: 'Certified partner', ready: false, note: 'Levels are reviewed by Unite Group.', criteria: [{ key: 'certs', label: '2 COLLABIZ certifications', met: false, detail: '0 held by your team', progress: 0 }] });
    render(<Excellence />);
    await waitFor(() => screen.getByText('What Certified partner needs'));
    expect(screen.getByLabelText(/2 COLLABIZ certifications: not yet/)).toBeTruthy();
  });
});

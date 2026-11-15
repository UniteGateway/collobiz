/** Shared helpers for the native COLLAB journey. Every state-changing call carries an idempotency key. */
import { api } from './api';

export interface Reason { code: string; text: string; points: number }
export interface OfferView {
  id: string; code: string; title: string; summary: string; sectorName: string; city: string | null; region: string | null; estimatedValue: number | null; category: string; categoryLabel: string;
  side: 'offering' | 'seeking'; status: string; statusLabel: string; expiresOn: string; upfrontRequired: boolean; upfrontAmount: number | null; regulated: boolean; checks: string[]; publisher: string; isOwner: boolean; eligibility: string | null;
}
export interface Money { pipelineValue: number; contractValue: number; invoiced: number; collected: number }
export const send = <T = unknown>(path: string, body: unknown = {}) => api.request<T>('POST', path, body, { idempotent: true });
export const STAGES = ['Application', 'Shortlisted', 'Proposal', 'Agreement', 'Signed', 'Execution'];
export const STAGE_INDEX: Record<string, number> = { application: 0, shortlisted: 1, proposal: 2, agreement: 3, agreement_signed: 4, execution: 5 };

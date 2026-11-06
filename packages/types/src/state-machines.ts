/**
 * Business state machines. Every consequential status change in COLLABIZ goes through
 * `assertTransition`, so the API rejects illegal jumps (e.g. paying an unearned commission).
 */
export type Machine<S extends string> = { name: string; states: readonly S[]; initial: S; edges: Record<S, readonly S[]> };

function machine<S extends string>(name: string, states: readonly S[], initial: S, edges: Record<S, readonly S[]>): Machine<S> {
  return { name, states, initial, edges };
}

export class TransitionError extends Error {
  constructor(public machine: string, public from: string, public to: string) {
    super(`Illegal ${machine} transition: ${from} → ${to}`);
  }
}

export function canTransition<S extends string>(m: Machine<S>, from: S, to: S): boolean {
  return (m.edges[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(m: Machine<S>, from: S, to: S): void {
  if (!canTransition(m, from, to)) throw new TransitionError(m.name, from, to);
}

/** §2.2 Opportunity lifecycle. */
export const OPPORTUNITY_STATES = [
  'draft', 'submitted', 'consent_check', 'duplicate_review', 'verified', 'unite_priority_review',
  'accepted', 'released', 'rejected', 'qualification', 'proposal', 'negotiation', 'awarded', 'lost',
  'execution', 'milestone_certification', 'commercial_settlement', 'closed', 'disputed',
] as const;
export type OpportunityState = (typeof OPPORTUNITY_STATES)[number];
export const OpportunityMachine = machine<OpportunityState>('opportunity', OPPORTUNITY_STATES, 'draft', {
  draft: ['submitted'],
  submitted: ['consent_check', 'rejected'],
  consent_check: ['duplicate_review', 'rejected'],
  duplicate_review: ['verified', 'rejected'],
  verified: ['unite_priority_review', 'released'],
  unite_priority_review: ['accepted', 'released', 'rejected'],
  accepted: ['qualification'],
  released: ['qualification', 'rejected'],
  rejected: [],
  qualification: ['proposal', 'lost'],
  proposal: ['negotiation', 'awarded', 'lost'],
  negotiation: ['awarded', 'lost'],
  awarded: ['execution', 'disputed'],
  lost: ['closed'],
  execution: ['milestone_certification', 'disputed'],
  milestone_certification: ['execution', 'commercial_settlement', 'disputed'],
  commercial_settlement: ['closed', 'disputed'],
  closed: [],
  disputed: ['execution', 'commercial_settlement', 'closed'],
});

/** KYC / KYB verification (Stage 03). */
export const KYB_STATES = ['not_started', 'submitted', 'under_review', 'verified', 'rejected', 'reupload_requested'] as const;
export type KybState = (typeof KYB_STATES)[number];
export const KybMachine = machine<KybState>('kyb', KYB_STATES, 'not_started', {
  not_started: ['submitted'],
  submitted: ['under_review'],
  under_review: ['verified', 'rejected', 'reupload_requested'],
  reupload_requested: ['submitted'],
  rejected: ['submitted'],
  verified: ['under_review'],
});

/** Lead protection claim ruling (Stage 06, §4.2). */
export const LEAD_CLAIM_STATES = ['pending', 'protected', 'contested', 'upheld', 'released', 'expired', 'rejected'] as const;
export type LeadClaimState = (typeof LEAD_CLAIM_STATES)[number];
export const LeadClaimMachine = machine<LeadClaimState>('lead_claim', LEAD_CLAIM_STATES, 'pending', {
  pending: ['protected', 'contested', 'rejected'],
  protected: ['contested', 'expired', 'released'],
  contested: ['upheld', 'rejected', 'released'],
  upheld: ['expired', 'released'],
  released: [],
  expired: [],
  rejected: ['contested'],
});

/** Commission ledger (Stage 12): estimated→eligible→earned→approved→invoiced→settled + hold/dispute/reversal. */
export const COMMISSION_STATES = ['estimated', 'eligible', 'earned', 'approved', 'invoiced', 'settled', 'on_hold', 'disputed', 'reversed'] as const;
export type CommissionState = (typeof COMMISSION_STATES)[number];
export const COMMISSION_STATE_LABELS: Record<CommissionState, string> = {
  estimated: 'Projected', eligible: 'Eligible', earned: 'Earned', approved: 'Approved', invoiced: 'Invoiced',
  settled: 'Paid', on_hold: 'On hold', disputed: 'Disputed', reversed: 'Reversed',
};
export const CommissionMachine = machine<CommissionState>('commission', COMMISSION_STATES, 'estimated', {
  estimated: ['eligible', 'reversed', 'on_hold'],
  eligible: ['earned', 'on_hold', 'reversed', 'disputed'],
  earned: ['approved', 'on_hold', 'disputed', 'reversed'],
  approved: ['invoiced', 'on_hold', 'disputed'],
  invoiced: ['settled', 'disputed', 'on_hold'],
  settled: ['disputed'],
  on_hold: ['eligible', 'earned', 'approved', 'reversed'],
  disputed: ['earned', 'approved', 'reversed', 'settled'],
  reversed: [],
});

/** Tender / RFQ (Stage 09). */
export const TENDER_STATES = ['draft', 'published', 'closed', 'opened', 'technical_evaluation', 'commercial_evaluation', 'negotiation', 'awarded', 'cancelled'] as const;
export type TenderState = (typeof TENDER_STATES)[number];
export const TenderMachine = machine<TenderState>('tender', TENDER_STATES, 'draft', {
  draft: ['published', 'cancelled'],
  published: ['closed', 'cancelled'],
  closed: ['opened', 'cancelled'],
  opened: ['technical_evaluation', 'cancelled'],
  technical_evaluation: ['commercial_evaluation', 'cancelled'],
  commercial_evaluation: ['negotiation', 'awarded', 'cancelled'],
  negotiation: ['awarded', 'cancelled'],
  awarded: [],
  cancelled: [],
});

export const BID_STATES = ['draft', 'submitted', 'withdrawn', 'opened', 'technically_qualified', 'disqualified', 'shortlisted', 'awarded', 'not_awarded'] as const;
export type BidState = (typeof BID_STATES)[number];
export const BidMachine = machine<BidState>('bid', BID_STATES, 'draft', {
  draft: ['submitted'],
  submitted: ['withdrawn', 'opened'],
  withdrawn: [],
  opened: ['technically_qualified', 'disqualified'],
  technically_qualified: ['shortlisted', 'not_awarded', 'awarded'],
  disqualified: [],
  shortlisted: ['awarded', 'not_awarded'],
  awarded: [],
  not_awarded: [],
});

/** Collaboration team (Stage 08). */
export const TEAM_STATES = ['forming', 'nda_pending', 'proposal', 'approval_pending', 'active', 'dissolved'] as const;
export type TeamState = (typeof TEAM_STATES)[number];
export const TeamMachine = machine<TeamState>('team', TEAM_STATES, 'forming', {
  forming: ['nda_pending', 'dissolved'],
  nda_pending: ['proposal', 'forming', 'dissolved'],
  proposal: ['approval_pending', 'nda_pending', 'dissolved'],
  approval_pending: ['active', 'proposal', 'dissolved'],
  active: ['dissolved'],
  dissolved: [],
});
export const TEAM_MEMBER_STATES = ['invited', 'accepted', 'declined', 'nda_signed', 'revoked'] as const;
export type TeamMemberState = (typeof TEAM_MEMBER_STATES)[number];
export const TeamMemberMachine = machine<TeamMemberState>('team_member', TEAM_MEMBER_STATES, 'invited', {
  invited: ['accepted', 'declined', 'revoked'],
  accepted: ['nda_signed', 'revoked'],
  nda_signed: ['revoked'],
  declined: [],
  revoked: [],
});

/** Contracts (Stage 10). Approved versions are immutable. */
export const CONTRACT_STATES = ['draft', 'in_review', 'approved', 'partially_signed', 'executed', 'terminated', 'superseded'] as const;
export type ContractState = (typeof CONTRACT_STATES)[number];
export const ContractMachine = machine<ContractState>('contract', CONTRACT_STATES, 'draft', {
  draft: ['in_review'],
  in_review: ['approved', 'draft'],
  approved: ['partially_signed', 'executed', 'superseded'],
  partially_signed: ['executed', 'superseded'],
  executed: ['terminated', 'superseded'],
  terminated: [],
  superseded: [],
});

/** Projects & milestones (Stage 11). */
export const PROJECT_STATES = ['planning', 'active', 'on_hold', 'completed', 'closed'] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];
export const ProjectMachine = machine<ProjectState>('project', PROJECT_STATES, 'planning', {
  planning: ['active'],
  active: ['on_hold', 'completed'],
  on_hold: ['active'],
  completed: ['closed', 'active'],
  closed: [],
});
export const MILESTONE_STATES = ['planned', 'in_progress', 'submitted', 'certified', 'rejected', 'invoiced'] as const;
export type MilestoneState = (typeof MILESTONE_STATES)[number];
export const MilestoneMachine = machine<MilestoneState>('milestone', MILESTONE_STATES, 'planned', {
  planned: ['in_progress'],
  in_progress: ['submitted'],
  submitted: ['certified', 'rejected'],
  rejected: ['in_progress'],
  certified: ['invoiced'],
  invoiced: [],
});

/** Purchase orders (Stage 11 — trading). */
export const PO_STATES = ['draft', 'issued', 'accepted', 'in_fulfilment', 'shipped', 'delivered', 'closed', 'cancelled'] as const;
export type PoState = (typeof PO_STATES)[number];
export const PoMachine = machine<PoState>('purchase_order', PO_STATES, 'draft', {
  draft: ['issued', 'cancelled'],
  issued: ['accepted', 'cancelled'],
  accepted: ['in_fulfilment', 'cancelled'],
  in_fulfilment: ['shipped'],
  shipped: ['delivered'],
  delivered: ['closed'],
  closed: [],
  cancelled: [],
});

/** Disputes (lead ownership, commission, payment) and support tickets. */
export const DISPUTE_STATES = ['open', 'evidence', 'panel_review', 'resolved', 'appealed', 'closed'] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];
export const DisputeMachine = machine<DisputeState>('dispute', DISPUTE_STATES, 'open', {
  open: ['evidence', 'panel_review', 'closed'],
  evidence: ['panel_review'],
  panel_review: ['resolved'],
  resolved: ['appealed', 'closed'],
  appealed: ['panel_review'],
  closed: [],
});

export const TICKET_STATES = ['open', 'in_progress', 'escalated', 'resolved', 'closed'] as const;
export type TicketState = (typeof TICKET_STATES)[number];
export const TicketMachine = machine<TicketState>('ticket', TICKET_STATES, 'open', {
  open: ['in_progress', 'escalated', 'resolved'],
  in_progress: ['escalated', 'resolved'],
  escalated: ['in_progress', 'resolved'],
  resolved: ['closed', 'open'],
  closed: [],
});

export const REVIEW_STATES = ['pending_moderation', 'published', 'rejected', 'appealed', 'withdrawn'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];
export const ReviewMachine = machine<ReviewState>('review', REVIEW_STATES, 'pending_moderation', {
  pending_moderation: ['published', 'rejected'],
  published: ['appealed', 'withdrawn'],
  appealed: ['published', 'withdrawn'],
  rejected: ['appealed'],
  withdrawn: [],
});

export const ALL_MACHINES = {
  OpportunityMachine, KybMachine, LeadClaimMachine, CommissionMachine, TenderMachine, BidMachine, TeamMachine,
  TeamMemberMachine, ContractMachine, ProjectMachine, MilestoneMachine, PoMachine, DisputeMachine, TicketMachine, ReviewMachine,
};

/**
 * Built-in ACTION OS connectors: derive action candidates from COLLABIZ records the user is authorised to act on.
 * Authorisation is by the user's own active memberships (and, for managers, owner/admin roles) — never by platform role
 * alone, so a platform administrator does not see other companies' confidential records by default.
 * Every candidate keeps its source link. Due dates and values come only from the source record; when absent they stay null.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { ActionKind, Verification } from '@collabiz/types';
import type { Db } from '../../db/client';

export interface Principal {
  userId: string; name: string; email: string;
  memberships: { orgId: string; orgName: string; orgType: string; role: string }[];
}
export interface Candidate {
  sourceApp: string; sourceModule: string; sourceRecordId: string; organizationId: string; kind: ActionKind; title: string; summary: string; recordUrl: string;
  dueAt: Date | null; valuePaise: number | null; risk: 'none' | 'low' | 'contractual' | 'compliance'; strategic: number; blocker: boolean; commitment: boolean; mandatory: boolean;
  verification: Verification; confidentiality: 'normal' | 'confidential' | 'restricted'; sourceStatus: string;
}
const MANAGER = ['org_owner', 'org_admin', 'unite_admin'];

async function rows<T>(db: Db, q: SQL): Promise<T[]> {
  const r = await db.execute(q);
  return ((r as unknown as { rows?: T[] }).rows ?? (r as unknown as T[]));
}
const list = (ids: string[]) => sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `);
const endOfDay = (d: string) => new Date(`${d}T23:59:59+05:30`);
const c = (x: Partial<Candidate> & Pick<Candidate, 'sourceApp' | 'sourceModule' | 'sourceRecordId' | 'organizationId' | 'kind' | 'title' | 'recordUrl'>): Candidate => ({
  summary: '', dueAt: null, valuePaise: null, risk: 'none', strategic: 0, blocker: false, commitment: false, mandatory: false, verification: 'confirmed', confidentiality: 'normal', sourceStatus: '', ...x,
});

export const CONNECTORS: { key: string; app: string; label: string; collect: (db: Db, p: Principal, now: Date) => Promise<Candidate[]> }[] = [
  {
    key: 'crm_tasks', app: 'crm', label: 'CRM tasks assigned to me',
    async collect(db, p) {
      const orgs = p.memberships.map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; title: string; due_at: Date; organization_id: string; deal_id: string | null }>(db, sql`select id, title, due_at, organization_id, deal_id from crm_tasks where status = 'open' and assignee_user_id = ${p.userId}::uuid and organization_id in (${list(orgs)}) and due_at < now() + interval '14 days'`);
      return r.map((t) => c({ sourceApp: 'crm', sourceModule: 'tasks', sourceRecordId: t.id, organizationId: t.organization_id, kind: 'task', title: t.title, recordUrl: t.deal_id ? '/crm/pipeline' : '/activity', dueAt: new Date(t.due_at), commitment: true, sourceStatus: 'open' }));
    },
  },
  {
    key: 'offer_applications', app: 'business-offers', label: 'New applications on my offers',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; opp: string; code: string; title: string; owner: string; applicant: string; proposed_value: number | null; created_at: Date }>(db, sql`
        select a.id, o.id as opp, o.code, o.title, o.owner_org_id as owner, ao.display_name as applicant, a.proposed_value, a.created_at from opportunity_applications a
        join opportunities o on o.id = a.opportunity_id join organizations ao on ao.id = a.organization_id
        where a.status = 'submitted' and o.owner_org_id in (${list(orgs)})`);
      return r.map((a) => c({ sourceApp: 'business-offers', sourceModule: 'applications', sourceRecordId: a.id, organizationId: a.owner, kind: 'decision', title: `Review ${a.applicant}’s application for ${a.code}`, summary: a.title, recordUrl: `/business-offers/${a.opp}`, valuePaise: a.proposed_value != null ? Number(a.proposed_value) : null, commitment: true, sourceStatus: 'submitted' }));
    },
  },
  {
    key: 'collab_invitations', app: 'collab', label: 'Invitations to apply',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; opp: string; title: string; to_org_id: string; expires_on: string }>(db, sql`
        select i.id, i.opportunity_id as opp, o.title, i.to_org_id, b.expires_on::text from collab_invitations i join opportunities o on o.id = i.opportunity_id join business_offers b on b.opportunity_id = i.opportunity_id
        where i.status = 'sent' and i.to_org_id in (${list(orgs)}) and b.status in ('active', 'negotiating')
          and not exists (select 1 from opportunity_applications x where x.opportunity_id = i.opportunity_id and x.organization_id = i.to_org_id and x.status <> 'withdrawn')`);
      return r.map((i) => c({ sourceApp: 'collab', sourceModule: 'invitations', sourceRecordId: i.id, organizationId: i.to_org_id, kind: 'opportunity', title: `Invited to apply: ${i.title}`, recordUrl: `/business-offers/${i.opp}`, dueAt: endOfDay(i.expires_on), strategic: 0.3, sourceStatus: 'invited' }));
    },
  },
  {
    key: 'collab_proposals', app: 'collab', label: 'Proposals waiting for my reply',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; application_id: string; round: number; to_org_id: string; from_name: string; title: string }>(db, sql`
        select pr.id, pr.application_id, pr.round, pr.to_org_id, fo.display_name as from_name, o.title from collab_proposals pr join organizations fo on fo.id = pr.from_org_id join opportunities o on o.id = pr.opportunity_id
        where pr.status = 'sent' and pr.to_org_id in (${list(orgs)})`);
      return r.map((x) => c({ sourceApp: 'collab', sourceModule: 'proposals', sourceRecordId: x.id, organizationId: x.to_org_id, kind: 'decision', title: `Reply to ${x.from_name}’s proposal (round ${x.round})`, summary: x.title, recordUrl: `/collab/room/${x.application_id}`, commitment: true, risk: 'contractual', sourceStatus: 'sent' }));
    },
  },
  {
    key: 'offers_expiring', app: 'business-offers', label: 'My offers expiring soon',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; code: string; title: string; owner: string; expires_on: string }>(db, sql`
        select o.id, o.code, o.title, o.owner_org_id as owner, b.expires_on::text from business_offers b join opportunities o on o.id = b.opportunity_id
        where b.status in ('active', 'negotiating') and o.owner_org_id in (${list(orgs)}) and b.expires_on <= current_date + 7`);
      return r.map((o) => c({ sourceApp: 'business-offers', sourceModule: 'offers', sourceRecordId: o.id, organizationId: o.owner, kind: 'deadline', title: `Offer ${o.code} expires ${o.expires_on}`, summary: o.title, recordUrl: `/business-offers/${o.id}`, dueAt: endOfDay(o.expires_on), sourceStatus: 'active' }));
    },
  },
  {
    key: 'unite_first_look', app: 'business-offers', label: 'Unite first-look decisions',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; title: string; reviewer: string; until: Date }>(db, sql`
        select o.id, o.title, b.unite_review_org_id as reviewer, b.unite_review_until as until from business_offers b join opportunities o on o.id = b.opportunity_id
        where b.unite_review_org_id in (${list(orgs)}) and b.unite_released_at is null and b.unite_decision is null and b.unite_review_until > now()`);
      return r.map((o) => c({ sourceApp: 'business-offers', sourceModule: 'unite-first-look', sourceRecordId: o.id, organizationId: o.reviewer, kind: 'decision', title: `First look: decide on “${o.title}”`, recordUrl: `/business-offers/${o.id}`, dueAt: new Date(o.until), strategic: 0.6, sourceStatus: 'first_look' }));
    },
  },
  {
    key: 'collections', app: 'projects', label: 'Invoices to collect',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; number: string; amount: number; issuer: string; project_id: string; due: string | null }>(db, sql`
        select i.id, i.number, i.amount, i.issued_by_org_id as issuer, i.project_id, coalesce(i.due_date, (i.issued_at + interval '30 days')::date)::text as due from project_invoices i
        where i.status = 'issued' and i.issued_by_org_id in (${list(orgs)})`);
      return r.map((i) => c({ sourceApp: 'projects', sourceModule: 'invoices', sourceRecordId: i.id, organizationId: i.issuer, kind: 'collection', title: `Collect invoice ${i.number}`, recordUrl: `/projects/${i.project_id}/payments`, dueAt: i.due ? endOfDay(i.due) : null, valuePaise: Number(i.amount), risk: 'contractual', confidentiality: 'confidential', sourceStatus: 'issued' }));
    },
  },
  {
    key: 'payables', app: 'projects', label: 'Invoices to pay',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; number: string; amount: number; owner: string; project_id: string; due: string | null }>(db, sql`
        select i.id, i.number, i.amount, pj.owner_org_id as owner, i.project_id, coalesce(i.due_date, (i.issued_at + interval '30 days')::date)::text as due from project_invoices i join projects pj on pj.id = i.project_id
        where i.status = 'issued' and pj.owner_org_id in (${list(orgs)}) and i.issued_by_org_id <> pj.owner_org_id`);
      return r.map((i) => c({ sourceApp: 'projects', sourceModule: 'invoices', sourceRecordId: i.id, organizationId: i.owner, kind: 'payment', title: `Pay invoice ${i.number}`, recordUrl: `/projects/${i.project_id}/payments`, dueAt: i.due ? endOfDay(i.due) : null, valuePaise: Number(i.amount), risk: 'contractual', confidentiality: 'confidential', sourceStatus: 'issued' }));
    },
  },
  {
    key: 'milestones', app: 'projects', label: 'Milestones due',
    async collect(db, p) {
      const orgs = p.memberships.map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; title: string; project_id: string; code: string; org: string; due_date: string; amount: number; status: string }>(db, sql`
        select m.id, m.title, m.project_id, pj.code, coalesce(m.assigned_org_id, pj.lead_org_id) as org, m.due_date::text, m.amount, m.status from milestones m join projects pj on pj.id = m.project_id
        where m.status in ('planned', 'in_progress', 'rejected') and coalesce(m.assigned_org_id, pj.lead_org_id) in (${list(orgs)}) and m.due_date <= current_date + 14`);
      return r.map((m) => c({ sourceApp: 'projects', sourceModule: 'milestones', sourceRecordId: m.id, organizationId: m.org, kind: m.status === 'rejected' ? 'blocker' : 'deadline', title: `${m.status === 'rejected' ? 'Resubmit' : 'Complete'} milestone “${m.title}” (${m.code})`, recordUrl: `/projects/${m.project_id}/milestones`, dueAt: endOfDay(m.due_date), valuePaise: Number(m.amount), risk: 'contractual', commitment: true, blocker: m.status === 'rejected', sourceStatus: m.status }));
    },
  },
  {
    key: 'tender_bids', app: 'tenders', label: 'Draft bids before closing',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; tender_id: string; code: string; title: string; org: string; closes_at: Date }>(db, sql`
        select b.id, t.id as tender_id, t.code, t.title, b.organization_id as org, t.closes_at from bids b join tenders t on t.id = b.tender_id
        where b.status = 'draft' and b.organization_id in (${list(orgs)}) and t.closes_at > now() and t.closes_at < now() + interval '14 days'`);
      return r.map((b) => c({ sourceApp: 'tenders', sourceModule: 'bids', sourceRecordId: b.id, organizationId: b.org, kind: 'deadline', title: `Submit bid for ${b.code} before it closes`, summary: b.title, recordUrl: `/tenders/${b.tender_id}/bid`, dueAt: new Date(b.closes_at), mandatory: true, risk: 'contractual', sourceStatus: 'draft' }));
    },
  },
  {
    key: 'product_enquiries', app: 'powertek', label: 'Product enquiries to answer',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; code: string; brand: string; city: string; created_at: Date }>(db, sql`
        select e.id, e.code, e.brand_org_id as brand, e.city, e.created_at from product_enquiries e where e.status = 'submitted' and e.brand_org_id in (${list(orgs)})`);
      return r.map((e) => c({ sourceApp: 'powertek', sourceModule: 'enquiries', sourceRecordId: e.id, organizationId: e.brand, kind: 'follow_up', title: `Respond to product enquiry ${e.code} (${e.city})`, recordUrl: '/powertek/enquiries', commitment: true, confidentiality: 'confidential', sourceStatus: 'submitted', verification: 'reported' }));
    },
  },
  {
    key: 'energy_introductions', app: 'energy', label: 'Energy introduction requests',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const r = await rows<{ id: string; listing: string; code: string; title: string; org: string }>(db, sql`
        select i.id, l.id as listing, l.code, l.title, l.org_id as org from energy_introductions i join energy_listings l on l.id = i.listing_id
        where i.status = 'requested' and l.org_id in (${list(orgs)})`);
      return r.map((x) => c({ sourceApp: 'energy', sourceModule: 'introductions', sourceRecordId: x.id, organizationId: x.org, kind: 'decision', title: `Introduction request on ${x.code}`, summary: x.title, recordUrl: `/energy/listings/${x.listing}`, commitment: true, strategic: 0.5, sourceStatus: 'requested' }));
    },
  },
  {
    key: 'xchange', app: 'xchange', label: 'Barter deals and deliveries',
    async collect(db, p) {
      const orgs = p.memberships.filter((m) => MANAGER.includes(m.role)).map((m) => m.orgId); if (!orgs.length) return [];
      const proposed = await rows<{ id: string; code: string; org: string; value: number }>(db, sql`
        select distinct on (d.id, l.org) d.id, d.code, l.org, l.value from xchange_deals d join (select deal_id, from_org_id as org, value from xchange_legs union all select deal_id, to_org_id, value from xchange_legs) l on l.deal_id = d.id
        where d.status = 'proposed' and l.org in (${list(orgs)}) and d.proposed_by_org_id <> l.org`);
      const toAccept = await rows<{ id: string; deal: string; code: string; org: string; value: number }>(db, sql`
        select l.id, d.id as deal, d.code, l.to_org_id as org, l.value from xchange_legs l join xchange_deals d on d.id = l.deal_id where d.status = 'agreed' and l.status = 'delivered' and l.to_org_id in (${list(orgs)})`);
      const toDeliver = await rows<{ id: string; deal: string; code: string; org: string; value: number; description: string }>(db, sql`
        select l.id, d.id as deal, d.code, l.from_org_id as org, l.value, l.description from xchange_legs l join xchange_deals d on d.id = l.deal_id where d.status = 'agreed' and l.status = 'pending' and l.from_org_id in (${list(orgs)})`);
      return [
        ...proposed.map((d) => c({ sourceApp: 'xchange', sourceModule: 'deals', sourceRecordId: d.id, organizationId: d.org, kind: 'decision', title: `Review barter proposal ${d.code}`, recordUrl: `/xchange/deals/${d.id}`, valuePaise: Number(d.value), commitment: true, sourceStatus: 'proposed' })),
        ...toAccept.map((l) => c({ sourceApp: 'xchange', sourceModule: 'legs', sourceRecordId: l.id, organizationId: l.org, kind: 'approval', title: `Confirm delivery received on ${l.code}`, recordUrl: `/xchange/deals/${l.deal}`, valuePaise: Number(l.value), risk: 'contractual', sourceStatus: 'delivered' })),
        ...toDeliver.map((l) => c({ sourceApp: 'xchange', sourceModule: 'legs', sourceRecordId: l.id, organizationId: l.org, kind: 'deadline', title: `Deliver on ${l.code}: ${l.description.slice(0, 80)}`, recordUrl: `/xchange/deals/${l.deal}`, valuePaise: Number(l.value), commitment: true, risk: 'contractual', sourceStatus: 'pending' })),
      ];
    },
  },
];

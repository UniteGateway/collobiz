/**
 * GO EB5 access layer. Roles come from: platform super admin; staff rows in eb5_roles (privileged — two-step sign-in
 * required); an approved eb5_partners record for the user's organisation (partner); being the linked client on a lead.
 * The module is behind the `go_eb5` feature flag. Every API checks permissions here — the UI only mirrors them.
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { EB5_DEFAULT_SETTINGS, EB5_ROLES, eb5Can, type Eb5Permission, type Eb5Settings } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { eb5Leads, eb5Partners, eb5Roles, eb5Settings, featureFlags, notifications } from '../../db/schema';
import type { RequestContext } from '../../common/context';
import type { PgTable } from 'drizzle-orm/pg-core';

export interface Eb5Who { roles: string[]; partner: typeof eb5Partners.$inferSelect | null; staff: boolean; isClient: boolean; mfaNeeded: boolean }

@Injectable()
export class Eb5Access {
  constructor(@InjectDb() private db: Db) {}

  async enabled() { const [f] = await this.db.select().from(featureFlags).where(eq(featureFlags.key, 'go_eb5')); return !!f?.enabled; }

  async who(ctx: RequestContext): Promise<Eb5Who> {
    const roles = new Set<string>();
    if (ctx.platformRoles.includes('super_admin' as never)) roles.add('super_admin');
    const staffRows = await this.db.select({ r: eb5Roles.role }).from(eb5Roles).where(eq(eb5Roles.userId, ctx.userId));
    const staffRoles = staffRows.map((r) => r.r).filter((r) => (EB5_ROLES as readonly string[]).includes(r));
    const mfaNeeded = staffRoles.length > 0 && !ctx.mfaVerified;
    if (!mfaNeeded) staffRoles.forEach((r) => roles.add(r));
    const orgIds = ctx.memberships.map((m) => m.organizationId);
    const [partner] = orgIds.length ? await this.db.select().from(eb5Partners).where(inArray(eb5Partners.orgId, orgIds)).limit(1) : [];
    if (partner?.complianceStatus === 'approved') roles.add(partner.role);
    const [client] = await this.db.select({ id: eb5Leads.id }).from(eb5Leads).where(eq(eb5Leads.clientUserId, ctx.userId)).limit(1);
    if (client) roles.add('client');
    return { roles: [...roles], partner: partner ?? null, staff: staffRoles.length > 0 || roles.has('super_admin'), isClient: !!client, mfaNeeded };
  }

  /** Module gate + resolve roles. Hidden (404) when the flag is off, except for super admins configuring it. */
  async open(ctx: RequestContext) {
    const w = await this.who(ctx);
    if (!(await this.enabled()) && !w.roles.includes('super_admin')) throw new NotFoundException('Not found');
    return w;
  }
  async need(ctx: RequestContext, p: Eb5Permission) {
    const w = await this.open(ctx);
    if (!eb5Can(w.roles, p)) throw new ForbiddenException(w.mfaNeeded ? 'Turn on two-step sign-in to use your GO EB5 staff role' : 'Your GO EB5 role does not allow this');
    return w;
  }

  async settings(): Promise<Eb5Settings> {
    const [s] = await this.db.select().from(eb5Settings).where(eq(eb5Settings.id, 1));
    const v = (s?.values ?? {}) as Partial<Eb5Settings>;
    return { ...EB5_DEFAULT_SETTINGS, ...v, legal: { ...EB5_DEFAULT_SETTINGS.legal, ...(v.legal ?? {}) } };
  }

  /** Leads a person may see: staff with lead.view_all see all; attorneys see assigned; partners see their own introductions; clients their own. */
  async leadScope(ctx: RequestContext, w: Eb5Who) {
    if (eb5Can(w.roles, 'lead.view_all')) return undefined;
    const ors = [];
    if (w.roles.includes('attorney')) ors.push(eq(eb5Leads.attorneyUserId, ctx.userId));
    if (w.partner && w.partner.complianceStatus === 'approved') ors.push(eq(eb5Leads.partnerId, w.partner.id));
    if (w.roles.includes('client')) ors.push(eq(eb5Leads.clientUserId, ctx.userId));
    if (w.roles.includes('regional_center')) ors.push(sql`${eb5Leads.projectId} is not null`);
    return ors.length ? sql.join(ors.map((o) => sql`(${o})`), sql` or `) : sql`false`;
  }
  async lead(ctx: RequestContext, w: Eb5Who, id: string) {
    const scope = await this.leadScope(ctx, w);
    const [l] = await this.db.select().from(eb5Leads).where(and(eq(eb5Leads.id, id), scope ? sql`(${scope})` : undefined)).limit(1);
    if (!l) throw new NotFoundException('Not found');
    return l;
  }
  /** How a role relates to one lead — decides which fields it may see. */
  relation(ctx: RequestContext, w: Eb5Who, l: typeof eb5Leads.$inferSelect) {
    if (eb5Can(w.roles, 'lead.view_all') || (w.roles.includes('attorney') && l.attorneyUserId === ctx.userId)) return 'staff' as const;
    if (l.clientUserId === ctx.userId) return 'client' as const;
    if (w.partner && l.partnerId === w.partner.id) return 'partner' as const;
    return 'project' as const;
  }

  async notifyUsers(userIds: (string | null | undefined)[], title: string, body: string, link: string) {
    const ids = [...new Set(userIds.filter((x): x is string => !!x))];
    if (ids.length) await this.db.insert(notifications).values(ids.map((u) => ({ userId: u, kind: 'eb5', title, body, link })));
  }
  async staffUsers(roles: string[]) {
    return (await this.db.selectDistinct({ u: eb5Roles.userId }).from(eb5Roles).where(inArray(eb5Roles.role, roles))).map((r) => r.u);
  }
  async code(table: PgTable, prefix: string) {
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(table);
    return `${prefix}-${new Date().getFullYear()}-${String(100001 + Number(n)).padStart(6, '0')}`;
  }
}

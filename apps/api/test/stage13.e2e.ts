import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

/**
 * Stage 13 gate — message privacy, retention and escalation (screens 105–112, 147, 150).
 */
describe('Stage 13 — messaging, meetings and support', () => {
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof loginAll>>;
  let pool: Pool;
  const sql = (q: string, p: unknown[] = []) => pool.query(q, p);
  const userId = async (email: string) => (await sql('select id from users where email = $1', [email])).rows[0].id as string;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });

  let threadId = '';
  it('106 direct chat: verified partners only, bodies encrypted at rest, only members can read', async () => {
    const ravi = await userId('ravi@sunrise.example');
    const contacts = await api(app).get('/v1/chat/contacts?q=Ravi').set(auth(t.asha)).expect(200);
    expect(contacts.body.map((c: any) => c.userId)).toContain(ravi);
    // Unverified organization cannot start conversations, and cannot be messaged
    await api(app).post('/v1/chat/direct').set(auth(t.vikram)).send({ recipientUserId: ravi, body: 'Hello' }).expect(403);
    const vikram = await userId('vikram@greenbuild.example');
    await api(app).post('/v1/chat/direct').set(auth(t.asha)).send({ recipientUserId: vikram, body: 'Hello' }).expect(400);
    const r = await api(app).post('/v1/chat/direct').set(auth(t.asha)).send({ recipientUserId: ravi, subject: 'HT cable supply', body: 'Can you quote 2 km of 11 kV cable for Chakan?' }).expect(201);
    threadId = r.body.threadId;
    const stored = (await sql('select body_enc from messages where thread_id = $1', [threadId])).rows[0].body_enc as string;
    expect(stored).not.toContain('11 kV'); // encrypted at rest
    const asRavi = await api(app).get(`/v1/chat/threads/${threadId}`).set(auth(t.ravi)).expect(200);
    expect(asRavi.body.messages[0]).toMatchObject({ body: 'Can you quote 2 km of 11 kV cable for Chakan?', mine: false });
    // Non-members — including platform administrators — cannot read it
    await api(app).get(`/v1/chat/threads/${threadId}`).set(auth(t.meera)).expect(404);
    await api(app).get(`/v1/chat/threads/${threadId}`).set(auth(t.superadmin)).expect(404);
    // Starting again reuses the same conversation
    const again = await api(app).post('/v1/chat/direct').set(auth(t.asha)).send({ recipientUserId: ravi, body: 'Following up' }).expect(201);
    expect(again.body.threadId).toBe(threadId);
  });

  it('105 inbox shows unread counts and previews per conversation', async () => {
    const inbox = await api(app).get('/v1/inbox').set(auth(t.ravi)).expect(200);
    const row = inbox.body.find((x: any) => x.id === threadId);
    expect(row).toMatchObject({ kind: 'direct', unread: 1 }); // Ravi read the first message; the follow-up is new
    expect(row.title).toMatch(/Asha Patil \(Volt EPC\)/);
    await api(app).get(`/v1/chat/threads/${threadId}`).set(auth(t.ravi)).expect(200);
    expect((await api(app).get('/v1/inbox').set(auth(t.ravi)).expect(200)).body.find((x: any) => x.id === threadId).unread).toBe(0);
  });

  it('107 unsend works only within 15 minutes; blocks stop direct messages', async () => {
    const sent = await api(app).post(`/v1/chat/threads/${threadId}/messages`).set(auth(t.asha)).send({ body: 'Wrong attachment, ignore' }).expect(201);
    await api(app).post(`/v1/chat/messages/${sent.body.id}/delete`).set(auth(t.ravi)).expect(404); // not the author
    await api(app).post(`/v1/chat/messages/${sent.body.id}/delete`).set(auth(t.asha)).expect(200);
    const old = await api(app).post(`/v1/chat/threads/${threadId}/messages`).set(auth(t.asha)).send({ body: 'Older message' }).expect(201);
    await sql("update messages set created_at = now() - interval '20 minutes' where id = $1", [old.body.id]);
    await api(app).post(`/v1/chat/messages/${old.body.id}/delete`).set(auth(t.asha)).expect(409);
    const th = await api(app).get(`/v1/chat/threads/${threadId}`).set(auth(t.ravi)).expect(200);
    expect(th.body.messages.find((m: any) => m.id === sent.body.id)).toMatchObject({ state: 'deleted', body: null });
    const asha = await userId('asha@voltepc.example');
    await api(app).post(`/v1/chat/blocks/${asha}`).set(auth(t.ravi)).expect((r) => expect([200, 201]).toContain(r.status));
    await api(app).post(`/v1/chat/threads/${threadId}/messages`).set(auth(t.asha)).send({ body: 'Are you there?' }).expect(403);
    await api(app).post(`/v1/chat/blocks/${asha}/remove`).set(auth(t.ravi)).expect((r) => expect([200, 201]).toContain(r.status));
    await api(app).post(`/v1/chat/threads/${threadId}/messages`).set(auth(t.asha)).send({ body: 'Are you there?' }).expect(201);
  });

  it('retention removes old bodies unless the thread is on legal hold; staff never receive content', async () => {
    const m = await api(app).post(`/v1/chat/threads/${threadId}/messages`).set(auth(t.ravi)).send({ body: 'Quote attached: ₹18.4 L' }).expect(201);
    await sql("update messages set created_at = now() - interval '800 days' where id = $1", [m.body.id]);
    await api(app).post(`/v1/admin/messaging/threads/${threadId}/legal-hold`).set(auth(t.asha)).send({ hold: true, reason: 'Dispute over cable pricing' }).expect(403);
    const hold = await api(app).post(`/v1/admin/messaging/threads/${threadId}/legal-hold`).set(auth(t.compliance)).send({ hold: true, reason: 'Dispute over cable pricing' }).expect((r) => expect([200, 201]).toContain(r.status));
    expect(JSON.stringify(hold.body)).not.toContain('18.4');
    await api(app).post('/v1/admin/messaging/retention/run').set(auth(t.compliance)).expect((r) => expect([200, 201]).toContain(r.status));
    expect((await sql('select purged_at from messages where id = $1', [m.body.id])).rows[0].purged_at).toBeNull();
    await api(app).post(`/v1/admin/messaging/threads/${threadId}/legal-hold`).set(auth(t.compliance)).send({ hold: false, reason: 'Dispute settled by agreement' }).expect((r) => expect([200, 201]).toContain(r.status));
    await api(app).post('/v1/admin/messaging/retention/run').set(auth(t.compliance)).expect((r) => expect([200, 201]).toContain(r.status));
    const row = (await sql('select purged_at, body_enc from messages where id = $1', [m.body.id])).rows[0];
    expect(row.purged_at).not.toBeNull();
    expect(row.body_enc).toBeNull();
    const th = await api(app).get(`/v1/chat/threads/${threadId}`).set(auth(t.asha)).expect(200);
    expect(th.body.messages.find((x: any) => x.id === m.body.id).state).toBe('purged');
  });

  it('reporting a message shares only that message with support staff', async () => {
    const m = await api(app).post(`/v1/chat/threads/${threadId}/messages`).set(auth(t.ravi)).send({ body: 'Pay me outside the platform and skip the commission' }).expect(201);
    await api(app).post(`/v1/chat/messages/${m.body.id}/report`).set(auth(t.ravi)).send({ reason: 'Testing that I cannot report myself' }).expect(400);
    const rep = await api(app).post(`/v1/chat/messages/${m.body.id}/report`).set(auth(t.asha)).send({ reason: 'Suggests bypassing the commission ledger' }).expect((r) => expect([200, 201]).toContain(r.status));
    const ticketId = rep.body.ticketId ?? rep.body.id;
    const staffView = await api(app).get(`/v1/support/tickets/${ticketId}`).set(auth(t.compliance)).expect(200);
    expect(staffView.body.reportedExcerpt).toContain('skip the commission');
    expect(JSON.stringify(staffView.body)).not.toContain('Can you quote 2 km'); // no other messages
    const reporterView = await api(app).get(`/v1/support/tickets/${ticketId}`).set(auth(t.asha)).expect(200);
    expect(reporterView.body.reportedExcerpt).toBeUndefined();
  });

  it('108/109 meetings: verified invitees only, room opens 15 minutes before, organizer records minutes', async () => {
    const ravi = await userId('ravi@sunrise.example');
    const vikram = await userId('vikram@greenbuild.example');
    const start = new Date(Date.now() + 5 * 60_000), end = new Date(Date.now() + 65 * 60_000);
    await api(app).post('/v1/meetings').set(auth(t.asha)).send({ title: 'Cable scope call', startsAt: start.toISOString(), endsAt: end.toISOString(), attendeeUserIds: [vikram] }).expect(400);
    await api(app).post('/v1/meetings').set(auth(t.asha)).send({ title: 'Cable scope call', startsAt: end.toISOString(), endsAt: start.toISOString(), attendeeUserIds: [ravi] }).expect(400);
    const m = await api(app).post('/v1/meetings').set(auth(t.asha)).send({ title: 'Cable scope call', agenda: 'Quantities, delivery, payment terms', startsAt: start.toISOString(), endsAt: end.toISOString(), attendeeUserIds: [ravi] }).expect(201);
    expect(m.body.roomKey).toBeDefined();
    const room = await api(app).get(`/v1/meetings/${m.body.id}`).set(auth(t.ravi)).expect(200);
    expect(room.body.roomKey).toBeUndefined(); // never exposed directly
    expect(room.body.video.joinable).toBe(true);
    await api(app).get(`/v1/meetings/${m.body.id}`).set(auth(t.meera)).expect(404);
    await api(app).post(`/v1/meetings/${m.body.id}/rsvp`).set(auth(t.ravi)).send({ rsvp: 'accepted' }).expect(200);
    await api(app).post(`/v1/meetings/${m.body.id}/join`).set(auth(t.ravi)).expect(200);
    await api(app).put(`/v1/meetings/${m.body.id}/minutes`).set(auth(t.ravi)).send({ minutes: 'Agreed 2 km of 11 kV cable.', actionItems: [] }).expect(403);
    await api(app).put(`/v1/meetings/${m.body.id}/minutes`).set(auth(t.asha)).send({ minutes: 'Agreed 2 km of 11 kV cable, delivery in 3 weeks.', actionItems: [{ text: 'Send revised quote' }] }).expect(200);
    const later = await api(app).post('/v1/meetings').set(auth(t.asha)).send({ title: 'Follow-up review', startsAt: new Date(Date.now() + 86400_000).toISOString(), endsAt: new Date(Date.now() + 90000_000).toISOString(), attendeeUserIds: [ravi] }).expect(201);
    await api(app).post(`/v1/meetings/${later.body.id}/join`).set(auth(t.ravi)).expect(409);
    await api(app).post(`/v1/meetings/${later.body.id}/cancel`).set(auth(t.ravi)).send({ reason: 'Not mine to cancel' }).expect(403);
    await api(app).post(`/v1/meetings/${later.body.id}/cancel`).set(auth(t.asha)).send({ reason: 'Customer rescheduled the site visit' }).expect(200);
    const list = await api(app).get('/v1/meetings').set(auth(t.ravi)).expect(200);
    expect(list.body.find((x: any) => x.id === later.body.id).status).toBe('cancelled');
  });

  it('110 announcements: staff publish, audience rules apply, read state is per user', async () => {
    await api(app).post('/v1/admin/announcements').set(auth(t.asha)).send({ title: 'Partner meet in Pune', body: 'Join us for the quarterly partner meet.' }).expect(403);
    const a = await api(app).post('/v1/admin/announcements').set(auth(t.superadmin)).send({ title: 'Verified partners: new tender window', body: 'Three new solar tenders open next week for verified partners.', audience: 'verified_partners', important: true }).expect(201);
    expect((await api(app).get('/v1/announcements').set(auth(t.asha)).expect(200)).body.map((x: any) => x.id)).toContain(a.body.id);
    expect((await api(app).get('/v1/announcements').set(auth(t.vikram)).expect(200)).body.map((x: any) => x.id)).not.toContain(a.body.id); // unverified
    await api(app).post(`/v1/announcements/${a.body.id}/read`).set(auth(t.asha)).expect(200);
    expect((await api(app).get('/v1/announcements').set(auth(t.asha)).expect(200)).body.find((x: any) => x.id === a.body.id).read).toBe(true);
  });

  it('111/147 notifications: centre counts unread by kind; legal and financial email cannot be switched off', async () => {
    const c = await api(app).get('/v1/notifications').set(auth(t.ravi)).expect(200);
    expect(c.body.unreadByKind.message).toBeGreaterThan(0);
    await api(app).post('/v1/notifications/read').set(auth(t.ravi)).send({ all: true }).expect(200);
    expect((await api(app).get('/v1/notifications').set(auth(t.ravi)).expect(200)).body.unread).toBe(0);
    const prefs = await api(app).get('/v1/me/notification-preferences').set(auth(t.ravi)).expect(200);
    expect(prefs.body.find((p: any) => p.kind === 'contract')).toMatchObject({ mandatory: true, email: true });
    await api(app).put('/v1/me/notification-preferences').set(auth(t.ravi)).send({ preferences: [{ kind: 'commission', email: false, sms: false, push: true }] }).expect(400);
    const saved = await api(app).put('/v1/me/notification-preferences').set(auth(t.ravi)).send({ preferences: [{ kind: 'message', email: true, sms: false, push: false }] }).expect(200);
    expect(saved.body.find((p: any) => p.kind === 'message')).toMatchObject({ email: true, push: false });
  });

  it('112 support: SLA escalation is automatic; requesters see only their tickets and never internal notes', async () => {
    const tk = await api(app).post('/v1/support/tickets').set(auth(t.meera)).send({ category: 'payments', priority: 'high', subject: 'Payout not received', body: 'My payout PAY-2026-000001 shows settled but the bank has not credited it.' }).expect(201);
    expect(new Date(tk.body.firstResponseDueAt).getTime() - Date.now()).toBeGreaterThan(7 * 3600_000); // 8h for high
    await api(app).get(`/v1/support/tickets/${tk.body.id}`).set(auth(t.ravi)).expect(404);
    await api(app).post(`/v1/support/tickets/${tk.body.id}/escalate`).set(auth(t.meera)).send({ reason: 'Nobody has replied to me yet at all' }).expect(409); // not overdue yet
    await api(app).post(`/v1/support/tickets/${tk.body.id}/messages`).set(auth(t.meera)).send({ body: 'Internal?', internal: true }).expect(403);
    await api(app).post(`/v1/support/tickets/${tk.body.id}/messages`).set(auth(t.compliance)).send({ body: 'Check with finance first — bank file shows a return.', internal: true }).expect(201);
    expect(JSON.stringify((await api(app).get(`/v1/support/tickets/${tk.body.id}`).set(auth(t.meera)).expect(200)).body)).not.toContain('bank file');
    const slow = await api(app).post('/v1/support/tickets').set(auth(t.meera)).send({ category: 'technical', priority: 'urgent', subject: 'Cannot upload milestone evidence', body: 'Uploads fail with a timeout on the certification page.' }).expect(201);
    await sql("update support_tickets set first_response_due_at = now() - interval '1 minute' where id = $1", [slow.body.id]);
    const list = await api(app).get('/v1/support/tickets').set(auth(t.meera)).expect(200); // listing runs the sweep
    expect(list.body.tickets.find((x: any) => x.id === slow.body.id).status).toBe('escalated');
    expect(list.body.tickets.every((x: any) => x.requester === 'Meera Iyer')).toBe(true);
    // Staff reply records first response and moves the ticket on
    await api(app).post(`/v1/support/tickets/${tk.body.id}/messages`).set(auth(t.compliance)).send({ body: 'The bank returned the transfer; we are re-sending today.' }).expect(201);
    const after = await api(app).get(`/v1/support/tickets/${tk.body.id}`).set(auth(t.meera)).expect(200);
    expect(after.body.status).toBe('in_progress');
    await api(app).post(`/v1/support/tickets/${tk.body.id}/status`).set(auth(t.meera)).send({ status: 'resolved' }).expect(403);
    await api(app).post(`/v1/support/tickets/${tk.body.id}/status`).set(auth(t.compliance)).send({ status: 'resolved', note: 'Re-sent and confirmed' }).expect(200);
    await api(app).post(`/v1/support/tickets/${tk.body.id}/rating`).set(auth(t.meera)).send({ satisfaction: 5 }).expect(200);
  });

  it('150 help, feedback and account closure with blockers', async () => {
    expect((await api(app).get('/v1/help/articles').set(auth(t.meera)).expect(200)).body.length).toBeGreaterThan(3);
    await api(app).post('/v1/feedback').set(auth(t.meera)).send({ rating: 4, area: 'marketplace', comment: 'Filters are helpful' }).expect(201);
    const asha = await api(app).get('/v1/account/closure-check').set(auth(t.asha)).expect(200);
    expect(asha.body.canClose).toBe(false); // sole owner with an active project
    expect(asha.body.blockers.join(' ')).toMatch(/active project/);
    await api(app).post('/v1/account/closure').set(auth(t.asha)).send({ reason: 'Moving on', confirmEmail: 'asha@voltepc.example', confirm: true }).expect(409);
    await api(app).post('/v1/account/closure').set(auth(t.rohit)).send({ reason: 'Leaving Volt EPC', confirmEmail: 'wrong@example.com', confirm: true }).expect(400);
    const ok = await api(app).post('/v1/account/closure').set(auth(t.rohit)).send({ reason: 'Leaving Volt EPC', confirmEmail: 'rohit@voltepc.example', confirm: true }).expect(201);
    expect(new Date(ok.body.effectiveAfter).getTime()).toBeGreaterThan(Date.now() + 29 * 86400_000);
    await api(app).post('/v1/account/closure').set(auth(t.rohit)).send({ reason: 'Leaving Volt EPC', confirmEmail: 'rohit@voltepc.example', confirm: true }).expect(409);
  });
});

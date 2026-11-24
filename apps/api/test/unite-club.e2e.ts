/** Unite Club: chapters, one seat per business category, approvals, meetings with U meet rooms, referrals, service hours. */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Unite Club', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (p: string, tok?: string) => (tok ? api(app).get(`/v1${p}`).set(auth(tok)) : api(app).get(`/v1${p}`));
  const post = (p: string, b: object, tok?: string) => (tok ? api(app).post(`/v1${p}`).set(auth(tok)).send(b) : api(app).post(`/v1${p}`).send(b));
  const uid = async (email: string) => (await pool.query('select id from users where email = $1', [email])).rows[0].id as string;
  const chapter = { name: 'Unite Club Pune Central', city: 'Pune', state: 'Maharashtra', about: 'Business owners in central Pune who meet every week to pass referrals and serve the city.', meetingSchedule: 'Every Tuesday, 7:30 am', venue: 'Deccan Gymkhana', category: 'Solar EPC contractor' };
  const slug = 'unite-club-pune-central';

  it('a member proposes a chapter; it is public only after a Unite admin approves it', async () => {
    expect((await get('/public/unite-club').expect(200)).body).toMatchObject({ chapters: [], stats: { chapters: 0, members: 0, referrals: 0 } });
    await post('/unite-club/chapters', chapter).expect(401);
    expect((await post('/unite-club/chapters', chapter, t.asha).expect(201)).body).toEqual({ slug, status: 'proposed' });
    await post('/unite-club/chapters', chapter, t.ravi).expect(409);
    await get(`/public/unite-club/chapters/${slug}`).expect(404);
    expect((await get('/unite-club/me', t.asha).expect(200)).body.items[0]).toMatchObject({ slug, role: 'president', status: 'applied', chapterStatus: 'proposed' });
    const id = (await get('/admin/unite-club/chapters?status=proposed', t.uniteAdmin).expect(200)).body.items[0].id;
    await post(`/admin/unite-club/chapters/${id}/decide`, { decision: 'approve' }, t.asha).expect(403);
    await post(`/admin/unite-club/chapters/${id}/decide`, { decision: 'approve' }, t.uniteAdmin).expect(200);
    const pub = (await get(`/public/unite-club/chapters/${slug}`).expect(200)).body;
    expect(pub).toMatchObject({ name: chapter.name, members: 1, categories: ['Solar EPC contractor'] });
    expect(JSON.stringify(pub)).not.toContain('Asha'); // no member names in public
  });

  it('people apply; one seat per business category; officers decide', async () => {
    await post(`/unite-club/chapters/${slug}/apply`, { category: 'Solar EPC contractors' }, t.ravi).expect(409); // seat taken (same category)
    await post(`/unite-club/chapters/${slug}/apply`, { category: 'Electrical trader', intro: 'Wholesale cables and switchgear.' }, t.ravi).expect(201);
    await post(`/unite-club/chapters/${slug}/apply`, { category: 'Electrical trader' }, t.ravi).expect(409);
    await get(`/unite-club/chapters/${slug}`, t.ravi).expect(403); // not a member yet
    await post(`/unite-club/chapters/${slug}/apply`, { category: 'Green building consultant' }, t.vikram).expect(201);
    const view = (await get(`/unite-club/chapters/${slug}`, t.asha).expect(200)).body;
    expect(view.isOfficer).toBe(true); expect(view.applications).toHaveLength(2);
    const ravi = view.applications.find((a: { category: string }) => a.category === 'Electrical trader');
    const vikram = view.applications.find((a: { category: string }) => a.category !== 'Electrical trader');
    await post(`/unite-club/chapters/${slug}/members/${ravi.id}/decide`, { decision: 'approve' }, t.ravi).expect(403);
    await post(`/unite-club/chapters/${slug}/members/${ravi.id}/decide`, { decision: 'approve' }, t.asha).expect(200);
    await post(`/unite-club/chapters/${slug}/members/${vikram.id}/decide`, { decision: 'approve' }, t.asha).expect(200);
    const asRavi = (await get(`/unite-club/chapters/${slug}`, t.ravi).expect(200)).body;
    expect(asRavi.isOfficer).toBe(false); expect(asRavi.applications).toEqual([]);
    expect(asRavi.members.map((m: { name: string }) => m.name).sort()).toEqual(['Asha Patil', 'Ravi Patel', 'Vikram Raj'].sort());
  });

  let eventId: string;
  it('officers schedule meetings (online ones get a U meet room for every member); members RSVP', async () => {
    const start = new Date(Date.now() + 2 * 86_400_000), end = new Date(start.getTime() + 90 * 60_000);
    await post(`/unite-club/chapters/${slug}/events`, { kind: 'meeting', title: 'Weekly meeting', startsAt: start.toISOString(), endsAt: end.toISOString() }, t.ravi).expect(403);
    const e = (await post(`/unite-club/chapters/${slug}/events`, { kind: 'meeting', title: 'Weekly meeting', startsAt: start.toISOString(), endsAt: end.toISOString(), online: true }, t.asha).expect(201)).body;
    expect(e.room).toMatch(/^\/meetings\/[0-9a-f-]+\/room$/);
    const room = (await get(e.room.replace('/room', ''), t.ravi).expect(200)).body;
    expect(room.attendees).toHaveLength(3);
    await post(`/unite-club/events/${e.id}/rsvp`, { answer: 'going' }, t.ravi).expect(200);
    await post(`/unite-club/events/${e.id}/rsvp`, { answer: 'going' }, t.meera).expect(403);
    const ev = (await get(`/unite-club/chapters/${slug}`, t.ravi).expect(200)).body.events.find((x: { id: string }) => x.id === e.id);
    expect(ev).toMatchObject({ going: 1, myAnswer: 'going', room: e.room });
    eventId = e.id;
    await post(`/unite-club/events/${eventId}/hours`, { hours: 3 }, t.ravi).expect(400); // not a service project
  });

  it('referrals need consent; only giver and receiver see the contact; business won is reported by the receiver', async () => {
    const ravi = await uid('ravi@sunrise.example');
    const ref = { toUserId: ravi, contactName: 'Meghana Rao', contactPhone: '9876511111', need: 'Needs cables and a distribution board for a new shop.', consent: true };
    await post(`/unite-club/chapters/${slug}/referrals`, { ...ref, consent: false }, t.asha).expect(400);
    await post(`/unite-club/chapters/${slug}/referrals`, { ...ref, toUserId: await uid('meera@consult.example') }, t.asha).expect(400); // not a member
    const r = (await post(`/unite-club/chapters/${slug}/referrals`, ref, t.asha).expect(201)).body;
    const received = (await get(`/unite-club/chapters/${slug}`, t.ravi).expect(200)).body.referrals[0];
    expect(received).toMatchObject({ direction: 'received', from: 'Asha Patil', contactPhone: '9876511111' });
    const other = (await get(`/unite-club/chapters/${slug}`, t.vikram).expect(200)).body;
    expect(other.referrals).toEqual([]); expect(other.referralStats.given).toBe(1);
    await post(`/unite-club/referrals/${r.id}`, { status: 'won', reportedValueMinor: 85_000_00 }, t.asha).expect(404); // only the receiver
    await post(`/unite-club/referrals/${r.id}`, { status: 'won', reportedValueMinor: 85_000_00 }, t.ravi).expect(200);
    expect((await get(`/unite-club/chapters/${slug}`, t.vikram).expect(200)).body.referralStats).toEqual({ given: 1, won: 1, reportedValueMinor: 85_000_00 });
    expect((await pool.query("select count(*)::int n from notifications where user_id = (select id from users where email = 'asha@voltepc.example') and title = 'Your referral became business'")).rows[0].n).toBe(1);
    expect((await get('/public/unite-club').expect(200)).body.stats).toEqual({ chapters: 1, members: 3, referrals: 1 });
  });

  it('presidents hand over roles; a president cannot leave without handing over', async () => {
    await post(`/unite-club/chapters/${slug}/leave`, {}, t.asha).expect(409);
    const members = (await get(`/unite-club/chapters/${slug}`, t.asha).expect(200)).body.members;
    const ravi = members.find((m: { name: string }) => m.name === 'Ravi Patel');
    await post(`/unite-club/chapters/${slug}/members/${ravi.id}/role`, { role: 'president' }, t.vikram).expect(403);
    await post(`/unite-club/chapters/${slug}/members/${ravi.id}/role`, { role: 'president' }, t.asha).expect(200);
    expect((await get(`/unite-club/chapters/${slug}`, t.asha).expect(200)).body.me.role).toBe('member');
    await post(`/unite-club/chapters/${slug}/leave`, {}, t.asha).expect(200);
    await get(`/unite-club/chapters/${slug}`, t.asha).expect(403);
  });
});

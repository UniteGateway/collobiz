/** Website content (social links, YouTube videos), the COLLABIZ guide chat with handover to the Unite team, and U meet. */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';

describe('Website content, guide chat and U meet', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const get = (p: string, tok?: string) => (tok ? api(app).get(`/v1${p}`).set(auth(tok)) : api(app).get(`/v1${p}`));
  const post = (p: string, b: object, tok?: string) => (tok ? api(app).post(`/v1${p}`).set(auth(tok)).send(b) : api(app).post(`/v1${p}`).send(b));
  const put = (p: string, b: object, tok: string) => api(app).put(`/v1${p}`).set(auth(tok)).send(b);
  const uid = async (email: string) => (await pool.query('select id from users where email = $1', [email])).rows[0].id as string;

  it('admins set social links (official hosts only) and the public site shows only what is set', async () => {
    expect((await get('/public/site').expect(200)).body).toEqual({ social: {}, videos: [] });
    await put('/admin/site/social', { youtube: 'https://www.youtube.com/@unitegroup' }, t.asha).expect(403);
    await put('/admin/site/social', { facebook: 'https://evil.example/unite' }, t.uniteAdmin).expect(400);
    await put('/admin/site/social', { facebook: 'http://facebook.com/unite' }, t.uniteAdmin).expect(400); // https only
    await put('/admin/site/social', { youtube: 'https://www.youtube.com/@unitegroup', linkedin: 'https://www.linkedin.com/company/unite-group', x: '' }, t.uniteAdmin).expect(200);
    expect((await get('/public/site').expect(200)).body.social).toEqual({ youtube: 'https://www.youtube.com/@unitegroup', linkedin: 'https://www.linkedin.com/company/unite-group' });
  });

  it('admins add YouTube videos to pages; only published ones are public', async () => {
    await post('/admin/site/videos', { url: 'https://vimeo.com/1', title: 'Not YouTube', placements: ['home'] }, t.uniteAdmin).expect(400);
    await post('/admin/site/videos', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Somewhere', placements: ['javascript:alert(1)'] }, t.uniteAdmin).expect(400);
    const v = (await post('/admin/site/videos', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', title: 'Unite Group in two minutes', placements: ['home', 'page:/about', 'product:unieco'] }, t.uniteAdmin).expect(201)).body;
    expect(v.youtubeId).toBe('dQw4w9WgXcQ');
    await post('/admin/site/videos', { url: 'https://youtube.com/shorts/aaaaaaaaaaa', title: 'Draft video', placements: ['home'], published: false }, t.uniteAdmin).expect(201);
    const pub = (await get('/public/site').expect(200)).body.videos;
    expect(pub).toEqual([{ youtubeId: 'dQw4w9WgXcQ', title: 'Unite Group in two minutes', description: null, placements: ['home', 'page:/about', 'product:unieco'] }]);
    await put(`/admin/site/videos/${v.id}`, { url: v.youtubeId, title: 'Unite Group in two minutes', placements: ['module:umeet'] }, t.uniteAdmin).expect(200);
    expect((await get('/public/site').expect(200)).body.videos[0].placements).toEqual(['module:umeet']);
    expect((await get('/admin/site', t.uniteAdmin).expect(200)).body.videos).toHaveLength(2);
    await api(app).delete(`/v1/admin/site/videos/${v.id}`).set(auth(t.asha)).expect(403);
    await api(app).delete(`/v1/admin/site/videos/${v.id}`).set(auth(t.uniteAdmin)).expect(200);
    expect((await get('/public/site').expect(200)).body.videos).toEqual([]);
  });

  let token: string; let convId: string;
  it('the guide answers visitors with links, and keeps the conversation by token', async () => {
    const r = (await post('/public/guide/messages', { text: 'I want to become a dealer for cement', page: '/' }).expect(200)).body;
    token = r.token;
    expect(r.status).toBe('open');
    expect(r.messages.map((m: { sender: string }) => m.sender)).toEqual(['guide', 'visitor', 'guide']); // welcome, question, answer
    expect(r.messages[2].links[0].href).toBe('/partner-with-unite');
    const again = (await post('/public/guide/messages', { token, text: 'what is the solar price?' }).expect(200)).body;
    expect(again.token).toBe(token); expect(again.messages).toHaveLength(5);
    expect((await get(`/public/guide/messages?token=${token}`).expect(200)).body.messages).toHaveLength(5);
    await get('/public/guide/messages?token=not-a-real-token-at-all-xx').expect(404);
    expect((await pool.query('select count(*)::int n from guide_conversations where token_hash = $1', [token])).rows[0].n).toBe(0); // only the hash is stored
  });

  it('asking for a person needs an email from a visitor, then goes to the Unite team, who reply in the same chat', async () => {
    const ask = (await post('/public/guide/messages', { token, text: 'Can I talk to a person?' }).expect(200)).body;
    expect(ask.status).toBe('open'); expect(ask.messages.at(-1).body).toMatch(/add your email/);
    const ok = (await post('/public/guide/messages', { token, text: 'Talk to a person please', name: 'Kiran', email: 'kiran@example.com' }).expect(200)).body;
    expect(ok.status).toBe('waiting');
    const staffUser = await uid('unite.admin@collabiz.local');
    expect((await pool.query("select count(*)::int n from notifications where user_id = $1 and title like 'Guide chat%'", [staffUser])).rows[0].n).toBe(1);
    // While waiting, the guide stays quiet
    const quiet = (await post('/public/guide/messages', { token, text: 'Hello?' }).expect(200)).body;
    expect(quiet.messages.at(-1)).toMatchObject({ sender: 'visitor', body: 'Hello?' });
    await get('/admin/guide/conversations', t.asha).expect(403);
    const inbox = (await get('/admin/guide/conversations', t.uniteAdmin).expect(200)).body.items;
    expect(inbox[0]).toMatchObject({ status: 'waiting', name: 'Kiran', email: 'kiran@example.com', page: '/' });
    convId = inbox[0].id;
    await post(`/admin/guide/conversations/${convId}/reply`, { body: 'Hi Kiran, I can help. Which city are you in?' }, t.uniteAdmin).expect(201);
    const seen = (await get(`/public/guide/messages?token=${token}`).expect(200)).body;
    expect(seen.status).toBe('answered');
    expect(seen.messages.at(-1)).toMatchObject({ sender: 'staff', body: 'Hi Kiran, I can help. Which city are you in?', staff: expect.any(String) });
    await post(`/admin/guide/conversations/${convId}/close`, {}, t.uniteAdmin).expect(200);
    await post(`/admin/guide/conversations/${convId}/reply`, { body: 'late' }, t.uniteAdmin).expect(409);
  });

  it('a signed-in member’s chat is linked to them and they are notified of replies', async () => {
    const r = (await post('/public/guide/messages', { text: 'I need a human', page: '/dashboard' }, t.asha).expect(200)).body;
    expect(r.status).toBe('waiting'); // no email needed — the team knows who they are
    const row = (await get('/admin/guide/conversations', t.uniteAdmin).expect(200)).body.items.find((x: { member: boolean }) => x.member);
    expect(row).toMatchObject({ name: 'Asha Patil', organization: 'Volt EPC' });
    await post(`/admin/guide/conversations/${row.id}/reply`, { body: 'Hello Asha!' }, t.uniteAdmin).expect(201);
    expect((await pool.query("select count(*)::int n from notifications where user_id = $1 and title like 'The Unite team replied%'", [await uid('asha@voltepc.example')])).rows[0].n).toBe(1);
  });

  it('U meet: start a meeting now, invite verified members, chat inside — attendees only', async () => {
    const ravi = await uid('ravi@sunrise.example'), rohit = await uid('rohit@voltepc.example');
    await post('/umeet/instant', { title: 'Quick call', attendeeUserIds: ['00000000-0000-4000-8000-000000000000'] }, t.asha).expect(400); // not a member
    const m = (await post('/umeet/instant', { title: 'Pune order call', attendeeUserIds: [ravi, rohit] }, t.asha).expect(201)).body;
    expect(m.room).toBe(`/meetings/${m.id}/room`);
    const room = (await get(`/meetings/${m.id}`, t.ravi).expect(200)).body;
    expect(room.video.joinable).toBe(true);
    expect(room.attendees.map((a: { name: string }) => a.name).sort()).toEqual(['Asha Patil', 'Ravi Patel', 'Rohit Deshmukh'].sort());
    expect((await pool.query("select count(*)::int n from notifications where user_id = $1 and title = 'Join now: Pune order call'", [ravi])).rows[0].n).toBe(1);
    await post(`/meetings/${m.id}/messages`, { body: 'Joining in a minute' }, t.ravi).expect(201);
    await post(`/meetings/${m.id}/messages`, { body: 'sneaky' }, t.meera).expect(404);
    await get(`/meetings/${m.id}/messages`, t.meera).expect(404);
    const chat = (await get(`/meetings/${m.id}/messages`, t.asha).expect(200)).body.items;
    expect(chat).toEqual([expect.objectContaining({ body: 'Joining in a minute', mine: false })]);
    expect((await get('/umeet/config', t.asha).expect(200)).body).toHaveProperty('provider');
  });
});

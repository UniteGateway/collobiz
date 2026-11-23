/** Wave 3 — the 17 link-only Unite businesses run on COLLABIZ modules: live feeds, item-linked requests, member actions. */
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { CONNECTORS } from '@collabiz/types';
import { api, auth, bootApp, loginAll, resetDatabase, seed } from './helpers';
import { idemKey } from './flows';

describe('Wave 3 connectors', () => {
  let app: INestApplication; let t: Awaited<ReturnType<typeof loginAll>>; let pool: Pool;
  beforeAll(async () => { await resetDatabase(); await seed(); app = await bootApp(); t = await loginAll(app); pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); await app?.close(); });
  const page = async (slug: string) => (await api(app).get(`/v1/public/products/${slug}`).expect(200)).body;
  const base = { kind: 'customer', name: 'Lakshmi Devi', email: 'lakshmi.w3@example.com', phone: '9876512345', city: 'Guntur', message: 'I want to book this for next month, please call me.', consent: true };

  it('every one of the 17 businesses has a live connector on its page', async () => {
    expect(Object.keys(CONNECTORS)).toHaveLength(17);
    for (const slug of Object.keys(CONNECTORS)) {
      const p = await page(slug);
      expect(p.connector).toBeTruthy();
      expect(p.connector.stats.length).toBeGreaterThan(0);
      for (const s of p.connector.stats) expect(typeof s.value).toBe('number');
      expect(p.connector.member.href).toMatch(/^\//);
    }
  });

  it('item feeds show only public facts — never the owner — and counts match the module', async () => {
    const ev = (await page('ev-saathi')).connector;
    const open = (await pool.query("select count(*)::int n from capacity_offers where status = 'open' and type in ('vehicles','workers') and to_date >= current_date")).rows[0].n;
    expect(ev.stats[0].value).toBe(open);
    expect(ev.items.length).toBe(Math.min(open, 8));
    for (const i of ev.items) expect(Object.keys(i).sort()).toEqual(['id', 'subtitle', 'title', 'type']);
    const biofix = (await page('unite-biofix')).connector;
    const confidential = (await pool.query("select id from energy_listings where confidential")).rows.map((r) => r.id);
    for (const i of biofix.items) expect(confidential).not.toContain(i.id);
    const aqua = (await page('unite-aqua')).connector;
    for (const i of aqua.items) expect((await pool.query("select visibility, status from catalog_items where id = $1", [i.id])).rows[0]).toEqual({ visibility: 'public', status: 'published' });
  });

  it('a request about a listed item reaches the business and introduces the item’s owner, without the visitor’s contact details', async () => {
    const ev = (await page('ev-saathi')).connector;
    expect(ev.items.length).toBeGreaterThan(0); // seeded demo capacity
    const item = ev.items[0];
    await api(app).post('/v1/public/products/ev-saathi/enquiries').send({ ...base, itemId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    await api(app).post('/v1/public/products/wakin/enquiries').send({ ...base, itemId: item.id }).expect(400); // not an item feed
    const r = (await api(app).post('/v1/public/products/ev-saathi/enquiries').send({ ...base, itemId: item.id }).expect(201)).body;
    const e = (await pool.query('select details from enquiries where reference = $1', [r.reference])).rows[0];
    expect(e.details.item).toMatchObject({ type: 'capacity', id: item.id, title: item.title });
    const owner = (await pool.query('select org_id from capacity_offers where id = $1', [item.id])).rows[0].org_id;
    const notes = (await pool.query("select n.title, n.body from notifications n join memberships m on m.user_id = n.user_id where m.organization_id = $1 and n.title like 'EV Saathi%'", [owner])).rows;
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) { expect(n.body).not.toContain('lakshmi.w3@example.com'); expect(n.body).not.toContain('9876512345'); expect(n.body).toContain(r.reference); }
  });

  it('WAKIN, VIDPLAY, 99Films and MoveOn post real micro-contracts tagged with their source', async () => {
    const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    for (const source of ['wakin', 'vidplay', '99films', 'moveon-video']) {
      const before = (await page(source)).connector.stats[0].value;
      const job = { source, kind: 'site_survey', state: 'AP', title: `Test job for ${source} page`, scope: 'A clearly described piece of work with an agreed output and date.', acceptance: 'Output delivered as described', quantity: 1, unit: 'job', priceRs: 2500, due: day };
      const m = await api(app).post('/v1/micro').set(auth(t.asha)).set('Idempotency-Key', idemKey(source)).send(job).expect(201);
      expect(m.body.source).toBe(source);
      expect((await page(source)).connector.stats[0].value).toBe(before + 1);
    }
  });

  it('community, meetings, ACTION OS, announcements and Business QR pages show live counts only', async () => {
    for (const slug of ['help-today', 'goodtime-live', 'withme', 'weekend', 'ibrain', 'u-meet', 'nano-bazar']) {
      const c = (await page(slug)).connector;
      expect(c.items).toEqual([]);
    }
    const before = (await page('help-today')).connector.stats[0].value;
    await api(app).post('/v1/community/posts').set(auth(t.asha)).send({ body: 'Who can help with a rooftop structure check in Pune?', topic: 'question' }).expect(201);
    expect((await page('help-today')).connector.stats[0].value).toBe(before + 1);
  });

  it('Unite Biofix: Bio-CNG and green hydrogen register — validated requests, live totals, Industry Club demand counted', async () => {
    const pg = await page('unite-biofix');
    expect(pg.tagline).toBe('Bio-CNG and green hydrogen projects');
    expect(pg.connector.kind).toBe('register');
    const total = (label: string, c = pg.connector) => c.stats.find((s: { label: string }) => s.label.startsWith(label)).value;
    const before = { tpd: total('Feedstock offered'), buyers: total('Buyers') };
    const send = (b: object) => api(app).post('/v1/public/products/unite-biofix/enquiries').send({ ...base, ...b });
    await send({ intent: 'feedstock', feedstock: 'Sugarcane press mud' }).expect(400); // quantity needed
    await send({ intent: 'feedstock', quantity: 40 }).expect(400); // feedstock type needed
    await send({ intent: 'teleport', quantity: 1 }).expect(400);
    await api(app).post('/v1/public/products/ev-saathi/enquiries').send({ ...base, intent: 'feedstock', quantity: 5 }).expect(400); // not a Biofix page
    const r = (await send({ intent: 'feedstock', quantity: 40, feedstock: 'Sugarcane press mud', state: 'Telangana' }).expect(201)).body;
    const e = (await pool.query('select details from enquiries where reference = $1', [r.reference])).rows[0];
    expect(e.details.request).toEqual({ intent: 'feedstock', intentLabel: 'Supply feedstock', quantity: 40, unit: 'tonnes a day', feedstock: 'Sugarcane press mud', state: 'Telangana' });
    await send({ intent: 'offtake_h2', quantity: 500 }).expect(201);
    // An Industry Club member asking for Bio-CNG counts as demand too
    await api(app).post('/v1/club/power-requests').set(auth(t.ravi)).send({ need: 'bio_cng', state: 'Gujarat', city: 'Ahmedabad', monthlyUnits: 1000, note: 'Bio-CNG for 12 delivery vans' }).expect(201);
    const after = (await page('unite-biofix')).connector;
    expect(total('Feedstock offered', after)).toBe(before.tpd + 40);
    expect(total('Buyers', after)).toBe(before.buyers + 2);
  });
});


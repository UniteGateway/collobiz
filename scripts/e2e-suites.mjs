/** UI smoke suites, appended stage by stage. Each suite drives real UI → API → DB paths. */
const suites = [
  {
    name: 'Stage 01 · 001 homepage renders brand and CTAs',
    run: async ({ page, WEB, expect, shot }) => {
      await page.goto(WEB + '/');
      await page.getByRole('heading', { level: 1 }).waitFor();
      expect(await page.locator('[data-screen="001"]').count() === 1, 'screen 001 marker missing');
      expect(await page.getByRole('link', { name: 'Join as a partner' }).count() > 0, 'join CTA missing');
      await shot('001-home');
    },
  },
  {
    name: 'Stage 01 · 002/003/007 content pages',
    run: async ({ page, WEB, expect }) => {
      for (const [path, id] of [['/about', '002'], ['/how-it-works', '003'], ['/membership', '007']]) {
        await page.goto(WEB + path);
        expect(await page.locator(`[data-screen="${id}"]`).count() === 1, `${path} missing screen ${id}`);
      }
    },
  },
  {
    name: 'Stage 01 · 010 contact form validates then submits',
    run: async ({ page, WEB, expect, shot }) => {
      await page.goto(WEB + '/support/contact');
      await page.getByRole('button', { name: 'Send enquiry' }).click();
      await page.getByText('Please enter your name').waitFor();
      await page.getByLabel('Your name').fill('Meera Shah');
      await page.getByLabel('Work email').fill('meera@sunrise-epc.example');
      await page.getByLabel('Message').fill('We install 2 MW of rooftop solar a year and want to partner.');
      await page.getByLabel(/I agree/).check();
      await page.getByRole('button', { name: 'Send enquiry' }).click();
      const ref = await page.locator('.cz-alert-success .cz-mono').textContent({ timeout: 10000 });
      expect(/^ENQ-\d{4}-\d{6}$/.test(ref ?? ''), `bad reference ${ref}`);
      await shot('010-contact');
    },
  },
  {
    name: 'Stage 01 · registry lists 165 screens',
    run: async ({ page, WEB, expect }) => {
      await page.goto(WEB + '/registry');
      await page.locator('table tbody tr').first().waitFor();
      const n = await page.locator('table tbody tr').count();
      expect(n === 165, `expected 165 rows, got ${n}`);
    },
  },
  {
    name: 'Stage 01 · admin status page reports API health',
    run: async ({ page, ADMIN, expect }) => {
      await page.goto(ADMIN + '/status');
      await page.getByText('database').waitFor({ timeout: 10000 });
      expect((await page.locator('[data-status="ok"]').count()) >= 1, 'database not ok');
    },
  },
];
export default suites;

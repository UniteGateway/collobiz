import type { INestApplication } from '@nestjs/common';
import { createServer, type Server, type Socket } from 'node:net';
import { Pool } from 'pg';
import { api, auth, bootApp, login, resetDatabase, seed } from './helpers';
import { MailService } from '../src/common/adapters';
import { resetConfigForTests } from '../src/config';

/** Minimal SMTP server: accepts every message and records recipients and bodies. */
function fakeSmtp(port: number, inbox: { to: string[]; data: string }[]) {
  const server = createServer((sock: Socket) => {
    let to: string[] = []; let data = ''; let inData = false; let buf = '';
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('latin1');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; inbox.push({ to, data }); to = []; data = ''; sock.write('250 queued\r\n'); } else data += line + '\n';
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250 fake\r\n');
        else if (cmd === 'MAIL') sock.write('250 ok\r\n');
        else if (cmd === 'RCPT') { to.push(line.replace(/^.*<(.*)>.*$/, '$1')); sock.write('250 ok\r\n'); }
        else if (cmd === 'DATA') { inData = true; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 ok\r\n');
      }
    });
    sock.on('error', () => undefined);
  });
  return new Promise<Server>((res) => server.listen(port, '127.0.0.1', () => res(server)));
}

describe('E-mail delivery over SMTP (MAIL_DRIVER=smtp)', () => {
  const PORT = 2525 + Math.floor(Math.random() * 1000);
  const inbox: { to: string[]; data: string }[] = [];
  let server: Server | null;
  let app: INestApplication;
  let mail: MailService;
  let pool: Pool;
  const saved = { ...process.env };
  beforeAll(async () => {
    Object.assign(process.env, { MAIL_DRIVER: 'smtp', SMTP_URL: `smtp://127.0.0.1:${PORT}`, MAIL_FROM: 'COLLABIZ Pilot <no-reply@pilot.example>' });
    resetConfigForTests();
    await resetDatabase(); await seed();
    server = await fakeSmtp(PORT, inbox);
    app = await bootApp(); mail = app.get(MailService); pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => { await pool?.end(); await app?.close(); server?.close(); process.env = saved; resetConfigForTests(); });

  it('delivers e-mail immediately with the configured sender, and records it as sent', async () => {
    const m = await mail.send('email', 'asha@voltepc.example', 'Your COLLABIZ verification code', 'Your verification code is 123456.');
    expect(m.status).toBe('sent');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].to).toEqual(['asha@voltepc.example']);
    expect(inbox[0].data).toMatch(/From: COLLABIZ Pilot <no-reply@pilot\.example>/);
    expect(inbox[0].data).toMatch(/123456/);
  });

  it('keeps internal routing addresses as records only', async () => {
    const m = await mail.send('email', 'catalog-owner:1234', 'Price request', 'Quantity: 5');
    expect(m.status).toBe('skipped');
    expect(inbox).toHaveLength(1);
  });

  it('a failed send stays pending and is delivered by the retry; after five failures it is marked failed', async () => {
    await new Promise<void>((r) => server!.close(() => r())); server = null;
    const m = await mail.send('email', 'ravi@sunrise.example', 'You have been invited to COLLABIZ', 'Accept your invitation');
    expect(m).toMatchObject({ status: 'pending', attempts: 1 });
    server = await fakeSmtp(PORT, inbox);
    expect(await mail.dispatchPending()).toBe(1);
    const row = (await pool.query('select status, attempts from outbox_messages where id = $1', [m.id])).rows[0];
    expect(row).toEqual({ status: 'sent', attempts: 2 });
    expect(inbox.at(-1)!.to).toEqual(['ravi@sunrise.example']);
    // Five failures → failed, and no longer retried.
    await new Promise<void>((r) => server!.close(() => r())); server = null;
    const bad = await mail.send('email', 'meera@consult.example', 'Subject', 'Body');
    for (let i = 0; i < 6; i++) await mail.dispatchPending();
    expect((await pool.query('select status, attempts from outbox_messages where id = $1', [bad.id])).rows[0]).toEqual({ status: 'failed', attempts: 5 });
  });

  it('a partner asking for a verification code gets it by e-mail', async () => {
    server = server ?? await fakeSmtp(PORT, inbox);
    const token = await login(app, 'deepak@deccan.example');
    const r = await api(app).post('/v1/auth/otp/send').set(auth(token)).send({ channel: 'email' }).expect(200);
    const last = inbox.at(-1)!;
    expect(last.to).toEqual(['deepak@deccan.example']);
    expect(last.data).toContain(`Your verification code is ${r.body.devOtp}`); // devOtp is only returned in tests
  });
});

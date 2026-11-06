import { hashPassword, verifyPassword, encryptField, decryptField, signJwt, verifyJwt, totp, verifyTotp, base32Encode, base32Decode, signDownload, verifyDownload, newTotpSecret, canonicalJson, sha256 } from './crypto';

describe('crypto utilities', () => {
  it('hashes and verifies passwords', async () => {
    const h = await hashPassword('Correct horse 1');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Correct horse 1', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
  it('encrypts fields with authenticated encryption', () => {
    const c = encryptField('123456789012');
    expect(c).not.toContain('123456789012');
    expect(decryptField(c)).toBe('123456789012');
    const tampered = c.slice(0, -2) + (c.endsWith('A') ? 'B' : 'A') + '=';
    expect(() => decryptField(tampered)).toThrow();
  });
  it('signs and verifies JWT, rejecting tampering and expiry', () => {
    const t = signJwt({ sub: 'u1', typ: 'access' }, 'secret-secret-secret', 60);
    expect(verifyJwt<{ sub: string }>(t, 'secret-secret-secret')?.sub).toBe('u1');
    expect(verifyJwt(t, 'other-secret-secret')).toBeNull();
    const [h, , s] = t.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'admin', exp: 9e9 })).toString('base64url')}.${s}`;
    expect(verifyJwt(forged, 'secret-secret-secret')).toBeNull();
    expect(verifyJwt(signJwt({ sub: 'u' }, 'secret-secret-secret', -10), 'secret-secret-secret')).toBeNull();
  });
  it('implements RFC 6238 TOTP (test vector)', () => {
    // RFC 6238 SHA-1 secret "12345678901234567890" at T=59s → 94287082 (8 digits) → last 6 = 287082
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    expect(totp(secret, 59_000)).toBe('287082');
    const s2 = newTotpSecret();
    expect(verifyTotp(s2, totp(s2))).toBe(true);
    expect(verifyTotp(s2, totp(s2, Date.now() - 120_000))).toBe(false);
  });
  it('signed download URLs expire and bind to key', () => {
    const { expires, sig } = signDownload('kyb/abc', 60);
    expect(verifyDownload('kyb/abc', expires, sig)).toBe(true);
    expect(verifyDownload('kyb/other', expires, sig)).toBe(false);
    expect(verifyDownload('kyb/abc', Math.floor(Date.now() / 1000) - 1, sig)).toBe(false);
  });
});

describe('canonicalJson (hash input)', () => {
  it('is independent of key order at every depth and covers nested values', () => {
    const a = { b: 1, a: { y: [2, { q: 1, p: 2 }], x: 'k' } };
    const b = { a: { x: 'k', y: [2, { p: 2, q: 1 }] }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    // Regression: nested values must change the output (an array replacer used to drop nested keys)
    const lead1 = { customer: { legalName: 'Shakti Polymers', taxId: 'X1' }, consent: { method: 'email' } };
    const lead2 = { customer: { legalName: 'Different Buyer', taxId: 'X2' }, consent: { method: 'email' } };
    expect(sha256(canonicalJson(lead1))).not.toBe(sha256(canonicalJson(lead2)));
    expect(JSON.stringify(lead1, Object.keys(lead1).sort())).toBe(JSON.stringify(lead2, Object.keys(lead2).sort())); // the old, broken form
  });
});

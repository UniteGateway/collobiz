'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Alert, Button, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

/** TOTP enrolment: setup → scan QR (or type key) → confirm code. Shared by web (145) and admin. */
export function MfaEnrol({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const start = useMutation(async () => {
    const s = await api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup');
    setSetup(s);
    return s;
  });
  const enable = useMutation(async () => {
    await api.post('/auth/mfa/enable', { code });
    onDone();
    return true;
  });
  useEffect(() => {
    if (setup) QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 200, color: { dark: '#011E48' } }).then(setQr).catch(() => setQr(null));
  }, [setup]);
  if (!setup) {
    return (
      <div>
        {start.error && <Alert tone="danger">{start.error}</Alert>}
        <p>Protect your account with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
        <Button onClick={() => start.run()} loading={start.pending}>Set up authenticator app</Button>
      </div>
    );
  }
  return (
    <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
      <div>
        {qr ? <img src={qr} alt="QR code for your authenticator app" width={200} height={200} /> : null}
        <p className="cz-muted" style={{ fontSize: 13 }}>Can’t scan? Enter this key manually:</p>
        <p className="cz-mono" data-testid="mfa-secret" style={{ wordBreak: 'break-all' }}>{setup.secret}</p>
      </div>
      <form noValidate onSubmit={(e) => { e.preventDefault(); enable.run(); }}>
        {enable.error && <Alert tone="danger">{enable.error}</Alert>}
        <TextInput label="6-digit code from the app" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={enable.fieldErrors.code} />
        <Button type="submit" loading={enable.pending} disabled={code.length !== 6}>Confirm and enable MFA</Button>
      </form>
    </div>
  );
}

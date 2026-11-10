'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, LoadingState, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface W { optIn: boolean; number: string; kinds: string[]; optInAt: string | null; consentText: string; templates: { key: string; label: string; sample: string }[]; connected: boolean; note: string }

/** WhatsApp updates — opt in with a recorded consent; messages start only once a WhatsApp Business account is connected. */
export function WhatsappPrefs() {
  const q = useQuery<W>('/me/whatsapp');
  const [f, setF] = useState({ number: '', kinds: [] as string[], agree: false });
  useEffect(() => { if (q.data) setF({ number: q.data.number, kinds: q.data.kinds.length ? q.data.kinds : ['payment', 'approval'], agree: q.data.optIn }); }, [q.data]);
  const save = useMutation(async (optIn: boolean) => { const r = await api.put<W>('/me/whatsapp', optIn ? { optIn, number: f.number, kinds: f.kinds } : { optIn }); q.reload(); return r; });
  const w = q.data;
  return (
    <Card title="WhatsApp updates">
      {!w ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 6 }} data-whatsapp={w.optIn ? 'on' : 'off'}>
          {!w.connected && <Alert tone="info">WhatsApp sending is not connected yet — your choice is saved and messages start once it is. {w.note}</Alert>}
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          {w.optIn && <Alert tone="success">Opted in for {w.number.replace(/^(\d{2})\d{4}/, '$1••••')} on {new Date(w.optInAt!).toLocaleDateString('en-IN')}.</Alert>}
          <div style={{ maxWidth: 320 }}><TextInput label="WhatsApp number" inputMode="tel" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} error={save.fieldErrors.number} hint="Indian mobile, 10 digits" /></div>
          {w.templates.map((t) => (
            <Checkbox key={t.key} label={`${t.label} — e.g. “${t.sample}”`} checked={f.kinds.includes(t.key)} onChange={(e) => setF({ ...f, kinds: e.target.checked ? [...f.kinds, t.key] : f.kinds.filter((k) => k !== t.key) })} />
          ))}
          <Checkbox label={w.consentText} checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} />
          <div className="cz-row" style={{ gap: 8 }}>
            <Button onClick={() => save.run(true)} loading={save.pending} disabled={!f.agree || !f.kinds.length || !f.number}>{w.optIn ? 'Update' : 'Turn on WhatsApp updates'}</Button>
            {w.optIn && <Button variant="ghost" onClick={() => save.run(false)}>Stop WhatsApp updates</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}

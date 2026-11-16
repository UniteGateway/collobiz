'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ActionPreferences } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, Select, Skeleton, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { appLabel } from '@/components/ActionOS';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Ch { ready: boolean; text: string; consent?: boolean }
interface R { prefs: ActionPreferences; channels: Record<'inapp' | 'push' | 'email' | 'whatsapp', Ch>; modules: string[]; organizations: { id: string; name: string }[] }
const DAYS = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['7', 'Sunday']];
const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Africa/Nairobi', 'Africa/Lagos', 'Australia/Sydney', 'UTC'];

/** Schedule, channels, quiet hours and scope for ACTION OS. */
export default function ActionSettings() {
  const q = useQuery<R>('/action-os/preferences');
  const [p, setP] = useState<ActionPreferences | null>(null);
  const [saved, setSaved] = useState('');
  useEffect(() => { if (q.data) setP(q.data.prefs); }, [q.data]);
  const save = useMutation(async () => { await api.request('PATCH', '/action-os/preferences', p); setSaved('Saved.'); q.reload(); return true; });
  const test = useMutation(async () => { const r = await api.post<{ results: { channel: string; status: string; detail: string | null }[] }>('/action-os/notifications/test'); setSaved(r.results.map((x) => `${x.channel}: ${x.status.replace('_', ' ')}`).join(' · ')); return true; });
  if (q.error) return <Screen page={{ key: 'action-os-settings', title: 'Schedule & channels', access: 'partner' }}><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  if (!p || !q.data) return <Screen page={{ key: 'action-os-settings', title: 'Schedule & channels', access: 'partner' }}><Skeleton height={300} /></Screen>;
  const ch = q.data.channels;
  const set = (patch: Partial<ActionPreferences>) => { setSaved(''); setP({ ...p, ...patch }); };
  const toggle = (k: 'push' | 'email' | 'whatsapp', v: boolean) => set({ channels: { ...p.channels, [k]: v } });
  const list = (xs: string[], x: string, on: boolean) => (on ? [...xs, x] : xs.filter((y) => y !== x));
  return (
    <Screen page={{ key: 'action-os-settings', title: 'Schedule & channels', access: 'partner' }} eyebrow="COLLABIZ ACTION OS" description="When your plans arrive, where, and which businesses and apps they cover."
      actions={<div className="cz-row" style={{ gap: 8 }}><Button variant="secondary" onClick={() => test.run()} loading={test.pending}>Send a test</Button><Button onClick={() => save.run()} loading={save.pending}>Save</Button></div>}>
      {save.error && <Alert tone="danger">{save.error}</Alert>}{test.error && <Alert tone="danger">{test.error}</Alert>}
      {saved && <Alert tone="success">{saved}</Alert>}
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <Card title="Schedule">
          <div className="cz-stack" style={{ gap: 10 }}>
            <Checkbox label="Weekly action plan" checked={p.weeklyEnabled} onChange={(e) => set({ weeklyEnabled: e.target.checked })} />
            <div className="cz-grid cz-grid-2"><Select label="Day" value={String(p.weeklyDay)} onChange={(e) => set({ weeklyDay: Number(e.target.value) })} options={DAYS.map(([value, label]) => ({ value, label }))} /><TextInput label="Time" type="time" value={p.weeklyTime} onChange={(e) => set({ weeklyTime: e.target.value })} /></div>
            <Checkbox label="Daily morning brief" checked={p.dailyEnabled} onChange={(e) => set({ dailyEnabled: e.target.checked })} />
            <TextInput label="Daily brief time" type="time" value={p.dailyTime} onChange={(e) => set({ dailyTime: e.target.value })} disabled={!p.dailyEnabled} />
            <Select label="Time zone" value={p.timeZone} onChange={(e) => set({ timeZone: e.target.value })} options={[...new Set([p.timeZone, ...ZONES])].map((z) => ({ value: z, label: z.replace('_', ' ') }))} />
            <div className="cz-grid cz-grid-2"><TextInput label="Quiet hours from" type="time" value={p.quietStart} onChange={(e) => set({ quietStart: e.target.value })} /><TextInput label="Quiet hours until" type="time" value={p.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} /></div>
            <div className="cz-grid cz-grid-2"><TextInput label="Top priorities in a plan" type="number" min={3} max={15} value={p.maxPriorities} onChange={(e) => set({ maxPriorities: Number(e.target.value) })} /><Select label="Detail" value={p.detail} onChange={(e) => set({ detail: e.target.value as ActionPreferences['detail'] })} options={[{ value: 'brief', label: 'Brief' }, { value: 'standard', label: 'Standard' }, { value: 'detailed', label: 'Detailed' }]} /></div>
          </div>
        </Card>
        <Card title="Channels" subtitle="Nothing is reported as delivered unless a provider confirms it.">
          <ul className="cz-aos-ch">
            <li><Checkbox label="Notice board and inbox" checked disabled onChange={() => undefined} /><span className="cz-ok">{ch.inapp.text}</span></li>
            <li><Checkbox label="Mobile push" checked={p.channels.push} onChange={(e) => toggle('push', e.target.checked)} /><span className={ch.push.ready ? 'cz-ok' : 'cz-warn'}>{ch.push.text}</span></li>
            <li><Checkbox label="E-mail digest" checked={p.channels.email} onChange={(e) => toggle('email', e.target.checked)} /><span className={ch.email.ready ? 'cz-ok' : 'cz-warn'}>{ch.email.text}</span></li>
            <li><Checkbox label="WhatsApp summary (approved templates only)" checked={p.channels.whatsapp} disabled={!ch.whatsapp.consent && !p.channels.whatsapp} onChange={(e) => toggle('whatsapp', e.target.checked)} /><span className={ch.whatsapp.ready ? 'cz-ok' : 'cz-warn'}>{ch.whatsapp.text} {!ch.whatsapp.consent && <Link href="/profile">Opt in with your number</Link>}</span></li>
          </ul>
          <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>WhatsApp and push carry titles only — never amounts, customer or bank details. Confidential items show as “a confidential item needs attention”.</p>
        </Card>
        <Card title="Businesses" subtitle="Leave all unticked to include every business you belong to.">
          {q.data.organizations.map((o) => <Checkbox key={o.id} label={o.name} checked={p.orgIds.includes(o.id)} onChange={(e) => set({ orgIds: list(p.orgIds, o.id, e.target.checked) })} />)}
        </Card>
        <Card title="Apps" subtitle="Leave all unticked to include every app.">
          {q.data.modules.map((m) => <Checkbox key={m} label={appLabel(m)} checked={p.modules.includes(m)} onChange={(e) => set({ modules: list(p.modules, m, e.target.checked) })} />)}
        </Card>
      </div>
    </Screen>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, ChipSelect, DescriptionList, LoadingState, Select, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Screen 133 — Priority Review SLA Configuration (business calendars, holidays, auto-release policy). */
export default function SlaConfig() {
  const { me } = useSession();
  const canEdit = me?.capabilities.includes('routing.configure');
  const list = useQuery<any[]>('/admin/routing/sla');
  const [sel, setSel] = useState('');
  const cur = list.data?.find((g) => g.organizationId === (sel || list.data?.[0]?.organizationId));
  const [f, setF] = useState<any>(null);
  const [holiday, setHoliday] = useState('');
  useEffect(() => { if (cur) setF({ hours: String(cur.slaMinutes / 60), ...cur.calendar, autoReleaseOnBreach: cur.autoReleaseOnBreach }); }, [cur?.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps
  const cal = f && { timezone: f.timezone, workdays: f.workdays, startHour: Number(f.startHour), endHour: Number(f.endHour), holidays: f.holidays };
  const [due, setDue] = useState<string | null>(null);
  const save = useMutation(async () => { await api.put(`/admin/routing/sla/${cur.organizationId}`, { slaMinutes: Math.round(Number(f.hours) * 60), calendar: cal, autoReleaseOnBreach: f.autoReleaseOnBreach }); list.reload(); return true; });
  const prev = useMutation(async () => { const r = await api.post<any>('/admin/routing/sla/preview', { slaMinutes: Math.round(Number(f.hours) * 60), calendar: cal }); setDue(r.dueAt); return r; });
  if (list.loading) return <Screen id="133"><LoadingState /></Screen>;
  if (list.error) return <Screen id="133"><ApiErrorView error={list.error} onRetry={list.reload} /></Screen>;
  return (
    <Screen id="133" description="The first-review window is a configurable service target (default 4 business hours), not a guaranteed entitlement. Breaches escalate first; auto-release happens only if enabled and the buyer consented to sharing.">
      {!canEdit && <Alert tone="info">Read-only: only the group super admin can change SLA policy.</Alert>}
      <Select label="Group company" value={sel || cur?.organizationId} onChange={(e) => setSel(e.target.value)} options={(list.data ?? []).map((g) => ({ value: g.organizationId, label: g.brandName }))} />
      {f && (
        <Card title={cur.brandName}>
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          {save.data && <Alert tone="success">Policy saved.</Alert>}
          <div className="cz-grid cz-grid-4">
            <TextInput label="Review window (business hours)" inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} disabled={!canEdit} />
            <TextInput label="Time zone (IANA)" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} error={save.fieldErrors['calendar.timezone']} disabled={!canEdit} />
            <TextInput label="Opens (hour)" inputMode="numeric" value={String(f.startHour)} onChange={(e) => setF({ ...f, startHour: e.target.value })} disabled={!canEdit} />
            <TextInput label="Closes (hour)" inputMode="numeric" value={String(f.endHour)} onChange={(e) => setF({ ...f, endHour: e.target.value })} error={save.fieldErrors['calendar.endHour']} disabled={!canEdit} />
          </div>
          <ChipSelect legend="Working days" value={f.workdays.map(String)} onChange={(v) => canEdit && setF({ ...f, workdays: v.map(Number).sort() })} options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />
          <div className="cz-row" style={{ alignItems: 'flex-end' }}>
            <TextInput label="Add holiday" type="date" value={holiday} onChange={(e) => setHoliday(e.target.value)} disabled={!canEdit} />
            <Button variant="secondary" onClick={() => { if (holiday && !f.holidays.includes(holiday)) setF({ ...f, holidays: [...f.holidays, holiday].sort() }); setHoliday(''); }} disabled={!canEdit}>Add</Button>
          </div>
          <p>{f.holidays.length ? f.holidays.map((h: string) => <button key={h} className="cz-chip" onClick={() => canEdit && setF({ ...f, holidays: f.holidays.filter((x: string) => x !== h) })} aria-label={`Remove holiday ${h}`}>{h} ✕</button>) : <span className="cz-muted">No holidays configured</span>}</p>
          <Checkbox label="Auto-release to approved partners after escalation (only where buyer consent allows)" checked={f.autoReleaseOnBreach} onChange={(e) => setF({ ...f, autoReleaseOnBreach: e.target.checked })} disabled={!canEdit} />
          <div className="cz-row" style={{ marginTop: 12 }}>
            {canEdit && <Button onClick={() => save.run()} loading={save.pending}>Save policy</Button>}
            <Button variant="secondary" onClick={() => prev.run()} loading={prev.pending}>Preview: a lead submitted now is due…</Button>
          </div>
          {due && <DescriptionList items={[['Due', new Date(due).toLocaleString('en-IN', { timeZone: f.timezone })], ['Time zone', f.timezone]]} />}
        </Card>
      )}
    </Screen>
  );
}

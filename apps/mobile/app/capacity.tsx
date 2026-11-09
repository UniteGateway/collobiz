import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { LOOKING_FOR, LOOKING_FOR_LABELS } from '@collabiz/types';
import { Button, Chips, ErrorView, Field, Loading, Notice, ScreenView, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface Capacity { hasOffice: boolean; officeLocations: string[]; totalManpower: number; idleManpower: number; idleSkills: string[]; lookingFor: string[]; notes: string | null }
const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

/** Your capacity (native): offices, free people and the work you want — used to choose who receives direct offers. */
export default function CapacityScreen() {
  const q = useApi<Capacity>('/me/capacity');
  const [f, setF] = useState({ hasOffice: false, offices: '', total: '', idle: '', skills: '', lookingFor: [] as string[] });
  const [saved, setSaved] = useState(false);
  useEffect(() => { const c = q.data; if (c) setF({ hasOffice: c.hasOffice, offices: c.officeLocations.join(', '), total: String(c.totalManpower), idle: String(c.idleManpower), skills: c.idleSkills.join(', '), lookingFor: c.lookingFor }); }, [q.data]);
  const save = useAction(async () => {
    setSaved(false);
    await api.put('/me/capacity', { hasOffice: f.hasOffice, officeLocations: f.hasOffice ? list(f.offices) : [], totalManpower: Number(f.total || 0), idleManpower: Number(f.idle || 0), idleSkills: list(f.skills), lookingFor: f.lookingFor });
    setSaved(true); await q.reload();
  });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView title="Your capacity" subtitle="Unite Group uses this to choose who receives direct offers. Other partners never see it."
      footer={<Button title="Save capacity" onPress={() => save.run()} loading={save.busy} testID="save-capacity" />}>
      {saved && <Notice tone="success">Saved.</Notice>}
      {save.error && <Notice tone="danger">{save.error}</Notice>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <Switch value={f.hasOffice} onValueChange={(v) => setF({ ...f, hasOffice: v })} trackColor={{ true: theme.colors.green500, false: theme.colors.grey300 }} accessibilityLabel="We have an office or setup" />
        <Text style={[s.p, { flex: 1, marginBottom: 0 }]}>We have an office, warehouse or setup</Text>
      </View>
      {f.hasOffice && <Field label="Locations (comma-separated)" value={f.offices} onChangeText={(v) => setF({ ...f, offices: v })} error={save.fieldErrors.officeLocations} />}
      <Field label="Total team" value={f.total} onChangeText={(v) => setF({ ...f, total: v.replace(/\D/g, '') })} keyboardType="number-pad" error={save.fieldErrors.totalManpower} />
      <Field label="People free now" value={f.idle} onChangeText={(v) => setF({ ...f, idle: v.replace(/\D/g, '') })} keyboardType="number-pad" error={save.fieldErrors.idleManpower} />
      <Field label="Skills of the free people (comma-separated)" value={f.skills} onChangeText={(v) => setF({ ...f, skills: v })} />
      <Text style={s.label}>What you are looking for</Text>
      <Chips value={f.lookingFor} onChange={(lookingFor) => setF({ ...f, lookingFor })} options={LOOKING_FOR.map((k) => ({ value: k, label: LOOKING_FOR_LABELS[k] }))} />
    </ScreenView>
  );
}

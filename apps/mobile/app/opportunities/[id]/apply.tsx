import { useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { newIdempotencyKey } from '@collabiz/types';
import { Button, Field, Notice, ScreenView } from '@/components/ui';
import { api } from '@/api';
import { toMinor, useAction } from '@/hooks';

/** Screen 042 — Apply / Express Interest (native, atlas mobile-first). Idempotent submission. */
export default function Apply() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const key = useMemo(newIdempotencyKey, []);
  const [message, setMessage] = useState('');
  const [value, setValue] = useState('');
  const a = useAction(async () => { await api.request('POST', `/opportunities/${id}/apply`, { message, proposedValue: toMinor(value) }, { idempotencyKey: key }); router.back(); });
  return (
    <ScreenView id="042" footer={<Button title="Submit application" variant="accent" onPress={() => a.run()} loading={a.busy} testID="apply-submit" />}>
      <Stack.Screen options={{ title: 'Apply' }} />
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <Field label="Why your organization?" value={message} onChangeText={setMessage} multiline error={a.fieldErrors.message} />
      <Field label="Indicative value ₹ (optional)" value={value} onChangeText={setValue} keyboardType="decimal-pad" hint="Non-binding" />
    </ScreenView>
  );
}

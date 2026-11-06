import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { KYB_DOC_TYPES } from '@collabiz/types';
import { Badge, Button, Card, Chips, Empty, ErrorView, Loading, Notice, Row, ScreenView, s } from '@/components/ui';
import { api, API_URL } from '@/api';
import { useAction, useApi } from '@/hooks';

const LABEL: Record<string, string> = { pan: 'PAN', gst_certificate: 'GST certificate', incorporation_certificate: 'Incorporation', address_proof: 'Address proof', identity_proof: 'Identity proof', bank_proof: 'Bank proof', msme_certificate: 'MSME', other: 'Other' };

/** Screen 019 — KYC / KYB Document Upload (native: camera roll or files). */
export default function Kyc() {
  const router = useRouter();
  const docs = useApi<any[]>('/onboarding/kyb/documents');
  const status = useApi<any>('/onboarding/status');
  const [docType, setDocType] = useState<string[]>(['pan']);
  const [msg, setMsg] = useState<string | null>(null);
  const up = useAction(async () => {
    const pick = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
    if (pick.canceled) return;
    const f = pick.assets[0];
    const fd = new FormData();
    fd.append('docType', docType[0]);
    fd.append('file', { uri: f.uri, name: f.name, type: f.mimeType ?? 'application/pdf' } as unknown as Blob);
    await api.upload('/onboarding/kyb/documents', fd);
    setMsg(`${LABEL[docType[0]]} uploaded`);
    docs.reload(); status.reload();
  });
  const open = useAction(async (id: string) => { const r = await api.get<{ url: string }>(`/onboarding/kyb/documents/${id}/url`); await Linking.openURL(API_URL + r.url); });
  const missing: string[] = status.data?.missingDocs ?? [];
  return (
    <ScreenView id="019" footer={<Button title="Continue" onPress={() => router.push('/onboarding/bank-tax')} disabled={missing.length > 0} />}>
      <Stack.Screen options={{ title: 'KYC / KYB documents' }} />
      {missing.length > 0 && <Notice tone="warning">Still required: {missing.map((m) => LABEL[m]).join(', ')}</Notice>}
      {msg && <Notice tone="success">{msg}</Notice>}
      {(up.error || open.error) && <Notice tone="danger">{up.error ?? open.error}</Notice>}
      <Text style={s.label}>Document type</Text>
      <Chips value={docType} onChange={(v) => setDocType(v.slice(-1))} options={KYB_DOC_TYPES.map((d) => ({ value: d, label: LABEL[d] }))} />
      <Button title="Choose file and upload" onPress={() => up.run()} loading={up.busy} />
      <Card title="Uploaded">
        {docs.loading ? <Loading /> : docs.error ? <ErrorView error={docs.error} onRetry={docs.reload} /> : !docs.data?.length ? <Empty title="No documents yet" /> :
          docs.data.map((d) => <Row key={d.id} title={LABEL[d.docType] ?? d.docType} subtitle={d.reviewNote ? `${d.fileName} · ${d.reviewNote}` : d.fileName} right={<Badge status={d.status} />} onPress={() => open.run(d.id)} />)}
      </Card>
    </ScreenView>
  );
}

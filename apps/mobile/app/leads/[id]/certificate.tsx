import { Image, Share, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, ErrorView, Loading, Row, ScreenView, s } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 051 — Protected Lead Ownership Certificate (native; shareable verification code). */
export default function Certificate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<any>(`/leads/${id}`);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const { claim, opportunity: o, customer } = q.data;
  return (
    <ScreenView id="051">
      <Stack.Screen options={{ title: 'Certificate' }} />
      <Card>
        <Image source={require('../../../assets/logo.png')} style={{ width: 200, height: 48 }} resizeMode="contain" accessibilityLabel="COLLABIZ" />
        <Text style={[s.h2, { marginTop: 12 }]}>Protected Lead Ownership Certificate</Text>
        <Badge status={claim.status} />
        <Row title="Certificate no." subtitle={claim.certificateCode} />
        <Row title="Opportunity" subtitle={`${o.code} — ${o.title}`} />
        <Row title="Customer" subtitle={customer.legalName} />
        <Row title="Protected until" subtitle={claim.protectedUntil ? new Date(claim.protectedUntil).toLocaleDateString() : '—'} />
        <Row title="Evidence hash" subtitle={claim.evidenceHash} />
        <Text style={[s.hint, { marginTop: 8 }]}>Conditional protection; not a guarantee of award or payment.</Text>
      </Card>
      <Button title="Share verification code" variant="secondary" onPress={() => Share.share({ message: `COLLABIZ lead certificate ${claim.certificateCode} — verify at /verify-certificate?code=${claim.certificateCode}` })} />
    </ScreenView>
  );
}

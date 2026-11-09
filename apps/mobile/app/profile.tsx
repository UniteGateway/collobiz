import { Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { certLabel, levelLabel, PARTNER_TYPE_LABELS, regionLabel, sectorName } from '@collabiz/types';
import { Badge, Button, Card, ErrorView, Loading, Row, ScreenView, money, s } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 143 — My Partner Profile (native, atlas mobile-first). */
export default function MyProfile() {
  const router = useRouter();
  const q = useApi<any>('/profile');
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const { organization: o, profile: p, bankTax: b } = q.data;
  return (
    <ScreenView id="143" title={o.displayName}>
      <Stack.Screen options={{ title: 'My profile' }} />
      <Card><Badge status={o.verificationStatus} /><Text style={[s.hint, { marginTop: 6 }]}>{levelLabel(o.membershipLevel)}{o.partnerTypes.length ? ` · ${o.partnerTypes.map((t: string) => PARTNER_TYPE_LABELS[t] ?? t).join(', ')}` : ''}</Text></Card>
      <Card title="About">{p.headline && <Text style={[s.p, { fontWeight: '600' }]}>{p.headline}</Text>}<Text style={s.p}>{p.about ?? 'No description yet.'}</Text></Card>
      <Card title="Capabilities">
        <Row title="Sectors" subtitle={p.sectors.map(sectorName).join(', ') || '—'} />
        <Row title="Skills" subtitle={p.skills.join(', ') || '—'} />
        <Row title="Certifications" subtitle={p.certifications.map(certLabel).join(', ') || '—'} />
        <Row title="Coverage" subtitle={p.regions.map(regionLabel).join(', ') || '—'} />
        <Row title="Largest project you take on" subtitle={p.capacityMax ? money(p.capacityMax) : 'Not stated'} />
      </Card>
      {b && <Card title="Bank & tax"><Text style={s.p}>{b.bankName} {b.accountMasked}</Text><Badge status={b.verified ? 'verified' : 'pending'} /></Card>}
      <Button title="Edit profile" variant="secondary" onPress={() => router.push('/onboarding/profile')} />
      <Button title="Verification status" variant="secondary" onPress={() => router.push('/onboarding/status')} />
    </ScreenView>
  );
}

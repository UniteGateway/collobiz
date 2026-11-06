import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Redirect, Stack, useRouter } from 'expo-router';
import { Badge, Button, Card, Kpi, Loading, Notice, Row, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useSession } from '@/session';

interface Activity { id: string; at: string; action: string; actorName: string | null }

/** Screen 023 — Partner Home Dashboard (native). Stage 02 baseline; business KPIs added from Stage 05. */
export default function Home() {
  const { me, loading, signOut, refresh } = useSession();
  const router = useRouter();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [dash, setDash] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    if (!me?.activeOrg) return;
    setActivity(await api.get<Activity[]>('/orgs/current/activity', { limit: 10 }).catch(() => []));
    setDash(await api.get('/me/dashboard').catch(() => null));
  };
  useEffect(() => { load(); }, [me?.activeOrg?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading) return <Loading />;
  if (!me) return <Redirect href="/" />;
  const org = me.activeOrg;
  return (
    <ScrollView style={s.safe} contentContainerStyle={s.body} testID="screen-023" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); await load(); setRefreshing(false); }} />}>
      <Stack.Screen options={{ title: 'COLLABIZ', headerRight: () => <Text onPress={signOut} style={{ color: '#fff', padding: 8 }} accessibilityRole="button">Sign out</Text> }} />
      <Text style={s.crumb}>Partner Home & Dashboard · SCREEN 023</Text>
      <Text style={s.h1}>Welcome, {me.fullName.split(' ')[0]}</Text>
      {!me.emailVerified && <Notice tone="warning">Verify your email to unlock all features.</Notice>}
      {!me.emailVerified && <Button title="Verify email" variant="secondary" onPress={() => router.push('/verify')} />}
      {org ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginVertical: theme.space.md }}>
            <Kpi label="Verification" value={org.verificationStatus.replace('_', ' ')} />
            <Kpi label="Level" value={org.membershipLevel} accent />
          </View>
          {dash && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: theme.space.md }}>
              <Kpi label="Applications" value={dash.applications.total} />
              <Kpi label="Recommended" value={dash.recommended} />
              <Kpi label="Alerts" value={dash.unreadNotifications} />
            </View>
          )}
          <Button title="Browse opportunities" onPress={() => router.push('/marketplace')} testID="home-marketplace" />
          <Button title="My leads" variant="secondary" onPress={() => router.push('/leads')} />
          <Row title="Lead protection" subtitle="Screen 151" onPress={() => router.push('/lead-protection')} />
          <Row title="Activity & quick actions" subtitle="Screen 030" onPress={() => router.push('/activity')} />
          <Row title="Sales pipeline" subtitle="Screen 053" onPress={() => router.push('/pipeline')} />
          <Row title="Projects & site progress" subtitle="Screens 075, 079" onPress={() => router.push('/projects')} />
          <Row title="Product enquiries & price requests" subtitle="Screen 088" onPress={() => router.push('/trading/enquiry')} />
          <Row title="Earnings & payments" subtitle="Screens 095, 100, 158" onPress={() => router.push('/earnings')} />
          <Row title="Collaboration requests" subtitle="Screen 059" onPress={() => router.push('/collaboration')} />
          <Card title={org.name}><Badge status={org.verificationStatus} /><Text style={[s.hint, { marginTop: 6 }]}>Role: {me.orgRoles.join(', ').replace(/org_/g, '')}</Text></Card>
          <Card title="Recent activity">
            {activity.length === 0 ? <Text style={s.hint}>No activity yet.</Text> : activity.map((a) => <Row key={a.id} title={a.action.replace(/[._]/g, ' ')} subtitle={`${new Date(a.at).toLocaleString()}${a.actorName ? ' · ' + a.actorName : ''}`} />)}
          </Card>
        </>
      ) : (
        <Card title="Start partner onboarding"><Text style={s.p}>Create your partner profile to access opportunities and register protected leads.</Text><Button title="Choose account type" variant="accent" onPress={() => router.push('/onboarding/account-type')} /></Card>
      )}
      {org && <Row title="My partner profile" subtitle="Screen 143" onPress={() => router.push('/profile')} />}
      {org && org.verificationStatus !== 'verified' && <Row title="Verification status" subtitle="Screen 022" onPress={() => router.push('/onboarding/status')} />}
      <Row title="Account security & MFA" subtitle="Screen 145" onPress={() => router.push('/security')} />
    </ScrollView>
  );
}

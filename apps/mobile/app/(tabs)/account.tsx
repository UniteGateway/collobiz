import { Alert, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Loading, Row, ScreenView, Section, s, theme } from '@/components/ui';
import { useSession } from '@/session';

/** Account tab: company, money, work areas and security — every native screen not on the tab bar is reachable from here. */
export default function Account() {
  const { me, loading, signOut } = useSession();
  const router = useRouter();
  if (loading) return <Loading />;
  if (!me) return <Redirect href="/" />;
  const org = me.activeOrg;
  const go = (p: string) => () => router.push(p as never);
  const initials = me.fullName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const confirmSignOut = () => Alert.alert('Sign out?', 'You will need your password to sign in again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } }]);
  return (
    <ScreenView tab title="Account" id="143-account">
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }]}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.colors.navy700, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>{initials}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.h2, { marginBottom: 0 }]}>{me.fullName}</Text>
          <Text style={s.rowSub}>{org ? `${org.name}${org.verificationStatus === 'verified' ? ' · Verified' : ''}` : 'No organization yet'}</Text>
        </View>
      </View>
      {org && (
        <Section title="Company">
          <Row icon="business" title="Partner profile" onPress={go('/profile')} />
          {org.verificationStatus !== 'verified' && <Row icon="checkmark-circle" iconTint={theme.colors.warning} title="Verification status" subtitle="See what’s left to verify" onPress={go('/onboarding/status')} />}
          <Row icon="people" title="Collaboration requests" onPress={go('/collaboration')} />
        </Section>
      )}
      {org && (
        <Section title="Performance & learning">
          <Row icon="ribbon" title="Reputation" subtitle="Score, verified record and reviews" onPress={go('/reputation')} />
          <Row icon="trending-up" title="Next membership level" onPress={go('/reputation/excellence')} />
          <Row icon="school" title="Learning & certificates" onPress={go('/learning')} />
          <Row icon="globe" title="Become a country partner" onPress={go('/global/country-partner')} />
        </Section>
      )}
      {org && (
        <Section title="Money">
          <Row icon="wallet" iconTint={theme.colors.green700} title="Earnings" subtitle="Projected, earned and paid commission" onPress={go('/earnings')} />
          <Row icon="card" iconTint={theme.colors.green700} title="Payments received" onPress={go('/payments')} />
        </Section>
      )}
      {org && (
        <Section title="Work">
          <Row icon="briefcase" iconTint={theme.colors.green700} title="Offers for you" subtitle="Work and products Unite Group sent to you" onPress={go('/offers')} testID="offers-row" />
          <Row icon="people" title="Your capacity" subtitle="Offices and people free for new work" onPress={go('/capacity')} />
          <Row icon="folder-open" title="Projects & site progress" onPress={go('/projects')} />
          <Row icon="calendar" title="Meetings" onPress={go('/meetings')} />
          <Row icon="megaphone" title="Announcements" onPress={go('/announcements')} />
          <Row icon="bar-chart" title="Sales pipeline" onPress={go('/pipeline')} />
          <Row icon="shield-checkmark" title="Lead protection" onPress={go('/lead-protection')} />
          <Row icon="cube" title="Product enquiries & prices" onPress={go('/trading/enquiry')} />
          <Row icon="time" title="Activity" onPress={go('/activity')} />
        </Section>
      )}
      <Section title="Settings & help">
        <Row icon="notifications" title="Notifications" onPress={go('/settings/notifications')} />
        <Row icon="lock-closed" title="Sign-in & two-factor" onPress={go('/security')} />
        <Row icon="help-buoy" title="Help & support" onPress={go('/help')} />
      </Section>
      <Section>
        <Row title="Sign out" icon="log-out-outline" iconTint={theme.colors.danger} chevron={false} onPress={confirmSignOut} testID="sign-out" />
      </Section>
    </ScreenView>
  );
}

import { Image, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Loading, s, theme } from '@/components/ui';
import { useSession } from '@/session';

/** Mobile welcome — native entry to screens 001 (homepage) and 011 (login / create account). */
export default function Welcome() {
  const { me, loading } = useSession();
  const router = useRouter();
  if (loading) return <Loading />;
  if (me) return <Redirect href="/home" />;
  return (
    <SafeAreaView style={[s.safe, { justifyContent: 'space-between', padding: theme.space.xl }]} testID="screen-001">
      <View style={{ alignItems: 'center', marginTop: 48 }}>
        <Image source={require('../assets/logo.png')} style={{ width: 300, height: 72 }} resizeMode="contain" accessibilityLabel="COLLABIZ — Connect. Collaborate. Grow." />
        <Text style={[s.p, { textAlign: 'center', marginTop: 24 }]}>
          The Unite-first hybrid B2B network. Register protected leads, build collaboration teams, track transparent commissions and grow your verified reputation.
        </Text>
      </View>
      <View>
        <Button title="Sign in" onPress={() => router.push('/login')} testID="welcome-signin" />
        <Button title="Join as a partner" variant="accent" onPress={() => router.push('/login?mode=register')} />
        <Text style={[s.hint, { textAlign: 'center', marginTop: 12 }]}>Powered by Unite Group</Text>
      </View>
    </SafeAreaView>
  );
}

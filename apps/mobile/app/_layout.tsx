import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@collabiz/ui/tokens';
import { SessionProvider } from '@/session';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: colors.navy900 }, headerTintColor: colors.white, headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: colors.navy50 } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

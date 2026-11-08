import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@collabiz/ui/tokens';
import { SessionProvider } from '@/session';

/** Root stack. Pushed screens use a light iOS-style header with a navy back button; tab screens draw their own large titles. */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{
          headerStyle: { backgroundColor: colors.grey50 },
          headerShadowVisible: false,
          headerTintColor: colors.navy700,
          headerTitleStyle: { fontWeight: '600', color: colors.navy900 },
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: colors.grey50 },
        }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Tabs } from 'expo-router';
import { api } from '@/api';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@collabiz/ui/tokens';

type Name = React.ComponentProps<typeof Ionicons>['name'];
const tab = (title: string, icon: Name, active: Name) => ({
  title,
  tabBarAccessibilityLabel: title,
  tabBarIcon: ({ color, focused, size }: { color: unknown; focused: boolean; size: number }) => <Ionicons name={focused ? active : icon} size={size - 2} color={String(color)} />,
});

/** Partner tab bar: Home · Collab · Post · Inbox · Profile. Discover, leads, projects and earnings are one tap from Home or Profile. */
export default function TabsLayout() {
  // Presence for Community "online now": a heartbeat each minute while the app is in the foreground.
  useEffect(() => {
    const beat = () => { if (AppState.currentState === 'active') api.post('/community/heartbeat').catch(() => undefined); };
    beat();
    const t = setInterval(beat, 60_000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') beat(); });
    return () => { clearInterval(t); sub.remove(); };
  }, []);
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.navy700,
      tabBarInactiveTintColor: colors.grey600,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      tabBarStyle: { backgroundColor: 'rgba(255,255,255,0.97)', borderTopColor: colors.grey200 },
    }}>
      <Tabs.Screen name="home" options={tab('Home', 'home-outline', 'home')} />
      <Tabs.Screen name="collab" options={tab('Collab', 'people-outline', 'people')} />
      <Tabs.Screen name="post" options={tab('Post', 'add-circle-outline', 'add-circle')} />
      <Tabs.Screen name="messages" options={tab('Inbox', 'chatbubbles-outline', 'chatbubbles')} />
      <Tabs.Screen name="account" options={tab('Profile', 'person-circle-outline', 'person-circle')} />
      {/* Still reachable from Home and Profile; not permanent tabs on a small screen. */}
      <Tabs.Screen name="marketplace" options={{ ...tab('Discover', 'storefront-outline', 'storefront'), href: null }} />
      <Tabs.Screen name="leads" options={{ ...tab('Leads', 'shield-checkmark-outline', 'shield-checkmark'), href: null }} />
    </Tabs>
  );
}

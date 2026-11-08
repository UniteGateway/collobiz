import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@collabiz/ui/tokens';

type Name = React.ComponentProps<typeof Ionicons>['name'];
const tab = (title: string, icon: Name, active: Name) => ({
  title,
  tabBarAccessibilityLabel: title,
  tabBarIcon: ({ color, focused, size }: { color: unknown; focused: boolean; size: number }) => <Ionicons name={focused ? active : icon} size={size - 2} color={String(color)} />,
});

/** Partner tab bar: the five places partners go every day. Projects, earnings and everything else are one tap from Home or Account. */
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.navy700,
      tabBarInactiveTintColor: colors.grey600,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      tabBarStyle: { backgroundColor: 'rgba(255,255,255,0.97)', borderTopColor: colors.grey200 },
    }}>
      <Tabs.Screen name="home" options={tab('Home', 'home-outline', 'home')} />
      <Tabs.Screen name="marketplace" options={tab('Discover', 'storefront-outline', 'storefront')} />
      <Tabs.Screen name="leads" options={tab('Leads', 'shield-checkmark-outline', 'shield-checkmark')} />
      <Tabs.Screen name="messages" options={tab('Messages', 'chatbubbles-outline', 'chatbubbles')} />
      <Tabs.Screen name="account" options={tab('Account', 'person-circle-outline', 'person-circle')} />
    </Tabs>
  );
}

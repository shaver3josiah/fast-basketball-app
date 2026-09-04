import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSession } from '../../src/session';
import { subscribeThreads } from '../../src/data';
import { color, semantic } from '../../src/theme';
import { Loading } from '../../src/ui';

/** Unread is approximated by "threads you can see" until read receipts exist.
 *  ponytail: a real per-thread lastRead pointer is a schema change and a rules change.
 *  Add it when someone complains the badge is wrong, not before. */
function useThreadCount() {
  const { user } = useSession();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) return;
    return subscribeThreads(user.uid, (t) => setN(t.length));
  }, [user?.uid]);
  return n;
}

export default function TabsLayout() {
  const { user, ready } = useSession();
  const threads = useThreadCount();

  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: semantic.surfaceBand },
        headerTintColor: color.chalk,
        headerTitleStyle: { color: color.chalk, fontWeight: '800' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: semantic.surfacePage },
        tabBarStyle: {
          backgroundColor: semantic.surfaceBand,
          borderTopColor: semantic.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        // --red-hot, not the canonical red: at tab-label size the canonical #E60C20
        // measures 4.18:1 on court black and fails AA. This swap is inside the DS.
        tabBarActiveTintColor: color.redHot,
        tabBarInactiveTintColor: color.textMute,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color: c, size }) => <Ionicons name="chatbubble-outline" size={size} color={c} />,
          tabBarBadge: threads > 0 ? threads : undefined,
          tabBarBadgeStyle: { backgroundColor: color.fastRed, color: color.bone, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color: c, size }) => <Ionicons name="calendar-outline" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="locker"
        options={{
          title: 'The Locker',
          tabBarLabel: 'Locker',
          tabBarIcon: ({ color: c, size }) => <Ionicons name="document-text-outline" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color: c, size }) => <Ionicons name="person-outline" size={size} color={c} />,
        }}
      />
    </Tabs>
  );
}

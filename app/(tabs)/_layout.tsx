import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Icon } from '../../src/Icon';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSession } from '../../src/session';
import { subscribeThreads } from '../../src/data';
import { color, semantic } from '../../src/theme';
import { Loading } from '../../src/ui';
import { FastMark } from '../../src/Logo';
import { Dust } from '../../src/Ambience';
import { Pending } from '../../src/Pending';
import { Tour } from '../../src/Tour';
import { readState } from '../../src/rewards';

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
  const { user, ready, needsVerification, notInvited, role, prefs } = useSession();
  const threads = useThreadCount();

  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/sign-in" />;
  // Signed in, but nothing will resolve: the address is unconfirmed, or the coach has
  // not invited it. Showing empty tabs here reads as a broken app.
  if (needsVerification || notInvited) return <Pending />;

  return (
    // Court black under everything, and the dust on it. The scenes are transparent so it
    // shows between cards; the tab bar and headers keep their own band colour.
    <View style={{ flex: 1, backgroundColor: semantic.surfacePage }}>
    <Dust />
    {/* Once per device, for every role, and again from the You tab's Replay. */}
    <Tour role={role} state={readState(prefs)} />
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: semantic.surfaceBand },
        headerTintColor: color.chalk,
        headerTitleStyle: { color: color.chalk, fontWeight: '800' },
        headerShadowVisible: false,
        // The brand on every tab's top bar. FAST alone, not the full lockup: at header
        // height the BASKETBALL line would be a smudge. Centred titles on both platforms
        // so Android's left-aligned title never collides with it.
        headerLeft: () => <FastMark height={17} style={{ marginLeft: 16 }} />,
        headerTitleAlign: 'center',
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          backgroundColor: semantic.surfaceBand,
          borderTopColor: semantic.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        // --red-hot, not the canonical red: at tab-label size the canonical #E60C20
        // measures 4.18:1 on court black and fails AA. This swap is inside the DS.
        tabBarActiveTintColor: color.redHot,
        // textMute measured 4.06 on the tab bar. textFaint is 4.88 and is the next
        // token up, so the inactive label clears AA without going near the active red.
        tabBarInactiveTintColor: color.textFaint,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color: c, size }) => <Icon name="chatbubble-outline" size={size} color={c} />,
          tabBarBadge: threads > 0 ? threads : undefined,
          tabBarBadgeStyle: { backgroundColor: color.fastRed, color: color.bone, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color: c, size }) => <Icon name="calendar-outline" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="builder"
        options={{
          title: 'Workout Builder',
          tabBarLabel: 'Workouts',
          tabBarIcon: ({ color: c, size }) => <Icon name="barbell-outline" size={size} color={c} />,
          // Only the coach has a workout library, and the rules say so too: a read of
          // /workoutTemplates from a family account is denied. href null removes the
          // tab without removing the route, so a stale deep link still resolves and
          // the screen itself redirects.
          href: role === 'coach' ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="locker"
        options={{
          title: 'The Locker',
          tabBarLabel: 'Locker',
          tabBarIcon: ({ color: c, size }) => <Icon name="document-text-outline" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color: c, size }) => <Icon name="person-outline" size={size} color={c} />,
        }}
      />
    </Tabs>
    </View>
  );
}

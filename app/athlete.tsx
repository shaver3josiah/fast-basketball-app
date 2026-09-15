import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '../src/session';
import { hasConsent, subscribeEvents } from '../src/data';
import type { SessionEvent } from '../src/types';
import { Avatar, Body, Card, CardTitle, Empty, GhostButton, Tag } from '../src/ui';
import { SESSION_TYPES, color, radius, semantic, type } from '../src/theme';

/**
 * One athlete, from the coach's side: who they are, what is coming up, and the two
 * things he wants to do from here, which are both "put work on their calendar".
 *
 * Reached by tapping the name at the top of a thread. That is the moment the thought
 * occurs: he is reading what a player said about their week and decides to schedule
 * something. Making him leave the conversation, find a tab, find a day and find the
 * athlete again is where the idea gets lost.
 */
export default function AthleteScreen() {
  const { role, athletesById } = useSession();
  const router = useRouter();
  const { athleteId } = useLocalSearchParams<{ athleteId: string }>();
  const [events, setEvents] = useState<SessionEvent[]>([]);

  useEffect(() => {
    if (role !== 'coach') return;
    return subscribeEvents('coach', null, setEvents);
  }, [role]);

  const athlete = athletesById[athleteId ?? ''];

  const upcoming = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => e.athleteId === athleteId && (e.startsAt?.toMillis?.() ?? 0) >= now)
      .slice(0, 6);
  }, [events, athleteId]);

  if (role !== 'coach') return <Redirect href="/(tabs)" />;
  if (!athlete) {
    return (
      <ScrollView style={s.page} contentContainerStyle={s.pad}>
        <Stack.Screen options={{ title: 'Athlete' }} />
        <Body>That athlete is not on your roster.</Body>
      </ScrollView>
    );
  }

  const consent = hasConsent(athlete);
  const go = (params: Record<string, string>) =>
    router.push({ pathname: '/schedule', params: { athleteId: athlete.id, ...params } });

  return (
    <ScrollView style={s.page} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: athlete.playerName }} />

      <View style={s.who}>
        <Avatar name={athlete.playerName} role="player" size={54} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{athlete.playerName}</Text>
          <Text style={s.meta}>
            {athlete.age ? `Age ${athlete.age} · ` : ''}
            Guardian: {athlete.guardianName}
          </Text>
        </View>
        <Tag tone={consent ? 'mon' : 'ro'}>{consent ? 'Active' : 'Pending'}</Tag>
      </View>

      <Card>
        <CardTitle>Put work on their calendar</CardTitle>
        <Body>
          An individual workout is what they do on their own. A coached session is time
          with you, and you can add other athletes to it on the next screen.
        </Body>
        <View style={s.actions}>
          <GhostButton
            label="Individual workout"
            icon="person-outline"
            onPress={() => go({ kind: 'individual' })}
          />
          <GhostButton
            label="Coached session"
            icon="people-outline"
            onPress={() => go({ kind: 'coached' })}
          />
        </View>
      </Card>

      <Card>
        <CardTitle>Coming up</CardTitle>
        {upcoming.length === 0 ? (
          <Empty icon="calendar-outline">Nothing scheduled yet.</Empty>
        ) : (
          upcoming.map((e) => {
            const t = SESSION_TYPES[e.type] ?? {
              label: e.type,
              icon: 'ellipse-outline' as const,
              color: color.slate,
            };
            const d = e.startsAt.toDate();
            return (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${e.name} on ${d.toLocaleDateString()}`}
                onPress={() => router.push({ pathname: '/schedule', params: { eventId: e.id } })}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: color.inkHover }]}
              >
                <Ionicons name={t.icon} size={16} color={t.color} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowName, e.canceled && s.struck]} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={s.rowMeta}>
                    {d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    {e.timeLabel ? ` · ${e.timeLabel}` : ''}
                    {e.kind === 'coached' ? ' · Coached' : ''}
                    {e.canceled ? ' · Canceled' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
              </Pressable>
            );
          })
        )}
      </Card>

      {!consent && (
        <Card>
          <CardTitle>Consent is not granted</CardTitle>
          <Body>
            {athlete.guardianName} has not turned on training consent, so {athlete.playerName.split(' ')[0]}{' '}
            cannot message you yet. Scheduling still works. They and their guardian both see
            everything you put on this calendar.
          </Body>
        </Card>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  pad: { padding: 16, paddingBottom: 40 },

  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.cardLg,
    padding: 14,
    marginBottom: 12,
  },
  name: { fontSize: 19, fontWeight: '800', color: color.chalk },
  meta: { ...type.meta, marginTop: 2 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
  rowName: { fontSize: 14.5, fontWeight: '600', color: color.chalk },
  rowMeta: { ...type.meta, marginTop: 2 },
  struck: { textDecorationLine: 'line-through', color: color.textDim },
});

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession, useNames } from '../../src/session';
import { subscribeThreads, subscribeLastMessage } from '../../src/data';
import type { Message, Thread } from '../../src/types';
import { Avatar, Banner, Empty, Eyebrow, Screen, Tag } from '../../src/ui';
import { color, radius, semantic, type } from '../../src/theme';

export default function Messages() {
  const { user, role, consent, prefs } = useSession();
  const names = useNames();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[] | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeThreads(user.uid, setThreads);
  }, [user?.uid]);

  const locked = role === 'player' && !consent;

  return (
    <Screen>
      {role === 'parent' && (
        <Banner tone="watch" title="You see everything">
          Every message between Coach Kingsley and {names.player.split(' ')[0]} appears here. You can
          read it — you cannot post into it.
        </Banner>
      )}
      {role === 'player' && !consent && (
        <Banner tone="lock" title="Waiting on a parent">
          {names.parent.split(' ')[0]} has not approved messaging yet. Ask them to turn on Training
          consent in their app.
        </Banner>
      )}
      {role === 'player' && consent && (
        <Banner tone="watch" title={`${names.parent.split(' ')[0]} can read this`}>
          Your parent sees every message in this thread. That is how the app works for athletes under
          18.
        </Banner>
      )}
      {role === 'coach' && (
        <Banner tone="ok" title="On the record">
          Every message you send an athlete is visible to their guardian. Write like it is on the
          record, because it is.
        </Banner>
      )}

      <Eyebrow>{role === 'coach' ? 'Roster threads' : 'Conversations'}</Eyebrow>

      {threads === null && <Text style={type.meta}>Loading…</Text>}
      {threads?.length === 0 && (
        <Empty icon="▤">No conversations yet.{'\n'}Coach Kingsley opens these.</Empty>
      )}

      {threads?.map((t) => (
        <ThreadRow
          key={t.id}
          thread={t}
          locked={locked}
          muted={(prefs.mutedThreads ?? []).includes(t.id)}
          onPress={() => !locked && router.push(`/thread/${t.id}`)}
        />
      ))}
    </Screen>
  );
}

function ThreadRow({
  thread,
  locked,
  muted,
  onPress,
}: {
  thread: Thread;
  locked: boolean;
  muted: boolean;
  onPress: () => void;
}) {
  const { role, user } = useSession();
  const names = useNames(thread.athleteId);
  const [last, setLast] = useState<Message | null>(null);

  // One listener per thread, reading exactly one document each. If a roster ever makes
  // that dozens of listeners, denormalise a lastMessage field onto the thread doc.
  useEffect(() => subscribeLastMessage(thread.id, setLast), [thread.id]);

  // A parent watching the coach<->player thread is a reader, not a participant.
  const monitoring = role === 'parent' && !thread.participants.includes(user?.uid ?? '');
  const other =
    role === 'coach'
      ? thread.kind === 'coach-player'
        ? { name: names.player, role: 'player' as const }
        : { name: names.parent, role: 'parent' as const }
      : monitoring
        ? { name: names.player, role: 'player' as const }
        : { name: names.coach, role: 'coach' as const };

  const title = monitoring ? `Coach ↔ ${names.player.split(' ')[0]}` : other.name;

  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={`Open conversation: ${title}`}
      accessibilityState={{ disabled: locked }}
      style={({ pressed }) => [s.row, pressed && !locked && { backgroundColor: color.inkHover }, locked && { opacity: 0.55 }]}
    >
      <Avatar name={other.name} role={other.role} />
      <View style={{ flex: 1 }}>
        <View style={s.rowTop}>
          <Text style={s.rowName} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.rowTime}>{locked ? '—' : timeOf(last)}</Text>
        </View>
        <Text style={s.rowPrev} numberOfLines={2}>
          {locked ? 'Locked until consent' : (last?.text ?? 'No messages yet.')}
        </Text>
        {(monitoring || muted) && (
          <View style={s.tags}>
            {monitoring && <Tag tone="mon">◉ Monitoring</Tag>}
            {monitoring && <Tag tone="ro">Read only</Tag>}
            {muted && <Tag tone="muted">Muted</Tag>}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function timeOf(m: Message | null): string {
  const d = m?.createdAt?.toDate?.();
  if (!d) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.cardLg,
    padding: 13,
    marginBottom: 10,
    minHeight: 64,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  rowName: { flex: 1, fontSize: 15, fontWeight: '700', color: color.chalk },
  rowTime: { ...type.meta, fontSize: 11.5 },
  rowPrev: { ...type.body, fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
});

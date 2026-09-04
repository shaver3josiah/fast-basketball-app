import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/firebase';
import { useSession, useNames } from '../../src/session';
import { canPostIn, sendMessage, subscribeMessages } from '../../src/data';
import type { Message, Thread } from '../../src/types';
import { Banner } from '../../src/ui';
import { color, radius, semantic, type } from '../../src/theme';

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, role, athlete, consent } = useSession();
  const names = useNames();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Message>>(null);

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'threads', id), (snap) =>
      setThread(snap.exists() ? ({ id: snap.id, ...snap.data() } as Thread) : null)
    );
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return subscribeMessages(id, setMessages);
  }, [id]);

  const monitoring = !!thread && !!user && !thread.participants.includes(user.uid);
  const canPost = !!thread && !!user && canPostIn(thread, user.uid, athlete);
  const title = monitoring
    ? `Coach ↔ ${names.player.split(' ')[0]}`
    : role === 'coach'
      ? thread?.kind === 'coach-player'
        ? names.player
        : names.parent
      : names.coach;

  async function send() {
    const text = draft.trim();
    if (!text || !user || !id) return;
    setSending(true);
    setError(null);
    // Clear optimistically: the listener puts the real message back within a frame or
    // two, and leaving the text in the box after a successful send feels broken.
    setDraft('');
    try {
      await sendMessage(id, user.uid, text);
    } catch {
      setDraft(text);
      setError('That message did not send. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={s.page}>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            <View>
              {monitoring && (
                <Banner tone="watch" title="Monitored thread">
                  Read-only for you. {names.player.split(' ')[0]} and Coach Kingsley both know you can
                  see it.
                </Banner>
              )}
              {role === 'player' && consent && (
                <Banner tone="watch" title="Your parent can see this conversation">
                  {names.parent.split(' ')[0]} reads every message here.
                </Banner>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <Bubble
              message={item}
              previous={messages[index - 1]}
              mine={item.senderUid === user?.uid}
              showAuthor={monitoring || role === 'coach'}
            />
          )}
        />

        {error ? (
          <Text style={s.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        {canPost ? (
          <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TextInput
              style={s.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message…"
              placeholderTextColor={color.textLabel}
              accessibilityLabel="Message"
              multiline
              maxLength={4000}
              onSubmitEditing={send}
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={({ pressed }) => [
                s.send,
                { backgroundColor: pressed ? color.redHot : color.fastRed },
                (!draft.trim() || sending) && { opacity: 0.4 },
              ]}
            >
              <Text style={s.sendIcon}>↑</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[s.lockStrip, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={s.lockText}>
              {monitoring
                ? 'Read-only. To reach Coach Kingsley, use your own thread with him.'
                : `Locked until ${names.parent.split(' ')[0]} grants training consent.`}
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({
  message,
  previous,
  mine,
  showAuthor,
}: {
  message: Message;
  previous?: Message;
  mine: boolean;
  showAuthor: boolean;
}) {
  const { athlete } = useSession();
  const names = useNames();
  const d = message.createdAt?.toDate?.();
  const prevD = previous?.createdAt?.toDate?.();
  const newDay = d && (!prevD || prevD.toDateString() !== d.toDateString());

  const who =
    message.senderUid === athlete?.playerUid
      ? names.player.split(' ')[0]
      : message.senderUid === athlete?.guardianUid
        ? names.parent.split(' ')[0]
        : 'Coach Kingsley';

  return (
    <View>
      {newDay && <Text style={s.daySep}>{dayLabel(d!)}</Text>}
      <View style={[s.bubble, mine ? s.mine : s.theirs]}>
        {showAuthor && !mine && <Text style={s.who}>{who}</Text>}
        <Text style={s.text}>{message.text}</Text>
        <Text style={s.stamp}>
          {d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Sending…'}
        </Text>
      </View>
    </View>
  );
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  list: { padding: 14, paddingBottom: 20 },

  daySep: {
    alignSelf: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: color.textLabel,
    marginVertical: 14,
  },
  bubble: { maxWidth: '84%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 10, marginBottom: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: color.redDeep, borderBottomRightRadius: 5 },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.border,
    borderBottomLeftRadius: 5,
  },
  who: { fontSize: 11, fontWeight: '800', color: color.redHot, marginBottom: 3, letterSpacing: 0.4 },
  text: { fontSize: 15, lineHeight: 21, color: color.chalk },
  stamp: { fontSize: 10.5, color: color.textFaint, marginTop: 5, alignSelf: 'flex-end' },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surfaceBand,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: semantic.surfaceInput,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    color: color.chalk,
    fontSize: 15,
  },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: color.bone, fontSize: 20, fontWeight: '800' },

  lockStrip: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surfaceBand,
  },
  lockText: { ...type.meta, textAlign: 'center', lineHeight: 18 },
  error: { color: color.redHot, fontSize: 13, paddingHorizontal: 16, paddingBottom: 6 },
});

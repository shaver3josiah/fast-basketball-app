import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession, useNames } from '../../src/session';
import { hasConsent, savePrefs, setConsent, setMuted, subscribeThreads } from '../../src/data';
import { Celebrate } from '../../src/Celebrate';
import {
  CELEBRATIONS,
  activeCelebration,
  isUnlocked,
  nextUp,
  readState,
  type Celebration,
} from '../../src/rewards';
import type { Thread, UserPrefs } from '../../src/types';
import { Avatar, Body, Button, Card, CardTitle, Screen, Setting, Tag } from '../../src/ui';
import { CHAT_COLORS, bubbleColor, color, radius, semantic, type } from '../../src/theme';

export default function You() {
  const { user, role, athlete, athletesById, consent, prefs } = useSession();
  const names = useNames();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState({ id: 'spark', nonce: 0 });

  const rewards = readState(prefs);

  useEffect(() => {
    if (!user) return;
    return subscribeThreads(user.uid, setThreads);
  }, [user?.uid]);

  const me = { coach: names.coach, parent: names.parent, player: names.player }[role];
  const roleLabel = {
    coach: 'Coach / Trainer',
    parent: 'Parent / Guardian',
    player: athlete?.age ? `Athlete · Age ${athlete.age}` : 'Athlete',
  }[role];

  async function toggleConsent(next: boolean) {
    if (!athlete) return;
    setError(null);
    try {
      await setConsent(athlete.id, next);
    } catch {
      // The rule is the enforcement; if it says no, say so rather than flipping
      // the switch optimistically and lying about the state.
      setError('That change was refused. Only the guardian on this account can set consent.');
    }
  }

  /** Both pickers write to the same private document, so they share one saver. */
  async function save(patch: Partial<UserPrefs>) {
    if (!user) return;
    setError(null);
    try {
      await savePrefs(user.uid, prefs, patch);
    } catch {
      setError('Could not save that. Check your connection.');
    }
  }

  async function toggleMute(threadId: string, muted: boolean) {
    if (!user) return;
    setError(null);
    try {
      await setMuted(user.uid, prefs, threadId, muted);
    } catch {
      setError('Could not save that notification setting.');
    }
  }

  return (
    <View style={{ flex: 1 }}>
    <Screen>
      <View style={s.who}>
        <Avatar name={me} role={role} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{me}</Text>
          <Text style={s.role}>{roleLabel}</Text>
        </View>
      </View>

      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Card>
        <CardTitle>Your streak</CardTitle>
        <View style={s.stats}>
          <Stat n={rewards.streak} label="Day streak" hot={rewards.streak >= 3} />
          <Stat n={rewards.bestStreak} label="Best run" />
          <Stat n={rewards.workouts} label="Workouts" />
        </View>
        <Body>
          {rewards.streak === 0
            ? 'Open the app on a training day and the streak starts. Finish a workout on the timer and it counts.'
            : `Opened ${rewards.streak} day${rewards.streak === 1 ? '' : 's'} in a row. Come back tomorrow and it keeps going.`}
        </Body>
        <Setting
          title="Streak reminders"
          description="A nudge in the evening when the streak is about to break, and a note the morning after if it does. Nothing leaves your phone."
          value={prefs.remind !== false}
          onChange={(on) => save({ remind: on })}
        />
      </Card>

      <Card>
        <CardTitle>Celebration</CardTitle>
        <Body>
          What goes off when you mark a block or a workout done. Tap one to try it.
          {nextUp(rewards) ? ` Next up: ${nextUp(rewards)!.celebration.label}, ${nextUp(rewards)!.hint}.` : ''}
        </Body>
        <View style={{ height: 10 }} />
        {CELEBRATIONS.map((c) => (
          <CelebrationRow
            key={c.id}
            celebration={c}
            unlocked={isUnlocked(c, rewards)}
            chosen={activeCelebration(rewards) === c.id}
            onPress={() => {
              setPreview({ id: c.id, nonce: preview.nonce + 1 });
              save({ celebration: c.id });
            }}
          />
        ))}
      </Card>

      <Card>
        <CardTitle>Chat colour</CardTitle>
        <Body>Your own messages, in whichever of these you like. Nobody else's change.</Body>
        <View style={s.swatches}>
          {(Object.keys(CHAT_COLORS) as (keyof typeof CHAT_COLORS)[]).map((k) => {
            const on = (prefs.chatColor ?? 'red') === k;
            return (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={CHAT_COLORS[k].label}
                onPress={() => save({ chatColor: k })}
                style={[s.swatch, { backgroundColor: CHAT_COLORS[k].bg }, on && s.swatchOn]}
              >
                {on ? <Ionicons name="checkmark-sharp" size={20} color={color.bone} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={[s.preview, { backgroundColor: bubbleColor(prefs.chatColor) }]}>
          <Text style={s.previewText}>Your messages look like this.</Text>
        </View>
      </Card>

      {role === 'parent' && (
        <>
          <Card>
            <CardTitle>Consent</CardTitle>
            <Setting
              title="Training consent"
              description={`Lets ${names.player.split(' ')[0]} message Coach Kingsley directly. Turn it off and their thread goes read-only immediately.`}
              value={consent}
              onChange={toggleConsent}
            />
            <Setting
              title="Read every message"
              description="Always on for athletes under 18. Not something you or your athlete can switch off."
              value
              disabled
              tone="teal"
            />
          </Card>

          <Card>
            <CardTitle>Notifications</CardTitle>
            {threads.map((t) => {
              const muted = (prefs.mutedThreads ?? []).includes(t.id);
              const label =
                t.kind === 'coach-parent' ? 'Coach ↔ you' : `Coach ↔ ${names.player.split(' ')[0]}`;
              return (
                <Setting
                  key={t.id}
                  title={label}
                  description={
                    muted
                      ? 'Muted. Messages still arrive, your phone stays quiet.'
                      : 'Notify me about new messages in this thread.'
                  }
                  value={!muted}
                  onChange={(on) => toggleMute(t.id, !on)}
                />
              );
            })}
          </Card>

          <Card>
            <CardTitle>{names.player.split(' ')[0]}’s account</CardTitle>
            <Body>
              Consent is{' '}
              <Text style={{ color: consent ? color.miamiTeal : color.redHot, fontWeight: '700' }}>
                {consent ? 'granted' : 'not granted'}
              </Text>
              . Revoking it locks the thread without deleting anything that was already said.
            </Body>
          </Card>
        </>
      )}

      {role === 'player' && (
        <>
          <Card>
            <CardTitle>Messaging status</CardTitle>
            <Body>
              {consent
                ? `${names.parent.split(' ')[0]} approved messaging. You can ask Coach Kingsley anything about training. `
                : `${names.parent.split(' ')[0]} has not approved messaging yet. Until they do you can read the calendar and the Locker, but the thread stays locked.`}
              {consent ? (
                <Text style={{ color: color.miamiTeal, fontWeight: '700' }}>
                  They read this thread too
                </Text>
              ) : null}
              {consent ? '. That is not a punishment. It is how the app works until you are 18.' : ''}
            </Body>
          </Card>
          <Card>
            <CardTitle>Notifications</CardTitle>
            <Body>{names.parent.split(' ')[0]} controls notification settings for your account.</Body>
          </Card>
        </>
      )}

      {role === 'coach' && (
        <>
          <Card>
            <CardTitle>Roster</CardTitle>
            {Object.values(athletesById).length === 0 ? (
              <Body>No athletes on the roster yet.</Body>
            ) : (
              Object.values(athletesById).map((a) => {
                // Consent is per athlete, so it is read off each row rather than off
                // the session — otherwise every athlete would inherit the first one's.
                const granted = hasConsent(a);
                return (
                  <View key={a.id} style={s.rosterRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rosterName}>
                        {a.playerName}
                        {a.age ? ` · ${a.age}` : ''}
                      </Text>
                      <Text style={type.meta}>
                        Guardian: {a.guardianName} · consent {granted ? 'granted' : 'pending'}
                      </Text>
                    </View>
                    <Tag tone={granted ? 'mon' : 'ro'}>{granted ? 'Active' : 'Pending'}</Tag>
                  </View>
                );
              })
            )}
            <View style={{ height: 12 }} />
            <Button label="Add or manage athletes" onPress={() => router.push('/roster')} />
          </Card>
          <Card>
            <CardTitle>What parents see</CardTitle>
            <Body>
              Every message you send an athlete is visible to their guardian, and no message can be
              edited or deleted afterwards, by them or by you. Write like it is on the record.
            </Body>
          </Card>
        </>
      )}

      <Card>
        <CardTitle>Account</CardTitle>
        <Body>{user?.email}</Body>
        <View style={{ height: 14 }} />
        <SignOutButton />
        <LinkRow label="Privacy policy" url="https://fast-basketball.com/privacy" />
        <LinkRow label="Get help or report a concern" url="https://fast-basketball.com/contact" />
        {role !== 'coach' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/delete-account')}
            style={s.linkRow}
          >
            <Text style={s.danger}>Delete my account</Text>
          </Pressable>
        )}
      </Card>
    </Screen>
    <Celebrate id={preview.id} nonce={preview.nonce} />
    </View>
  );
}

/** One number on the streak card. */
function Stat({ n, label, hot }: { n: number; label: string; hot?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statN, hot && { color: '#FF7A18' }]}>{n}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

/**
 * A celebration, locked or not. A locked one still shows what it is and what it costs:
 * a row of grey padlocks with no names is a wall, and the point is to give the athlete
 * something to aim at.
 */
function CelebrationRow({
  celebration: c,
  unlocked,
  chosen,
  onPress,
}: {
  celebration: Celebration;
  unlocked: boolean;
  chosen: boolean;
  onPress: () => void;
}) {
  const need = [
    c.needWorkouts !== undefined ? `${c.needWorkouts} workouts` : '',
    c.needStreak !== undefined ? `a ${c.needStreak} day streak` : '',
  ]
    .filter(Boolean)
    .join(' or ');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: chosen, disabled: !unlocked }}
      accessibilityLabel={unlocked ? `${c.label}. ${c.blurb}` : `${c.label}, locked. Needs ${need}.`}
      disabled={!unlocked}
      onPress={onPress}
      style={({ pressed }) => [
        s.celeb,
        chosen && { borderColor: color.fastRed },
        pressed && unlocked && { backgroundColor: color.inkHover },
        !unlocked && { opacity: 0.55 },
      ]}
    >
      <Ionicons
        name={!unlocked ? 'lock-closed' : chosen ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={!unlocked ? color.textFaint : chosen ? color.redHot : color.textDim}
      />
      <View style={{ flex: 1 }}>
        <Text style={s.celebName}>{c.label}</Text>
        <Text style={type.meta}>{unlocked ? c.blurb : `Unlocks at ${need}.`}</Text>
      </View>
      {chosen ? <Tag tone="mon">On</Tag> : null}
    </Pressable>
  );
}

/**
 * App Review wants a privacy policy and a support route reachable from inside the app,
 * not only from the store listing. Both live on the marketing site, so this opens them
 * rather than duplicating the copy in two places that would then drift apart.
 */
function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL(url)}
      style={s.linkRow}
    >
      <Text style={s.link}>{label}</Text>
    </Pressable>
  );
}

function SignOutButton() {
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label="Sign out"
      busy={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await signOut();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

const s = StyleSheet.create({
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  name: { fontSize: 18, fontWeight: '800', color: color.chalk },
  role: { ...type.meta, marginTop: 2 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rosterName: { fontSize: 14, fontWeight: '700', color: color.chalk, marginBottom: 2 },
  error: { color: color.redHot, fontSize: 13.5, lineHeight: 19, marginBottom: 12 },
  linkRow: { minHeight: 44, justifyContent: 'center' },

  stats: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stat: {
    flex: 1,
    backgroundColor: color.courtBlack,
    borderRadius: radius.chip,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statN: { fontSize: 26, fontWeight: '900', color: color.chalk, lineHeight: 30 },
  statL: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: color.textDim },

  celeb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    borderRadius: radius.chip,
    marginBottom: 8,
  },
  celebName: { fontSize: 14.5, fontWeight: '700', color: color.chalk, marginBottom: 2 },

  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  swatch: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchOn: { borderColor: color.bone },
  preview: { alignSelf: 'flex-end', marginTop: 14, borderRadius: 16, borderBottomRightRadius: 5, paddingHorizontal: 13, paddingVertical: 10 },
  previewText: { fontSize: 15, lineHeight: 21, color: color.chalk },
  link: { color: color.redHot, fontSize: 14, fontWeight: '700' },
  danger: { color: color.textDim, fontSize: 14, fontWeight: '700' },
});

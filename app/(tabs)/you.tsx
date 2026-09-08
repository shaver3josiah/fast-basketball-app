import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession, useNames } from '../../src/session';
import { hasConsent, setConsent, setMuted, subscribeThreads } from '../../src/data';
import type { Thread } from '../../src/types';
import { Avatar, Body, Button, Card, CardTitle, Screen, Setting, Tag } from '../../src/ui';
import { color, semantic, type } from '../../src/theme';

export default function You() {
  const { user, role, athlete, athletesById, consent, prefs } = useSession();
  const names = useNames();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [error, setError] = useState<string | null>(null);

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
                      ? 'Muted — messages still arrive, your phone stays quiet.'
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
              {consent ? ' — that is not a punishment, it is how the app works until you are 18.' : ''}
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
              edited or deleted afterwards — by them or by you. Write like it is on the record.
            </Body>
          </Card>
        </>
      )}

      <Card>
        <CardTitle>Account</CardTitle>
        <Body>{user?.email}</Body>
        <View style={{ height: 14 }} />
        <SignOutButton />
      </Card>
    </Screen>
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
});

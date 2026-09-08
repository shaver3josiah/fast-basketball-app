import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../src/session';
import { createThreadsFor, hasConsent, inviteAthlete, subscribeThreads } from '../src/data';
import type { Athlete, Thread } from '../src/types';
import { Banner, Body, Button, Card, CardTitle, Eyebrow, Screen, Tag } from '../src/ui';
import { color, radius, semantic, type } from '../src/theme';

/**
 * The coach's roster: invite a family, watch them sign up, open their threads.
 *
 * All of this used to be hand-entry in the Firebase console — including a `readers`
 * array whose contents are the parent-monitoring guarantee, and which the rules reject
 * if you get it wrong. Typing that by hand for every family was the single most
 * error-prone step in the whole setup.
 */
export default function Roster() {
  const { role, user, athletesById } = useSession();
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    if (!user) return;
    return subscribeThreads(user.uid, setThreads);
  }, [user?.uid]);

  const threadedAthleteIds = useMemo(
    () => new Set(threads.map((t) => t.athleteId)),
    [threads]
  );

  if (role !== 'coach') return <Redirect href="/(tabs)" />;

  const athletes = Object.values(athletesById);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Roster' }} />

      <Banner tone="ok" title="How this works">
        Invite a family by email. They create their own account with that address, confirm it, and
        the app connects them automatically. Open their threads once they have.
      </Banner>

      <Eyebrow>Athletes</Eyebrow>
      {athletes.length === 0 ? (
        <Body>Nobody yet. Invite your first family below.</Body>
      ) : (
        athletes.map((a) => (
          <AthleteCard
            key={a.id}
            athlete={a}
            hasThreads={threadedAthleteIds.has(a.id)}
            coachUid={user?.uid ?? ''}
          />
        ))
      )}

      <Eyebrow style={{ marginTop: 22 }}>Invite a family</Eyebrow>
      <InviteForm />
    </Screen>
  );
}

function AthleteCard({
  athlete,
  hasThreads,
  coachUid,
}: {
  athlete: Athlete;
  hasThreads: boolean;
  coachUid: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentIn = Boolean(athlete.guardianUid);
  const playerInvited = Boolean(athlete.playerEmail);
  const playerIn = Boolean(athlete.playerUid);
  // The guardian's uid has to exist before the rules will let a thread be created.
  const canOpen = parentIn && !hasThreads;

  async function open() {
    setBusy(true);
    setError(null);
    try {
      await createThreadsFor(athlete, coachUid);
    } catch {
      setError('Could not open the threads. Check the rules are deployed, then try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={s.head}>
        <Text style={s.name}>
          {athlete.playerName}
          {athlete.age ? ` · ${athlete.age}` : ''}
        </Text>
        <Tag tone={hasConsent(athlete) ? 'mon' : 'ro'}>
          {hasConsent(athlete) ? 'Consent granted' : 'Consent pending'}
        </Tag>
      </View>

      <Row
        label="Parent"
        who={athlete.guardianName}
        email={athlete.guardianEmail}
        joined={parentIn}
      />
      {playerInvited ? (
        <Row label="Athlete" who={athlete.playerName} email={athlete.playerEmail} joined={playerIn} />
      ) : (
        <Text style={s.note}>
          No athlete login — the family uses the parent’s account. That is the right shape under 13.
        </Text>
      )}

      <View style={s.foot}>
        {hasThreads ? (
          <Text style={s.ok}>✓ Threads open</Text>
        ) : parentIn ? (
          <Button label={busy ? 'Opening…' : 'Open threads'} onPress={open} busy={busy} />
        ) : (
          <Text style={s.waiting}>
            Waiting for {athlete.guardianName.split(' ')[0]} to sign up. Threads need a real account
            to point at.
          </Text>
        )}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </Card>
  );
}

const Row = ({
  label,
  who,
  email,
  joined,
}: {
  label: string;
  who: string;
  email?: string;
  joined: boolean;
}) => (
  <View style={s.row}>
    <View style={{ flex: 1 }}>
      <Text style={s.rowWho}>
        {label}: {who}
      </Text>
      <Text style={type.meta}>{email}</Text>
    </View>
    <Tag tone={joined ? 'mon' : 'ro'}>{joined ? 'Signed up' : 'Invited'}</Tag>
  </View>
);

function InviteForm() {
  const [playerName, setPlayerName] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [age, setAge] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ready = playerName.trim() && guardianName.trim() && guardianEmail.trim();

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    const n = Number(age);
    try {
      await inviteAthlete({
        playerName,
        guardianName,
        guardianEmail,
        playerEmail,
        age: Number.isFinite(n) && n > 0 ? n : undefined,
      });
      setDone(`${playerName.trim()} added. Tell them to sign up with the addresses above.`);
      setPlayerName('');
      setGuardianName('');
      setGuardianEmail('');
      setPlayerEmail('');
      setAge('');
    } catch {
      setError('Could not add them. Check the rules are deployed, then try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle>New athlete</CardTitle>

      <Field label="Athlete's name" value={playerName} onChange={setPlayerName} placeholder="Marcus Alvarez" />
      <Field label="Age" value={age} onChange={setAge} placeholder="15" keyboardType="number-pad" />
      <Field label="Parent's name" value={guardianName} onChange={setGuardianName} placeholder="Denise Alvarez" />
      <Field
        label="Parent's email"
        value={guardianEmail}
        onChange={setGuardianEmail}
        placeholder="denise@example.com"
        keyboardType="email-address"
      />
      <Field
        label="Athlete's email — leave blank if under 13"
        value={playerEmail}
        onChange={setPlayerEmail}
        placeholder="marcus@example.com"
        keyboardType="email-address"
      />

      <Text style={s.hint}>
        These addresses are what the family signs up with. A different address creates an account
        that matches nothing, so use the ones they actually gave you.
      </Text>

      {error ? <Text style={s.error}>{error}</Text> : null}
      {done ? (
        <Text style={s.ok} accessibilityLiveRegion="polite">
          {done}
        </Text>
      ) : null}

      <View style={{ height: 14 }} />
      <Button label="Add athlete" onPress={submit} busy={busy} disabled={!ready} />
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: 'email-address' | 'number-pad';
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.textLabel}
        accessibilityLabel={label}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        autoCorrect={false}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: color.chalk },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
  rowWho: { fontSize: 14, fontWeight: '600', color: color.textLede },
  note: { ...type.meta, paddingVertical: 9, lineHeight: 17 },
  foot: { marginTop: 12 },
  waiting: { ...type.meta, lineHeight: 17 },
  ok: { color: color.miamiTeal, fontSize: 13.5, fontWeight: '700', marginTop: 10 },
  error: { color: color.redHot, fontSize: 13, marginTop: 10, lineHeight: 18 },
  hint: { ...type.meta, marginTop: 4, lineHeight: 17 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: color.textLabel,
    marginBottom: 5,
  },
  input: {
    backgroundColor: semantic.surfaceInput,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.input,
    color: color.chalk,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
  },
});

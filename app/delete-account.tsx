import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../src/firebase';
import { useSession, useNames } from '../src/session';
import { deletePrefs, setConsent } from '../src/data';
import { Banner, Body, Button, Card, CardTitle } from '../src/ui';
import { color, radius, semantic } from '../src/theme';

/**
 * App Store Review Guideline 5.1.1(v): an app that lets people create an account must
 * let them delete it from inside the app. app/sign-up.tsx creates accounts, so this
 * screen is not optional — a submission without it is rejected, and Google Play's data
 * deletion policy asks for the same thing.
 *
 * What it deliberately does NOT do is pretend to erase everything. Messages are
 * permanent by design: they are the record a guardian is promised, and the rules refuse
 * to delete one for the coach as firmly as for anyone else. The athlete record is the
 * coach's document. Saying so here is better than a "delete everything" button that
 * quietly cannot.
 */
export default function DeleteAccount() {
  const router = useRouter();
  const { user, role, athlete } = useSession();
  const names = useNames();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The coach's uid is a constant inside firestore.rules. Deleting that account does
  // not remove one user, it removes the only account the rules recognise as the coach
  // — every family keeps their login and loses the person on the other end, until a
  // new account is created AND the rules are redeployed. That is an owner operation,
  // not a button.
  if (role === 'coach') {
    return (
      <ScrollView style={s.page} contentContainerStyle={s.pad}>
        <Banner tone="lock" title="Not from here">
          This is the coach account. The security rules identify it by id, so deleting it
          would leave every family signed in with nobody to message. No button in the app
          can put it back. Delete it from the Firebase console, and redeploy the rules
          with the new account's id, if that is really what you want.
        </Banner>
      </ScrollView>
    );
  }

  async function submit() {
    const u = auth.currentUser;
    if (!u?.email) return;
    setBusy(true);
    setError(null);
    try {
      // Firebase refuses to delete an account whose sign-in is more than a few minutes
      // old, and only says so at the delete call itself. Ask for the password up front
      // instead of failing at the end of a flow the user has already confirmed.
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));

      // A guardian's account IS the monitoring. Deleting it while consent stands would
      // leave an athlete messaging the coach with nobody reading — the one thing this
      // app promises cannot happen. Revoking is a write only the guardian may make, so
      // it has to happen before she stops existing, and a failure here has to stop the
      // deletion rather than be swallowed.
      if (role === 'parent' && athlete) await setConsent(athlete.id, false);

      await deletePrefs(u.uid);
      await deleteUser(u);
      // The auth listener routes to sign-in on its own; this just avoids a frame of the
      // old screen while it does.
      router.replace('/sign-in');
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? '';
      setError(
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'That password is not right.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Wait a few minutes and try again.'
            : code === 'auth/network-request-failed'
              ? 'No connection. Check your signal and try again.'
              : // The password errors above all happen before anything is written. This
                // one can land after consent has already been revoked, so it must not
                // promise that nothing changed.
                'Could not finish deleting the account. Your login is still there. Try again, or ask Coach Kingsley.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Banner tone="lock" title="This cannot be undone">
          Deleting your account signs you out for good and removes your login from
          {' '}{user?.email ?? 'this app'}. There is no way to restore it. Coach Kingsley would
          have to invite you again.
        </Banner>

        <Card>
          <CardTitle>What is deleted</CardTitle>
          <Body>
            Your login and your notification settings.
            {role === 'parent'
              ? ` Training consent for ${names.player.split(' ')[0]} is switched off first, so their thread locks rather than carrying on with nobody reading it.`
              : ''}
          </Body>
        </Card>

        <Card>
          <CardTitle>What stays</CardTitle>
          <Body>
            Messages already sent stay where they are. Nobody can delete one, not you and
            not Coach Kingsley. A conversation a guardian was promised she could read is
            worth nothing if either side can edit it afterwards.
            {'\n\n'}
            {names.player.split(' ')[0]}’s athlete record belongs to the coach. Ask him to
            remove it, and everything on it goes with it.
          </Body>
        </Card>

        <Text style={s.label}>Confirm your password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          placeholder="Your password"
          placeholderTextColor={color.textFaint}
          accessibilityLabel="Password"
          onSubmitEditing={submit}
          returnKeyType="go"
        />

        {error ? (
          <Text style={s.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <View style={{ height: 18 }} />
        <Button
          label="Delete my account"
          onPress={submit}
          busy={busy}
          disabled={password.length === 0}
        />
        <View style={{ height: 10 }} />
        <Button label="Keep my account" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  pad: { padding: 16, paddingBottom: 32 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: color.textFaint,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: semantic.surfaceInput,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    borderRadius: radius.input,
    color: color.chalk,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  error: { marginTop: 14, color: color.redHot, fontSize: 13.5, lineHeight: 19 },
});

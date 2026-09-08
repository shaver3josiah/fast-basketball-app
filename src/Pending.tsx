import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from './session';
import { Button } from './ui';
import { color, semantic, type } from './theme';

/**
 * The two ways an account can be real and still have nothing to show.
 *
 * Both were previously invisible: you signed in successfully and landed on an app with
 * no threads, no calendar and no explanation, which reads as "the app is broken" rather
 * than "you have one step left". Saying which of the two it is, and what to do, is the
 * whole job of this screen.
 */
export function Pending() {
  const { user, needsVerification, resendVerification, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const email = user?.email ?? 'your address';

  async function resend() {
    setBusy(true);
    try {
      await resendVerification();
      setSent(true);
    } catch {
      // Firebase rate-limits this. Saying "sent" anyway would be a lie, so say nothing
      // changed and let them try again.
      setSent(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[s.page, { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 24 }]}>
      <Text style={s.bolt}>⚡</Text>

      {needsVerification ? (
        <>
          <Text style={s.h1}>Confirm your email</Text>
          <Text style={s.body}>
            We sent a link to {email}. Open it, then sign in again.
          </Text>
          <Text style={s.small}>
            Confirming the address is what connects you to your athlete. It is also what stops
            someone else claiming your place using an address that is not theirs — so there is no
            way past this step.
          </Text>
          <View style={{ height: 20 }} />
          <Button
            label={sent ? 'Sent — check your inbox' : 'Resend the link'}
            onPress={resend}
            busy={busy}
            disabled={sent}
          />
        </>
      ) : (
        <>
          <Text style={s.h1}>Nearly there</Text>
          <Text style={s.body}>
            Your account works, but Coach Kingsley has not added {email} to an athlete yet.
          </Text>
          <Text style={s.small}>
            He connects each family by email address. If you signed up with a different address from
            the one you gave him, sign out and create your account with that one instead — or text
            him on (503) 686-8371.
          </Text>
        </>
      )}

      <View style={{ flex: 1 }} />
      <Button label="Sign out" onPress={signOut} />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage, paddingHorizontal: 24 },
  bolt: { fontSize: 30, color: color.fastRed, marginBottom: 10 },
  h1: { fontSize: 30, fontWeight: '900', color: color.bone, letterSpacing: -0.5, marginBottom: 12 },
  body: { ...type.body, fontSize: 16, lineHeight: 23, marginBottom: 16 },
  small: { ...type.meta, lineHeight: 18 },
});

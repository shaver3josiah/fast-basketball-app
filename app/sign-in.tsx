import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../src/session';
import { isConfigured } from '../src/firebase';
import { Button } from '../src/ui';
import { color, radius, semantic, type } from '../src/theme';

export default function SignIn() {
  const { user, signIn } = useSession();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Redirect href="/(tabs)" />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e: unknown) {
      // Firebase returns auth/invalid-credential for a wrong password AND for an
      // unknown address, deliberately, so an attacker cannot enumerate accounts.
      // The message says the same thing rather than leaking which one it was.
      const code = (e as { code?: string })?.code ?? '';
      setError(
        code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
          ? 'That email and password do not match an account.'
          : code === 'auth/network-request-failed'
            ? 'No connection. Check your signal and try again.'
            : code === 'auth/too-many-requests'
              ? 'Too many attempts. Wait a minute and try again.'
              : 'Could not sign in. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.inner, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.bolt}>⚡</Text>
        <Text style={s.wordmark}>FAST</Text>
        <Text style={s.sub}>BASKETBALL</Text>
        <Text style={s.lede}>Coach, parent, and athlete — one place. Sign in with the account Coach Kingsley set up for you.</Text>

        {!isConfigured && (
          <View style={s.notice}>
            <Text style={s.noticeText}>
              No Firebase project is configured. Copy .env.example to .env and fill it in, or set
              EXPO_PUBLIC_USE_EMULATOR=1 and run the local emulator.
            </Text>
          </View>
        )}

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          placeholder="you@example.com"
          placeholderTextColor={color.textLabel}
          accessibilityLabel="Email"
        />

        <Text style={s.label}>Password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          placeholder="••••••••"
          placeholderTextColor={color.textLabel}
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
        <Button label="Sign in" onPress={submit} busy={busy} disabled={!email || !password} />

        <Link href="/sign-up" asChild>
          <Pressable accessibilityRole="link" style={s.linkRow}>
            <Text style={s.link}>New here? Create your account</Text>
          </Pressable>
        </Link>

        <Text style={s.foot}>
          Trouble getting in? Text Coach Kingsley at (503) 686-8371.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  inner: { paddingHorizontal: 24 },
  bolt: { fontSize: 30, color: color.fastRed, marginBottom: 6 },
  wordmark: {
    fontSize: 46,
    lineHeight: 48,
    fontWeight: '900',
    color: color.bone,
    letterSpacing: -1,
    fontStyle: 'italic',
  },
  sub: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 6,
    color: color.fastRed,
    marginBottom: 18,
  },
  lede: { ...type.body, marginBottom: 26 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: color.textLabel,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: semantic.surfaceInput,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.input,
    color: color.chalk,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  error: { marginTop: 14, color: color.redHot, fontSize: 13.5, lineHeight: 19 },
  notice: {
    backgroundColor: 'rgba(230,12,32,0.07)',
    borderWidth: 1,
    borderColor: color.redLine,
    borderRadius: radius.card,
    padding: 12,
    marginBottom: 8,
  },
  noticeText: { color: color.textBody, fontSize: 12.5, lineHeight: 18 },
  linkRow: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  link: { color: color.redHot, fontSize: 14, fontWeight: '700' },
  foot: { ...type.meta, marginTop: 14, textAlign: 'center' },
});

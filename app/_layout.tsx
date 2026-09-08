import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session';
import { color, semantic } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        {/* Light glyphs: every screen sits on court black, in both system themes. */}
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: semantic.surfaceBand },
            headerTintColor: color.redHot,
            headerTitleStyle: { color: color.chalk, fontWeight: '800' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: semantic.surfacePage },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="sign-up" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="thread/[id]" options={{ title: 'Messages' }} />
          <Stack.Screen name="workflow/[id]" options={{ title: 'Workflow' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

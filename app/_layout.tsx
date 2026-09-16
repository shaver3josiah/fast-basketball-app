import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session';
import { color, semantic } from '../src/theme';

export default function RootLayout() {
  return (
    // react-native-gesture-handler needs this at the root or every gesture below it
    // silently does nothing. The calendar drag is the only consumer today.
    <GestureHandlerRootView style={{ flex: 1 }}>
    {/* Every keyboard-aware component below reads the keyboard through this provider,
        and without it they render but never move. It replaces React Native's own
        KeyboardAvoidingView, which cannot work on this app: Android 15 and up force
        edge to edge, the window no longer resizes under the keyboard, and the built-in
        component has nothing left to measure. See src/ui.tsx KeyboardPad. */}
    <KeyboardProvider>
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
          <Stack.Screen name="roster" options={{ title: 'Roster' }} />
          <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
          <Stack.Screen name="schedule" options={{ title: 'Add to the calendar' }} />
          <Stack.Screen name="athlete" options={{ title: 'Athlete' }} />
          <Stack.Screen name="thread/[id]" options={{ title: 'Messages' }} />
          <Stack.Screen name="workflow/[id]" options={{ title: 'Workflow' }} />
          <Stack.Screen name="train/[id]" options={{ title: 'Session' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

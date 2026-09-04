import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Linking from 'expo-linking';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/firebase';
import { useSession } from '../../src/session';
import { saveWorkflowAnswers, subscribeSavedWorkflows } from '../../src/data';
import { COLLECT_SCRIPT, bridgeScript } from '../../src/workflowBridge';
import type { SavedWorkflow, Workflow } from '../../src/types';
import { Button, Loading } from '../../src/ui';
import { color, semantic, type } from '../../src/theme';

export default function WorkflowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { athlete, role } = useSession();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);

  const [workflow, setWorkflow] = useState<Workflow | null | undefined>(undefined);
  const [saved, setSaved] = useState<SavedWorkflow | undefined>();
  const [seeded, setSeeded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'workflows', id), (snap) =>
      setWorkflow(snap.exists() ? ({ id: snap.id, ...snap.data() } as Workflow) : null)
    );
  }, [id]);

  useEffect(() => {
    if (!athlete?.id) {
      setSeeded(true);
      return;
    }
    return subscribeSavedWorkflows(athlete.id, (all) => {
      // Seed the WebView from the saved answers exactly once. Re-injecting on every
      // snapshot would stomp on whatever the athlete is typing right now.
      setSaved((prev) => prev ?? all[id!]);
      setSeeded(true);
    });
  }, [athlete?.id, id]);

  function onMessage(e: WebViewMessageEvent) {
    let payload: { type?: string; answers?: Record<string, string | boolean | number> };
    try {
      payload = JSON.parse(e.nativeEvent.data);
    } catch {
      return; // Not ours. The page is the coach's HTML and may post anything.
    }
    if (payload.type !== 'wfstate' || !athlete?.id || !id) return;
    saveWorkflowAnswers(athlete.id, id, payload.answers ?? {})
      .then(() => setStatus('Saved to your workflows'))
      .catch(() => setStatus('Could not save. Check your connection.'));
  }

  if (workflow === undefined || !seeded) return <Loading label="Opening workflow…" />;
  if (workflow === null) {
    return (
      <View style={s.missing}>
        <Stack.Screen options={{ title: 'Workflow' }} />
        <Text style={type.body}>That workflow is no longer published.</Text>
      </View>
    );
  }

  return (
    <View style={s.page}>
      <Stack.Screen options={{ title: workflow.name }} />

      <View style={s.bar}>
        <View style={s.live} />
        <Text style={s.barText}>Rendered in-app · sandboxed · no download</Text>
      </View>

      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{
          html: workflow.html,
          // Android needs a baseUrl or the page gets an opaque origin that blocks
          // inline script and storage. iOS defaults to about:blank and behaves.
          ...(Platform.OS === 'android' ? { baseUrl: 'https://localhost/' } : {}),
        }}
        // The document is Blake's own HTML, so this is containment, not distrust:
        // scripts run (the forms need them) but the page gets no file system, no
        // cross-origin reach, and no way to navigate the frame somewhere else.
        javaScriptEnabled
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        setSupportMultipleWindows={false}
        injectedJavaScript={bridgeScript(saved?.answers)}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => {
          // The initial render is about:blank / the baseUrl. Anything else is a link
          // the athlete tapped: hand it to the system browser and stay put.
          if (req.url === 'about:blank' || req.url.startsWith('https://localhost/')) return true;
          Linking.openURL(req.url).catch(() => {});
          return false;
        }}
        style={s.web}
      />

      <View style={[s.saveBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Text style={s.hint} accessibilityLiveRegion="polite">
          {status ??
            (role === 'coach'
              ? 'Athletes fill this in; their answers save to their own account.'
              : saved
                ? 'Saved earlier — pick up where you left off.'
                : 'Your answers save to your account, not the coach’s file.')}
        </Text>
        {role !== 'coach' && (
          <Button
            label="Save"
            onPress={() => {
              setStatus(null);
              webRef.current?.injectJavaScript(COLLECT_SCRIPT);
            }}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  missing: { flex: 1, backgroundColor: semantic.surfacePage, padding: 24, justifyContent: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: semantic.surfaceBand,
  },
  live: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.miamiTeal },
  barText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: color.textDim,
  },
  web: { flex: 1, backgroundColor: color.bone },
  saveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
    backgroundColor: semantic.surfaceBand,
  },
  hint: { flex: 1, ...type.meta, lineHeight: 17 },
});

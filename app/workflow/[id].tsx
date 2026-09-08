import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Linking from 'expo-linking';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../src/firebase';
import { useSession, useNames } from '../../src/session';
import { saveWorkflowAnswers, subscribeSubmissions } from '../../src/data';
import { periodLabel, submissionId } from '../../src/period';
import { COLLECT_SCRIPT, bridgeScript } from '../../src/workflowBridge';
import type { SavedWorkflow, Workflow } from '../../src/types';
import { Button, Loading } from '../../src/ui';
import { color, semantic, type } from '../../src/theme';

export default function WorkflowScreen() {
  const { id, athlete: athleteParam, sid } = useLocalSearchParams<{
    id: string;
    athlete?: string;
    sid?: string;
  }>();
  const { role, athlete, athletesById } = useSession();
  const names = useNames();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);

  const [workflow, setWorkflow] = useState<Workflow | null | undefined>(undefined);
  const [submissions, setSubmissions] = useState<Record<string, SavedWorkflow> | null>(null);
  const [seed, setSeed] = useState<Record<string, unknown> | undefined>();
  const [seeded, setSeeded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Whose submission are we looking at? The coach arrives with an explicit athlete;
  // a family only ever has its own.
  const targetAthleteId = athleteParam || athlete?.id || '';
  const targetAthlete = athletesById[targetAthleteId] ?? athlete;

  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'workflows', id), (snap) =>
      setWorkflow(snap.exists() ? ({ id: snap.id, ...snap.data() } as Workflow) : null)
    );
  }, [id]);

  useEffect(() => {
    if (!targetAthleteId) {
      setSubmissions({});
      return;
    }
    return subscribeSubmissions(targetAthleteId, setSubmissions);
  }, [targetAthleteId]);

  const cadence = workflow?.cadence ?? 'once';

  // With no sid, open the CURRENT period — that is what "fill in this week's evaluation"
  // means. With one, open exactly that submission, which may be a past period.
  const openId = useMemo(
    () => sid || (workflow ? submissionId(workflow.id, cadence, new Date()) : ''),
    [sid, workflow?.id, cadence]
  );

  useEffect(() => {
    if (!submissions || !openId) return;
    // Seed the WebView once. Re-injecting on every snapshot would stomp on whatever the
    // athlete is typing right now.
    setSeed((prev) => prev ?? submissions[openId]?.answers ?? {});
    setSeeded(true);
  }, [submissions, openId]);

  const current = submissions?.[openId];
  const isCurrentPeriod = !sid || (workflow ? openId === submissionId(workflow.id, cadence, new Date()) : false);

  /**
   * The coach reads submissions; he never authors them. A family may write its own
   * athlete's answers — the parent as well as the athlete, because under-13s are meant
   * to use the guardian's account rather than have a login of their own.
   * Past periods are read-only: last week's evaluation is a record, not a draft.
   */
  const mayWrite =
    role !== 'coach' && targetAthleteId === athlete?.id && !!targetAthleteId && isCurrentPeriod;

  function onMessage(e: WebViewMessageEvent) {
    let payload: { type?: string; answers?: Record<string, string | boolean | number> };
    try {
      payload = JSON.parse(e.nativeEvent.data);
    } catch {
      return; // Not ours. The page is the coach's HTML and may post anything.
    }
    if (payload.type !== 'wfstate' || !targetAthleteId || !workflow) return;
    saveWorkflowAnswers(targetAthleteId, workflow, payload.answers ?? {}, new Date())
      .then(() => setStatus('Saved'))
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

  const period = periodLabel(cadence, current?.periodKey ?? (sid ? '' : ''));
  const heading = period ? `${workflow.name} · ${period}` : workflow.name;

  return (
    <View style={s.page}>
      <Stack.Screen options={{ title: workflow.name }} />

      <View style={s.bar}>
        <View style={s.live} />
        <Text style={s.barText} numberOfLines={1}>
          {role === 'coach' && targetAthlete
            ? `${targetAthlete.playerName} · read only`
            : mayWrite
              ? 'Rendered in-app · sandboxed · no download'
              : 'Read only'}
        </Text>
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
        injectedJavaScript={bridgeScript(seed)}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => {
          // The initial render is about:blank / the baseUrl. Anything else is a link
          // someone tapped: hand it to the system browser and stay put.
          if (req.url === 'about:blank' || req.url.startsWith('https://localhost/')) return true;
          Linking.openURL(req.url).catch(() => {});
          return false;
        }}
        style={s.web}
      />

      <View style={[s.saveBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Text style={s.hint} accessibilityLiveRegion="polite">
          {status ?? hintFor({ role, mayWrite, isCurrentPeriod, saved: !!current, heading, names })}
        </Text>
        {mayWrite && (
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

function hintFor({
  role,
  mayWrite,
  isCurrentPeriod,
  saved,
  heading,
  names,
}: {
  role: string;
  mayWrite: boolean;
  isCurrentPeriod: boolean;
  saved: boolean;
  heading: string;
  names: { player: string };
}): string {
  if (role === 'coach') return `${heading} — the athlete's own answers.`;
  if (!isCurrentPeriod) return `${heading}. Past entries are a record, not a draft.`;
  if (!mayWrite) return `${names.player.split(' ')[0]}’s answers. You can read them, not change them.`;
  return saved ? 'Saved earlier — pick up where you left off.' : 'Your answers save to your account, not the coach’s file.';
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
    flex: 1,
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

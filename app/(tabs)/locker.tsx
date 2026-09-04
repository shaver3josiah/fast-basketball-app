import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../../src/session';
import { subscribeWorkflows, subscribeSavedWorkflows } from '../../src/data';
import { summarize } from '../../src/workflowBridge';
import type { SavedWorkflow, Workflow } from '../../src/types';
import { Banner, Empty, Eyebrow, Screen } from '../../src/ui';
import { color, radius, semantic, type } from '../../src/theme';

export default function Locker() {
  const { role, athlete } = useSession();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [saved, setSaved] = useState<Record<string, SavedWorkflow>>({});

  useEffect(() => subscribeWorkflows(setWorkflows), []);
  useEffect(() => {
    if (!athlete?.id) return;
    return subscribeSavedWorkflows(athlete.id, setSaved);
  }, [athlete?.id]);

  const savedIds = Object.keys(saved);

  return (
    <Screen>
      {role === 'coach' && (
        <Banner tone="ok" title="You publish here">
          Upload an HTML workflow and it renders inside the app. Nobody downloads anything.
        </Banner>
      )}

      <Eyebrow>Training workflows</Eyebrow>

      {workflows === null && <Text style={type.meta}>Loading…</Text>}
      {workflows?.length === 0 && (
        <Empty icon="▤">Nothing published yet.{'\n'}Coach Kingsley posts workflows here.</Empty>
      )}

      {workflows?.map((w) => (
        <WorkflowRow
          key={w.id}
          workflow={w}
          saved={saved[w.id]}
          onPress={() => router.push(`/workflow/${w.id}`)}
        />
      ))}

      <Eyebrow style={{ marginTop: 22 }}>My saved workflows</Eyebrow>
      {savedIds.length === 0 ? (
        <Empty icon="▤">Nothing saved yet.{'\n'}Open a workflow, fill it in, hit Save.</Empty>
      ) : (
        savedIds.map((id) => {
          const w = workflows?.find((x) => x.id === id);
          if (!w) return null;
          return (
            <WorkflowRow
              key={`saved-${id}`}
              workflow={w}
              saved={saved[id]}
              accent
              onPress={() => router.push(`/workflow/${id}`)}
            />
          );
        })
      )}
    </Screen>
  );
}

function WorkflowRow({
  workflow,
  saved,
  accent,
  onPress,
}: {
  workflow: Workflow;
  saved?: SavedWorkflow;
  accent?: boolean;
  onPress: () => void;
}) {
  const when = saved?.updatedAt?.toDate?.();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open workflow: ${workflow.name}`}
      style={({ pressed }) => [
        s.row,
        accent && { borderColor: color.tealLine },
        pressed && { backgroundColor: color.inkHover },
      ]}
    >
      <View
        style={[
          s.icon,
          accent && { backgroundColor: color.tealTint, borderColor: color.tealLine },
        ]}
      >
        <Text style={[s.iconText, accent && { color: color.miamiTeal }]}>
          {accent ? '✓' : 'HTML'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{workflow.name}</Text>
        <Text style={s.meta}>
          {accent && saved
            ? `${summarize(saved.answers ?? {})}${when ? ` · saved ${when.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}`
            : `${workflow.publishedBy ?? 'Coach Kingsley'} · ${formatSize(workflow.sizeBytes ?? workflow.html?.length ?? 0)}`}
        </Text>
        {!accent && saved && (
          <View style={s.pill}>
            <Text style={s.pillText}>✓ Saved</Text>
          </View>
        )}
      </View>
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

const formatSize = (bytes: number) =>
  bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.cardLg,
    padding: 13,
    marginBottom: 10,
    minHeight: 64,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.chip,
    backgroundColor: color.redTint,
    borderWidth: 1,
    borderColor: color.redLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 10, fontWeight: '800', color: color.redHot, letterSpacing: 0.5 },
  name: { fontSize: 15, fontWeight: '700', color: color.chalk },
  meta: { ...type.meta, marginTop: 3 },
  pill: {
    alignSelf: 'flex-start',
    marginTop: 7,
    backgroundColor: color.tealTint,
    borderWidth: 1,
    borderColor: color.tealLine,
    borderRadius: radius.badge,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pillText: { fontSize: 10.5, fontWeight: '700', color: color.miamiTeal },
  chev: { fontSize: 22, color: color.textLabel, paddingHorizontal: 2 },
});

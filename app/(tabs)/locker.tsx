import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession, useNames } from '../../src/session';
import { subscribeWorkflows, subscribeSubmissions, subscribeRosterSubmissions } from '../../src/data';
import { periodLabel } from '../../src/period';
import { summarize } from '../../src/workflowBridge';
import type { SavedWorkflow, Workflow } from '../../src/types';
import { Banner, Empty, Eyebrow, Screen } from '../../src/ui';
import { color, radius, semantic, type } from '../../src/theme';

const CADENCE_LABEL: Record<string, string> = {
  daily: 'Every session',
  weekly: 'Every week',
  quarterly: 'Every quarter',
};

export default function Locker() {
  const { role, athlete, athletesById } = useSession();
  const names = useNames();
  const router = useRouter();

  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [mine, setMine] = useState<Record<string, SavedWorkflow>>({});
  const [roster, setRoster] = useState<Record<string, Record<string, SavedWorkflow>>>({});

  useEffect(() => subscribeWorkflows(setWorkflows), []);

  // A family watches one athlete; the coach watches the whole roster.
  useEffect(() => {
    if (role === 'coach' || !athlete?.id) return;
    return subscribeSubmissions(athlete.id, setMine);
  }, [role, athlete?.id]);

  const rosterIds = useMemo(() => Object.keys(athletesById), [athletesById]);
  useEffect(() => {
    if (role !== 'coach' || rosterIds.length === 0) return;
    return subscribeRosterSubmissions(rosterIds, setRoster);
  }, [role, rosterIds.join(',')]);

  const byWorkflow = useMemo(() => indexByWorkflow(workflows ?? []), [workflows]);

  return (
    <Screen>
      {role === 'coach' && (
        <Banner tone="ok" title="You publish here">
          Upload an HTML workflow and it renders inside the app. Nobody downloads anything.
        </Banner>
      )}
      {role === 'player' && (
        // The athlete is told, in the same plain terms the messaging banner uses. A form
        // his coach assigns and his guardian reads must never look private to him.
        <Banner tone="watch" title="Coach Kingsley and your parent read these">
          What you write here is not private. That is the point — it is how the two of them
          see the work you are putting in.
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
          submissionCount={
            role === 'coach' ? 0 : Object.values(mine).filter((s) => s.workflowId === w.id).length
          }
          onPress={() =>
            router.push({
              pathname: '/workflow/[id]',
              params: role === 'coach' ? { id: w.id } : { id: w.id, athlete: athlete?.id ?? '' },
            })
          }
        />
      ))}

      {role === 'coach' ? (
        <>
          <Eyebrow style={{ marginTop: 22 }}>Submissions</Eyebrow>
          {rosterIds.length === 0 && <Empty icon="▤">No athletes on the roster yet.</Empty>}
          {rosterIds.map((aid) => {
            const subs = sortSubmissions(roster[aid] ?? {});
            return (
              <View key={aid} style={{ marginBottom: 14 }}>
                <Text style={s.rosterName}>{athletesById[aid]?.playerName ?? aid}</Text>
                {subs.length === 0 ? (
                  <Text style={[type.meta, { marginTop: 4 }]}>Nothing submitted yet.</Text>
                ) : (
                  subs.map(([sid, sub]) => (
                    <SubmissionRow
                      key={sid}
                      submission={sub}
                      workflow={byWorkflow[sub.workflowId ?? '']}
                      onPress={() =>
                        router.push({
                          pathname: '/workflow/[id]',
                          params: { id: sub.workflowId ?? '', athlete: aid, sid },
                        })
                      }
                    />
                  ))
                )}
              </View>
            );
          })}
        </>
      ) : (
        <>
          <Eyebrow style={{ marginTop: 22 }}>
            {role === 'parent' ? `${names.player.split(' ')[0]}’s submissions` : 'My submissions'}
          </Eyebrow>
          {sortSubmissions(mine).length === 0 ? (
            <Empty icon="▤">
              Nothing saved yet.{'\n'}Open a workflow, fill it in, hit Save.
            </Empty>
          ) : (
            sortSubmissions(mine).map(([sid, sub]) => (
              <SubmissionRow
                key={sid}
                submission={sub}
                workflow={byWorkflow[sub.workflowId ?? '']}
                onPress={() =>
                  router.push({
                    pathname: '/workflow/[id]',
                    params: { id: sub.workflowId ?? '', athlete: athlete?.id ?? '', sid },
                  })
                }
              />
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const indexByWorkflow = (ws: Workflow[]): Record<string, Workflow> =>
  Object.fromEntries(ws.map((w) => [w.id, w]));

/** Newest first. A submission with no timestamp yet (still being written) sorts to the top. */
const sortSubmissions = (subs: Record<string, SavedWorkflow>): [string, SavedWorkflow][] =>
  Object.entries(subs).sort(
    ([, a], [, b]) => (b.updatedAt?.toMillis() ?? Infinity) - (a.updatedAt?.toMillis() ?? Infinity)
  );

function WorkflowRow({
  workflow,
  submissionCount,
  onPress,
}: {
  workflow: Workflow;
  submissionCount: number;
  onPress: () => void;
}) {
  const cadence = workflow.cadence ?? 'once';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open workflow: ${workflow.name}`}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: color.inkHover }]}
    >
      <View style={s.icon}>
        <Text style={s.iconText}>HTML</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{workflow.name}</Text>
        <Text style={s.meta}>
          {CADENCE_LABEL[cadence] ?? 'One-off'} · {formatSize(workflow.sizeBytes ?? 0)}
        </Text>
        {submissionCount > 0 && (
          <View style={s.pill}>
            <Text style={s.pillText}>
              ✓ {submissionCount} submitted
            </Text>
          </View>
        )}
      </View>
      <Text style={s.chev}>›</Text>
    </Pressable>
  );
}

function SubmissionRow({
  submission,
  workflow,
  onPress,
}: {
  submission: SavedWorkflow;
  workflow?: Workflow;
  onPress: () => void;
}) {
  const when = submission.updatedAt?.toDate?.();
  const period = periodLabel(workflow?.cadence ?? 'once', submission.periodKey ?? '');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open submission: ${workflow?.name ?? 'workflow'}${period ? `, ${period}` : ''}`}
      style={({ pressed }) => [
        s.row,
        { borderColor: color.tealLine },
        pressed && { backgroundColor: color.inkHover },
      ]}
    >
      <View style={[s.icon, { backgroundColor: color.tealTint, borderColor: color.tealLine }]}>
        <Text style={[s.iconText, { color: color.miamiTeal }]}>✓</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>
          {workflow?.name ?? 'Workflow'}
          {period ? ` · ${period}` : ''}
        </Text>
        <Text style={s.meta}>
          {summarize(submission.answers ?? {})}
          {when ? ` · saved ${when.toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}
        </Text>
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
  rosterName: {
    fontSize: 13,
    fontWeight: '800',
    color: color.redHot,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
});

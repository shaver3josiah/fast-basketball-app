import { useEffect, useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession, useNames } from '../../src/session';
import {
  subscribeWorkflows,
  subscribeSubmissions,
  subscribeRosterSubmissions,
  subscribeRosterWorkoutLogs,
} from '../../src/data';
import { periodLabel } from '../../src/period';
import { summarize } from '../../src/workflowBridge';
import { isBuiltin } from '../../src/worksheets.generated';
import type { SavedWorkflow, Workflow, WorkoutLogEntry } from '../../src/types';
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
  const [logs, setLogs] = useState<Record<string, Record<string, WorkoutLogEntry>>>({});

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

  // The other half of "how is this athlete doing": what they actually trained. Same
  // per-athlete fan-out as the submissions above, and the same rule identity allows it.
  useEffect(() => {
    if (role !== 'coach' || rosterIds.length === 0) return;
    return subscribeRosterWorkoutLogs(rosterIds, setLogs);
  }, [role, rosterIds.join(',')]);

  const byWorkflow = useMemo(() => indexByWorkflow(workflows ?? []), [workflows]);

  return (
    <Screen>
      {role === 'coach' && (
        // This used to promise an upload button. There is none: a worksheet arrives
        // either baked into a release by `npm run worksheets` or as a document in the
        // `workflows` collection, and a published document with the same id replaces
        // the built-in copy. Telling the coach he can upload one sent him looking for
        // a control that was never built. The repo path lives in this comment and not
        // in the copy below, because Blake reads that banner on a phone and cannot open
        // docs/WORKSHEETS.md from it.
        <Banner tone="ok" title="How a worksheet gets here">
          There is no upload button. Worksheets are HTML files your developer adds to the
          app, so send a finished one to him. Ask him for the worksheet guide as well: it
          has prompts you can paste into Gemini to write a new one.
        </Banner>
      )}
      {role === 'player' && (
        // The athlete is told, in the same plain terms the messaging banner uses. A form
        // his coach assigns and his guardian reads must never look private to him.
        <Banner tone="watch" title="Coach Kingsley and your parent read these">
          What you write here is not private. That is the point. It is how the two of them
          see the work you are putting in.
        </Banner>
      )}

      <Eyebrow>Training workflows</Eyebrow>

      {workflows === null && <Text style={type.meta}>Loading…</Text>}
      {workflows?.length === 0 && (
        <Empty icon="document-text-outline">Nothing published yet.{'\n'}Coach Kingsley posts workflows here.</Empty>
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
          <Eyebrow style={{ marginTop: 22 }}>Progress</Eyebrow>
          {rosterIds.length === 0 && <Empty icon="people-outline">No athletes on the roster yet.</Empty>}
          {rosterIds.map((aid) => {
            const subs = sortSubmissions(roster[aid] ?? {});
            const done = sortLog(logs[aid] ?? {});
            return (
              <View key={aid} style={{ marginBottom: 18 }}>
                <Text style={s.rosterName}>{athletesById[aid]?.playerName ?? aid}</Text>

                {/* What they trained. The athlete writes this when they finish a session
                    on the timer; it is the only completion record the coach can read. */}
                <Text style={s.progLabel}>
                  {done.length === 0
                    ? 'No workouts finished on the timer yet'
                    : `${done.length} workout${done.length === 1 ? '' : 's'} finished on the timer`}
                </Text>
                {done.slice(0, 3).map((w) => (
                  <View key={w.id} style={s.logRow}>
                    <Ionicons name="checkmark-circle" size={15} color={color.miamiTeal} />
                    <Text style={s.logName} numberOfLines={1}>
                      {w.name}
                    </Text>
                    {/* A reps-only workout runs no clock, so it logs zero minutes and
                        "0 min" would read as if nothing happened. The blocks it ticked
                        off are the honest measure of that session. */}
                    <Text style={s.logMeta}>
                      {w.blocksTotal ? `${w.blocksDone}/${w.blocksTotal} blocks` : ''}
                      {w.minutes > 0 ? `${w.blocksTotal ? ' · ' : ''}${w.minutes} min` : ''}
                      {when(w.completedAt) ? ` · ${when(w.completedAt)}` : ''}
                    </Text>
                  </View>
                ))}
                {done.length > 3 ? (
                  <Text style={s.progMore}>and {done.length - 3} more</Text>
                ) : null}

                <Text style={s.progLabel}>Worksheets</Text>
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
            <Empty icon="document-text-outline">
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

/** Newest first, by the server clock the rule pinned. */
const sortLog = (log: Record<string, WorkoutLogEntry>): WorkoutLogEntry[] =>
  Object.values(log).sort(
    (a, b) => (b.completedAt?.toMillis() ?? 0) - (a.completedAt?.toMillis() ?? 0)
  );

/** "today" / "yesterday" / a date, for a coach scanning a column of them. */
function when(ts: WorkoutLogEntry['completedAt']): string {
  const d = ts?.toDate?.();
  if (!d) return '';
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(d)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
      style={({ pressed }) => [s.row, pressed && { backgroundColor: color.ink }]}
    >
      <View style={s.icon}>
        <Text style={s.iconText}>HTML</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{workflow.name}</Text>
        <Text style={s.meta}>
          {CADENCE_LABEL[cadence] ?? 'One-off'} · {formatSize(workflow.sizeBytes ?? 0)}
          {/* The coach did not publish this one and cannot delete it: it ships with the
              app. Saying so is cheaper than him wondering where it came from. */}
          {isBuiltin(workflow.id) ? ' · Built in' : ''}
        </Text>
        {submissionCount > 0 && (
          <View style={s.pill}>
            <Text style={s.pillText}>
              {submissionCount} submitted
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
        pressed && { backgroundColor: color.ink },
      ]}
    >
      <View style={[s.icon, { backgroundColor: color.tealTint, borderColor: color.tealLine }]}>
        <Ionicons name="checkmark" size={17} color={color.miamiTeal} />
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
    borderColor: semantic.borderStrong,
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
    borderColor: color.fastRed,
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
  chev: { fontSize: 22, color: color.textDim, paddingHorizontal: 2 },
  progLabel: {
    ...type.eyebrow,
    fontSize: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 },
  logName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: color.chalk },
  logMeta: { fontSize: 11.5, color: color.textDim },
  progMore: { ...type.meta, marginTop: 2 },
  rosterName: {
    fontSize: 13,
    fontWeight: '800',
    color: color.redHot,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
});

import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '../src/session';
import {
  MAX_SCHEDULED,
  canShareWith,
  deleteEvent,
  deleteSeries,
  editEvent,
  projectDates,
  scheduleWorkout,
  subscribeEvents,
  subscribeTemplates,
  updateEvent,
  applyToSeries,
  totalMinutes,
} from '../src/data';
import type { SessionEvent, WorkoutBlock, WorkoutKind, WorkoutTemplate } from '../src/types';
import { Banner, Body, Button, Card, CardTitle, GhostButton, KeyboardPad, Segmented, Stepper } from '../src/ui';
import { SESSION_TYPES, color, radius, semantic, type, type SessionType } from '../src/theme';

const HOME_GYM = 'Salvation Army Fort Lauderdale Corps gym';
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * One screen for putting a workout on a calendar, and for changing it afterwards.
 *
 * New and edit are the same form on purpose. A coach who has just scheduled six weeks
 * of Tuesdays and wants the third one an hour later should not have to learn a second
 * layout to do it, and every field he set is the field he now wants to change.
 */
export default function Schedule() {
  const { role, athletesById } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{
    date?: string;
    athleteId?: string;
    templateId?: string;
    eventId?: string;
    kind?: string;
  }>();

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'coach') return;
    return subscribeTemplates(setTemplates);
  }, [role]);
  useEffect(() => {
    if (role !== 'coach') return;
    return subscribeEvents('coach', null, setEvents);
  }, [role]);

  const editing = params.eventId ? events.find((e) => e.id === params.eventId) : undefined;

  // --- form state -----------------------------------------------------------
  const [athleteIds, setAthleteIds] = useState<string[]>(
    params.athleteId ? [params.athleteId] : []
  );
  const [kind, setKind] = useState<WorkoutKind>(
    params.kind === 'coached' ? 'coached' : 'individual'
  );
  const [sessionType, setSessionType] = useState<SessionType>('skills');
  const [name, setName] = useState('');
  const [location, setLocation] = useState(HOME_GYM);
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([]);
  const [when, setWhen] = useState<Date>(() => {
    const base = params.date ? new Date(params.date) : new Date();
    const d = startOfDay(base);
    d.setHours(16, 0, 0, 0);
    return d;
  });
  const [duration, setDuration] = useState(60);
  const [notes, setNotes] = useState('');
  const [everyWeeks, setEveryWeeks] = useState(0); // 0 means it does not repeat
  const [occurrences, setOccurrences] = useState(8);
  const [templateId, setTemplateId] = useState<string | undefined>(params.templateId);
  const [loaded, setLoaded] = useState(false);

  // Fill the form from the template the coach arrived with, once.
  useEffect(() => {
    if (loaded || !params.templateId) return;
    const t = templates.find((x) => x.id === params.templateId);
    if (!t) return;
    applyTemplate(t);
    setLoaded(true);
  }, [templates, params.templateId, loaded]);

  // Fill the form from the event being edited, once it has arrived.
  useEffect(() => {
    if (loaded || !editing) return;
    setAthleteIds([editing.athleteId]);
    setKind(editing.kind ?? 'individual');
    setSessionType(editing.type);
    setName(editing.name);
    setLocation(editing.location);
    setBlocks(editing.blocks ?? []);
    setWhen(editing.startsAt.toDate());
    setDuration(editing.durationMin ?? 60);
    setNotes(editing.notes ?? '');
    setTemplateId(editing.templateId);
    setLoaded(true);
  }, [editing, loaded]);

  function applyTemplate(t: WorkoutTemplate) {
    setTemplateId(t.id);
    setSessionType(t.type);
    setKind(t.kind);
    setBlocks(t.blocks.map((b) => ({ ...b })));
    setDuration(totalMinutes(t.blocks) || 60);
    if (!name.trim()) setName(t.name);
  }

  const dates = useMemo(
    () => projectDates(when, everyWeeks ? occurrences : 1, everyWeeks || 1),
    [when, everyWeeks, occurrences]
  );
  const chosen = athleteIds.map((id) => athletesById[id]).filter(Boolean);
  // A coached session with more than one athlete is ONE document, so the run is one
  // per date. Individual work is one per athlete per date: separate workouts that
  // happen to have been typed in once.
  const sharedSession = kind === 'coached' && chosen.length > 1;
  const writes = dates.length * (sharedSession ? 1 : Math.max(1, chosen.length));
  const roster = Object.values(athletesById);
  // Their guardian has no uid until the family signs up, and the rules refuse a
  // shared session whose membership list is missing one. Individual sessions are
  // fine: their read resolves through a get() and starts working on signup.
  const unshareable = sharedSession ? chosen.filter((a) => !canShareWith(a)) : [];
  const canSave =
    name.trim().length > 0 &&
    chosen.length > 0 &&
    writes <= MAX_SCHEDULED &&
    unshareable.length === 0;

  if (role !== 'coach') return <Redirect href="/(tabs)" />;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await editEvent(editing.id, when, {
          type: sessionType,
          name: name.trim(),
          location: location.trim(),
          kind,
          blocks,
          durationMin: duration,
          notes: notes.trim(),
        });
      } else {
        await scheduleWorkout({
          athletes: athleteIds.map((id) => athletesById[id]).filter(Boolean),
          type: sessionType,
          name,
          location,
          startsAt: when,
          kind,
          blocks,
          durationMin: duration,
          notes,
          templateId,
          occurrences: everyWeeks ? occurrences : 1,
          everyWeeks: everyWeeks || 1,
        });
      }
      router.back();
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes('limit')
          ? e.message
          : 'That did not save. Check your connection and try again.'
      );
      setBusy(false);
    }
  }

  return (
    <KeyboardPad header style={s.page}>
    <ScrollView style={s.page} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: editing ? 'Edit session' : 'Add to the calendar' }} />

      {/* --- who ------------------------------------------------------------ */}
      <Text style={s.label}>{editing ? 'Athlete' : 'Who is training'}</Text>
      {roster.length === 0 ? (
        <Body>Nobody is on the roster yet. Invite a family first.</Body>
      ) : (
        <View style={s.wrap}>
          {roster.map((a) => {
            const on = athleteIds.includes(a.id);
            return (
              <Pressable
                key={a.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !!editing }}
                accessibilityLabel={a.playerName}
                disabled={!!editing}
                onPress={() =>
                  setAthleteIds((ids) =>
                    ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id]
                  )
                }
                style={({ pressed }) => [
                  s.pill,
                  on && s.pillOn,
                  pressed && !on && { backgroundColor: color.inkHover },
                  !!editing && { opacity: 0.6 },
                ]}
              >
                {on ? <Ionicons name="checkmark" size={14} color={color.bone} /> : null}
                <Text style={[s.pillText, on && { color: color.bone }]}>{a.playerName}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!editing && chosen.length > 1 && (
        <Text style={s.hint}>
          {sharedSession
            ? 'One session, shared. Every family on it sees the same row, and cancelling it cancels it for all of them.'
            : 'The same workout goes on each of their calendars separately, as their own session.'}
        </Text>
      )}

      {unshareable.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Banner tone="lock" title="Not yet, for this group">
            {unshareable.map((a) => a.playerName).join(', ')}{' '}
            {unshareable.length === 1 ? 'has' : 'have'} no account on the family side yet,
            and a shared session has to name everyone who may read it. Schedule them
            individually for now, or wait until they sign up.
          </Banner>
        </View>
      )}

      {/* --- from a template ------------------------------------------------ */}
      {!editing && templates.length > 0 && (
        <>
          <Text style={s.label}>Start from a workout</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.wrapRow}>
            {templates.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`Use ${t.name}`}
                onPress={() => applyTemplate(t)}
                style={({ pressed }) => [
                  s.tpl,
                  templateId === t.id && s.tplOn,
                  pressed && { backgroundColor: color.inkHover },
                ]}
              >
                <Ionicons name={SESSION_TYPES[t.type].icon} size={14} color={SESSION_TYPES[t.type].color} />
                <Text style={s.tplName} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={s.tplMin}>{t.totalMinutes} min</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* --- what ----------------------------------------------------------- */}
      <Text style={s.label}>Session name</Text>
      <TextInput
        style={s.input}
        value={name}
        onChangeText={setName}
        placeholder="Ball handling and finishing"
        placeholderTextColor={color.textFaint}
        accessibilityLabel="Session name"
      />

      <Text style={s.label}>Type</Text>
      <View style={s.typeRow}>
        {(Object.keys(SESSION_TYPES) as SessionType[]).map((k) => {
          const t = SESSION_TYPES[k];
          const on = sessionType === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              onPress={() => setSessionType(k)}
              style={({ pressed }) => [
                s.typeBtn,
                on && { borderColor: t.color, backgroundColor: color.inkHover },
                pressed && !on && { backgroundColor: color.inkHover },
              ]}
            >
              <Ionicons name={t.icon} size={17} color={on ? t.color : color.textDim} />
              <Text style={[s.typeLabel, on && { color: color.chalk }]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.label}>Who runs it</Text>
      <Segmented
        label="Who runs it"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'individual', label: 'On their own', icon: 'person-outline' },
          { value: 'coached', label: 'Coached', icon: 'people-outline' },
        ]}
      />

      {/* --- when ----------------------------------------------------------- */}
      <Text style={s.label}>Day</Text>
      <View style={s.dayRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => setWhen((d) => new Date(d.getTime() - 864e5))}
          style={({ pressed }) => [s.dayBtn, pressed && { backgroundColor: color.inkHover }]}
        >
          <Ionicons name="chevron-back" size={18} color={color.chalk} />
        </Pressable>
        <Text style={s.dayText}>
          {when.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => setWhen((d) => new Date(d.getTime() + 864e5))}
          style={({ pressed }) => [s.dayBtn, pressed && { backgroundColor: color.inkHover }]}
        >
          <Ionicons name="chevron-forward" size={18} color={color.chalk} />
        </Pressable>
      </View>

      <Text style={s.label}>Start</Text>
      <TimeStrip value={when} onChange={setWhen} />

      <Text style={s.label}>How long</Text>
      <Stepper label="How long" value={duration} onChange={setDuration} min={15} max={180} step={15} />

      {/* --- projection ----------------------------------------------------- */}
      {!editing && (
        <>
          <Text style={s.label}>Project it out</Text>
          <Segmented
            label="How often it repeats"
            value={String(everyWeeks)}
            onChange={(v) => setEveryWeeks(Number(v))}
            options={[
              { value: '0', label: 'Just once' },
              { value: '1', label: 'Every week' },
              { value: '2', label: 'Every 2 weeks' },
            ]}
          />
          {everyWeeks > 0 && (
            <View style={{ marginTop: 10 }}>
              <Stepper
                label="How many sessions"
                value={occurrences}
                onChange={setOccurrences}
                min={2}
                max={52}
                step={1}
                suffix={occurrences === 1 ? 'session' : 'sessions'}
              />
            </View>
          )}

          <Card style={{ marginTop: 12 }}>
            <CardTitle>What this writes</CardTitle>
            <Body>
              {writes} {writes === 1 ? 'session' : 'sessions'}
              {chosen.length > 1
                ? sharedSession
                  ? `, shared by ${chosen.length} athletes`
                  : `, across ${chosen.length} athletes`
                : ''}
              .
            </Body>
            <Text style={s.dates}>
              {dates
                .slice(0, 6)
                .map((d) => d.toLocaleDateString([], { day: 'numeric', month: 'short' }))
                .join(', ')}
              {dates.length > 6 ? ` and ${dates.length - 6} more, to ${dates[dates.length - 1].toLocaleDateString([], { day: 'numeric', month: 'short' })}` : ''}
            </Text>
            {writes > MAX_SCHEDULED && (
              <Text style={s.error}>
                That is more than {MAX_SCHEDULED} sessions in one go. Shorten the run or
                schedule fewer athletes at a time.
              </Text>
            )}
          </Card>
        </>
      )}

      {/* --- detail --------------------------------------------------------- */}
      <Text style={s.label}>Where</Text>
      <TextInput
        style={s.input}
        value={location}
        onChangeText={setLocation}
        placeholder={HOME_GYM}
        placeholderTextColor={color.textFaint}
        accessibilityLabel="Where"
      />

      {blocks.length > 0 && (
        <>
          <Text style={s.label}>The workout</Text>
          <Card>
            {blocks.map((b, i) => (
              <View key={b.id} style={s.blockRow}>
                <Text style={s.blockNum}>{i + 1}</Text>
                <Text style={s.blockName}>{b.name}</Text>
                <Text style={s.blockMin}>{b.minutes} min</Text>
              </View>
            ))}
            <Text style={s.hint}>
              This is a copy taken when the session was scheduled. Editing the workout in
              the builder later does not change what this session says.
            </Text>
          </Card>
        </>
      )}

      <Text style={s.label}>Notes for the family</Text>
      <TextInput
        style={[s.input, s.notes]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Bring a ball and water. We are outside if the gym is busy."
        placeholderTextColor={color.textFaint}
        accessibilityLabel="Notes for the family"
        multiline
      />

      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={{ height: 20 }} />
      <Button
        label={editing ? 'Save changes' : writes > 1 ? `Add ${writes} sessions` : 'Add to the calendar'}
        onPress={save}
        busy={busy}
        disabled={!canSave}
      />

      {editing && <EditActions event={editing} events={events} onDone={() => router.back()} />}
    </ScrollView>
    </KeyboardPad>
  );
}

// --- editing an existing session -------------------------------------------

function EditActions({
  event,
  events,
  onDone,
}: {
  event: SessionEvent;
  events: SessionEvent[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'none' | 'one' | 'series'>('none');
  const laterInSeries = event.seriesId
    ? events.filter(
        (e) => e.seriesId === event.seriesId && e.startsAt.toDate() >= event.startsAt.toDate()
      ).length
    : 0;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 22 }}>
      <Text style={s.label}>This session</Text>
      <View style={s.wrapRow}>
        <GhostButton
          label={event.canceled ? 'Put it back on' : 'Cancel this session'}
          icon={event.canceled ? 'refresh-outline' : 'close-circle-outline'}
          disabled={busy}
          onPress={() => run(() => updateEvent(event.id, { canceled: !event.canceled }))}
        />
        <GhostButton
          label="Delete"
          icon="trash-outline"
          tone="danger"
          disabled={busy}
          onPress={() => setConfirm('one')}
        />
      </View>

      {laterInSeries > 1 && (
        <>
          <Text style={s.label}>This and the {laterInSeries - 1} after it</Text>
          <Text style={s.hint}>
            Sessions before this one are left alone. Changing a run of Tuesdays should not
            reach backwards into the ones already played.
          </Text>
          <View style={[s.wrapRow, { marginTop: 10 }]}>
            <GhostButton
              label="Cancel them all"
              icon="close-circle-outline"
              disabled={busy}
              onPress={() =>
                run(() =>
                  applyToSeries(events, event.seriesId!, event.startsAt.toDate(), () => ({
                    canceled: true,
                  }))
                )
              }
            />
            <GhostButton
              label="Delete them all"
              icon="trash-outline"
              tone="danger"
              disabled={busy}
              onPress={() => setConfirm('series')}
            />
          </View>
        </>
      )}

      {confirm !== 'none' && (
        <Card style={{ marginTop: 14 }}>
          <CardTitle>Delete for good</CardTitle>
          <Body>
            {confirm === 'one'
              ? 'This session comes off the calendar. The family loses it from their app too.'
              : `${laterInSeries} sessions come off the calendar, this one and every one after it.`}
          </Body>
          <View style={[s.wrapRow, { marginTop: 12 }]}>
            <GhostButton
              label="Yes, delete"
              icon="trash-outline"
              tone="danger"
              disabled={busy}
              onPress={() =>
                run(() =>
                  confirm === 'one'
                    ? deleteEvent(event.id)
                    : deleteSeries(events, event.seriesId!, event.startsAt.toDate())
                )
              }
            />
            <GhostButton label="Keep it" disabled={busy} onPress={() => setConfirm('none')} />
          </View>
        </Card>
      )}
    </View>
  );
}

// --- time -------------------------------------------------------------------

/**
 * Every quarter hour from 6am to 9pm, as taps. A wheel picker is a native module this
 * project does not carry, and a text field makes a coach summon a keypad to type a
 * time he picks from the same six slots every week. The list scrolls to where he
 * already is.
 */
function TimeStrip({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const slots = useMemo(() => {
    const out: { h: number; m: number; label: string }[] = [];
    for (let h = 6; h <= 21; h++) {
      for (const m of [0, 15, 30, 45]) {
        const d = new Date(2000, 0, 1, h, m);
        out.push({ h, m, label: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
      }
    }
    return out;
  }, []);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.wrapRow}>
      {slots.map((t) => {
        const on = value.getHours() === t.h && value.getMinutes() === t.m;
        return (
          <Pressable
            key={t.label}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            onPress={() => {
              const d = new Date(value);
              d.setHours(t.h, t.m, 0, 0);
              onChange(d);
            }}
            style={({ pressed }) => [
              s.time,
              on && s.timeOn,
              pressed && !on && { backgroundColor: color.inkHover },
            ]}
          >
            <Text style={[s.timeText, on && { color: color.bone }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  pad: { padding: 16, paddingBottom: 48 },

  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: color.textFaint,
    marginBottom: 8,
    marginTop: 20,
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
  notes: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },

  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  wrapRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    backgroundColor: semantic.surfaceCard,
  },
  pillOn: { backgroundColor: color.fastRed, borderColor: color.fastRed },
  pillText: { fontSize: 13, fontWeight: '700', color: color.textBody },

  tpl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    maxWidth: 220,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    backgroundColor: semantic.surfaceCard,
  },
  tplOn: { borderColor: color.redHot },
  tplName: { fontSize: 13.5, fontWeight: '700', color: color.chalk, flexShrink: 1 },
  tplMin: { fontSize: 11.5, color: color.textDim },

  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 60,
    paddingHorizontal: 4,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    backgroundColor: semantic.surfaceInput,
  },
  typeLabel: { fontSize: 10.5, fontWeight: '700', color: color.textDim, textAlign: 'center' },

  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: semantic.surfaceInput,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    borderRadius: radius.card,
    padding: 3,
  },
  dayBtn: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.chip },
  dayText: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: color.chalk },

  time: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    backgroundColor: semantic.surfaceCard,
  },
  timeOn: { backgroundColor: color.fastRed, borderColor: color.fastRed },
  timeText: { fontSize: 13, fontWeight: '700', color: color.textBody },

  dates: { fontSize: 12.5, color: color.textDim, marginTop: 8, lineHeight: 18 },

  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  blockNum: { width: 18, fontSize: 11, fontWeight: '800', color: color.textFaint },
  blockName: { flex: 1, fontSize: 14, color: color.chalk },
  blockMin: { fontSize: 12, fontWeight: '700', color: color.textDim },

  hint: { ...type.meta, marginTop: 8, lineHeight: 17 },
  error: { marginTop: 12, color: color.redHot, fontSize: 13.5, lineHeight: 19 },
});

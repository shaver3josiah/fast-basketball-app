import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '../../src/session';
import {
  deleteTemplate,
  saveTemplate,
  subscribeTemplates,
  totalMinutes,
} from '../../src/data';
import type { WorkoutBlock, WorkoutKind, WorkoutTemplate } from '../../src/types';
import { Body, Button, Card, Empty, Eyebrow, GhostButton, Screen, Segmented, Stepper, TypeChip } from '../../src/ui';
import { SESSION_TYPES, color, radius, semantic, type, type SessionType } from '../../src/theme';

/**
 * Blake's workout library. He builds a session once and schedules it all season.
 *
 * The whole screen is one list plus one inline editor. There is no wizard and no
 * modal: a modal would protect focus he does not need protecting, and every step in
 * a wizard is a step he repeats every time he writes a workout. Name it, pick a type,
 * type the blocks, save.
 */
export default function Builder() {
  const { role } = useSession();
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkoutTemplate[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (role !== 'coach') return;
    return subscribeTemplates(setTemplates);
  }, [role]);

  // Nobody but the coach has a workout library, and the rules agree: a read here
  // from a family account is denied. Tabs hides it, so this is the second lock.
  if (role !== 'coach') return <Redirect href="/(tabs)" />;

  return (
    <Screen>
      {draft ? (
        <Editor
          draft={draft}
          onChange={setDraft}
          onDone={() => setDraft(null)}
        />
      ) : (
        <>
          <Body>
            Build a session once. Schedule it as often as you like, for one athlete or
            for a group.
          </Body>
          <View style={{ height: 14 }} />
          <Button label="New workout" onPress={() => setDraft(blankDraft())} />

          <Eyebrow>Your workouts</Eyebrow>
          {templates === null && <Text style={type.meta}>Loading…</Text>}
          {templates?.length === 0 && (
            <Empty icon="barbell-outline">
              No workouts yet.{'\n'}The first one takes about a minute.
            </Empty>
          )}
          {templates?.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onEdit={() => setDraft(toDraft(t))}
              onDuplicate={() => setDraft({ ...toDraft(t), id: '', name: `${t.name} copy` })}
              onSchedule={() =>
                router.push({ pathname: '/schedule', params: { templateId: t.id } })
              }
            />
          ))}
        </>
      )}
    </Screen>
  );
}

// --- the list ---------------------------------------------------------------

function TemplateCard({
  template,
  onEdit,
  onDuplicate,
  onSchedule,
}: {
  template: WorkoutTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onSchedule: () => void;
}) {
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${template.name}`}
        onPress={onEdit}
        style={s.tplHead}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.tplName}>{template.name}</Text>
          <View style={s.tplMetaRow}>
            <TypeChip type={template.type} compact />
            <Text style={s.tplMeta}>
              {template.kind === 'coached' ? 'Coached' : 'On their own'} · {template.totalMinutes} min
              {' · '}
              {template.blocks.length} {template.blocks.length === 1 ? 'block' : 'blocks'}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={color.textLabel} />
      </Pressable>

      {template.blocks.length > 0 && (
        <View style={s.tplBlocks}>
          {template.blocks.slice(0, 4).map((b) => (
            <Text key={b.id} style={s.tplBlock} numberOfLines={1}>
              {b.minutes} min · {b.name}
            </Text>
          ))}
          {template.blocks.length > 4 && (
            <Text style={s.tplBlock}>and {template.blocks.length - 4} more</Text>
          )}
        </View>
      )}

      <View style={s.tplActions}>
        <GhostButton label="Schedule" icon="calendar-outline" onPress={onSchedule} />
        <GhostButton label="Duplicate" icon="copy-outline" onPress={onDuplicate} />
      </View>
    </Card>
  );
}

// --- the editor -------------------------------------------------------------

interface Draft {
  id: string;
  name: string;
  type: SessionType;
  kind: WorkoutKind;
  blocks: WorkoutBlock[];
}

const blankDraft = (): Draft => ({
  id: '',
  name: '',
  type: 'skills',
  kind: 'individual',
  blocks: [{ id: rid(), name: '', minutes: 15 }],
});

const toDraft = (t: WorkoutTemplate): Draft => ({
  id: t.id,
  name: t.name,
  type: t.type,
  kind: t.kind,
  blocks: t.blocks.map((b) => ({ ...b })),
});

/** Local row id. Never stored as anything but an ordering key, so Math.random is
 *  enough and a real uuid would be ceremony. */
const rid = () => Math.random().toString(36).slice(2, 10);

function Editor({
  draft,
  onChange,
  onDone,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The block that was just added, so it can take focus without stealing it from a
  // row the coach is already typing in.
  const focusId = useRef<string | null>(null);

  const total = useMemo(() => totalMinutes(draft.blocks), [draft.blocks]);
  const named = draft.blocks.filter((b) => b.name.trim());
  const canSave = draft.name.trim().length > 0 && named.length > 0;

  function setBlock(id: string, patch: Partial<WorkoutBlock>) {
    onChange({ ...draft, blocks: draft.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  }

  function move(id: string, dir: -1 | 1) {
    const i = draft.blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= draft.blocks.length) return;
    const next = [...draft.blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...draft, blocks: next });
  }

  function addBlock() {
    const b = { id: rid(), name: '', minutes: 15 };
    focusId.current = b.id;
    onChange({ ...draft, blocks: [...draft.blocks, b] });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveTemplate({
        id: draft.id,
        name: draft.name,
        type: draft.type,
        kind: draft.kind,
        // An empty row is someone who tapped Add and changed their mind. Dropping it
        // silently is kinder than an error about a field they never filled in.
        blocks: named,
        totalMinutes: totalMinutes(named),
      });
      onDone();
    } catch {
      setError('That did not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteTemplate(draft.id);
      onDone();
    } catch {
      setError('That did not delete. Try again.');
      setBusy(false);
    }
  }

  return (
    <View>
      <View style={s.editorHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to the workout list"
          onPress={onDone}
          style={s.backBtn}
        >
          <Ionicons name="chevron-back" size={20} color={color.chalk} />
        </Pressable>
        <Text style={s.editorTitle}>{draft.id ? 'Edit workout' : 'New workout'}</Text>
      </View>

      <Text style={s.label}>Name</Text>
      <TextInput
        style={s.input}
        value={draft.name}
        onChangeText={(name) => onChange({ ...draft, name })}
        placeholder="Tuesday ball handling"
        placeholderTextColor={color.textLabel}
        accessibilityLabel="Workout name"
        returnKeyType="next"
      />

      <Text style={s.label}>Type</Text>
      <View style={s.typeRow}>
        {(Object.keys(SESSION_TYPES) as SessionType[]).map((k) => {
          const t = SESSION_TYPES[k];
          const on = draft.type === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
              onPress={() => onChange({ ...draft, type: k })}
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

      <Text style={s.label}>Who it is for</Text>
      <Segmented
        label="Who it is for"
        value={draft.kind}
        onChange={(kind) => onChange({ ...draft, kind })}
        options={[
          { value: 'individual', label: 'On their own', icon: 'person-outline' },
          { value: 'coached', label: 'Coached', icon: 'people-outline' },
        ]}
      />

      <View style={s.blocksHead}>
        <Text style={s.label}>Blocks</Text>
        <Text style={s.total}>{total} min</Text>
      </View>

      {draft.blocks.map((b, i) => (
        <BlockRow
          key={b.id}
          block={b}
          index={i}
          count={draft.blocks.length}
          autoFocus={focusId.current === b.id}
          onChange={(patch) => setBlock(b.id, patch)}
          onMove={(dir) => move(b.id, dir)}
          onRemove={() =>
            onChange({ ...draft, blocks: draft.blocks.filter((x) => x.id !== b.id) })
          }
        />
      ))}

      <GhostButton label="Add a block" icon="add" onPress={addBlock} />

      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={{ height: 18 }} />
      <Button label={draft.id ? 'Save changes' : 'Save workout'} onPress={save} busy={busy} disabled={!canSave} />

      {!canSave && (
        <Text style={s.hint}>
          A workout needs a name and at least one block with something written in it.
        </Text>
      )}

      {draft.id ? (
        <View style={{ marginTop: 14 }}>
          {confirmDelete ? (
            <>
              <Text style={s.hint}>
                Deleting this removes the template. Sessions already on a calendar keep
                their own copy of the blocks and are not touched.
              </Text>
              <View style={s.tplActions}>
                <GhostButton label="Delete it" icon="trash-outline" tone="danger" onPress={remove} />
                <GhostButton label="Keep it" onPress={() => setConfirmDelete(false)} />
              </View>
            </>
          ) : (
            <GhostButton
              label="Delete workout"
              icon="trash-outline"
              tone="danger"
              onPress={() => setConfirmDelete(true)}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

function BlockRow({
  block,
  index,
  count,
  autoFocus,
  onChange,
  onMove,
  onRemove,
}: {
  block: WorkoutBlock;
  index: number;
  count: number;
  autoFocus?: boolean;
  onChange: (patch: Partial<WorkoutBlock>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <View style={s.block}>
      <View style={s.blockTop}>
        <Text style={s.blockNum}>{index + 1}</Text>
        <TextInput
          style={s.blockInput}
          value={block.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Two-ball pound dribbles"
          placeholderTextColor={color.textLabel}
          accessibilityLabel={`Block ${index + 1} name`}
          autoFocus={autoFocus}
        />
      </View>

      <View style={s.blockBottom}>
        <Stepper
          label={`Block ${index + 1} minutes`}
          value={block.minutes}
          onChange={(minutes) => onChange({ minutes })}
          min={5}
          max={120}
        />
        {/* Arrows rather than a drag handle. Reordering four rows is two taps here,
            and a drag target on a 40pt row fights the scroll view around it. The
            calendar earns a real drag; this does not. */}
        <View style={s.blockTools}>
          <IconBtn
            name="arrow-up"
            label={`Move block ${index + 1} up`}
            disabled={index === 0}
            onPress={() => onMove(-1)}
          />
          <IconBtn
            name="arrow-down"
            label={`Move block ${index + 1} down`}
            disabled={index === count - 1}
            onPress={() => onMove(1)}
          />
          <IconBtn
            name="close"
            label={`Remove block ${index + 1}`}
            tone="danger"
            onPress={onRemove}
          />
        </View>
      </View>
    </View>
  );
}

function IconBtn({
  name,
  label,
  onPress,
  disabled,
  tone,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconBtn,
        pressed && { backgroundColor: color.inkHover },
        disabled && { opacity: 0.3 },
      ]}
    >
      <Ionicons name={name} size={17} color={tone === 'danger' ? color.redHot : color.chalk} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  tplHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  tplName: { fontSize: 16, fontWeight: '800', color: color.chalk },
  tplMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tplMeta: { fontSize: 12, color: color.textDim },
  tplBlocks: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
    gap: 3,
  },
  tplBlock: { fontSize: 12.5, color: color.textBody },
  tplActions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },

  editorHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  editorTitle: { fontSize: 20, fontWeight: '900', color: color.chalk, letterSpacing: -0.3 },

  label: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: color.textLabel,
    marginBottom: 6,
    marginTop: 16,
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
    borderColor: semantic.border,
    backgroundColor: semantic.surfaceInput,
  },
  typeLabel: { fontSize: 10.5, fontWeight: '700', color: color.textDim, textAlign: 'center' },

  blocksHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  total: { fontSize: 13, fontWeight: '800', color: color.chalk, marginTop: 16 },

  block: {
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.card,
    padding: 10,
    marginBottom: 8,
  },
  blockTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blockNum: {
    width: 22,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    color: color.textLabel,
  },
  blockInput: {
    flex: 1,
    color: color.chalk,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 0,
  },
  blockBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  blockTools: { flexDirection: 'row', gap: 2 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.chip },

  error: { marginTop: 14, color: color.redHot, fontSize: 13.5, lineHeight: 19 },
  hint: { ...type.meta, marginTop: 10, lineHeight: 17 },
});

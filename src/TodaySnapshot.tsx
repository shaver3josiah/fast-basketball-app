import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { CalendarDays, ChevronRight, Play, SquarePen, Users } from 'lucide-react-native';
import { blockAmount, totalMinutes } from './data';
import { SessionGlyph } from './SessionGlyph';
import { FlowFill } from './FlowFill';
import { Surface } from './Surface';
import type { SessionEvent } from './types';
import { SESSION_TYPES, color, radius, semantic, type, typesOf } from './theme';

const HERO_R = 28;
const HERO_PAD = 16;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const enter = (i: number) => FadeInDown.duration(260).delay(i * 60).easing(EASE_OUT);

const clock = (e: SessionEvent) =>
  e.timeLabel || e.startsAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** The first session not canceled and not yet over. One with no duration is treated
 *  as an hour, so it stays "next" while it is plausibly still running. */
export const nextUp = (events: SessionEvent[], now = Date.now()) =>
  events.find((e) => !e.canceled && e.startsAt.toMillis() + (e.durationMin || 60) * 60000 > now);

/**
 * What today holds, before the month grid. Shown when the Calendar opens on a day that
 * has sessions, because "what am I doing today" is the question most opens are asking,
 * and the grid answers it in three taps.
 *
 * One hero card per session, in time order. The next one still ahead gets the "Up next"
 * mark and the only live symbol on the screen, so the eye lands on it; the rest are
 * drawn still. The way back to the month is a real button at the top AND the bottom,
 * never a swipe to discover.
 */
export function TodaySnapshot({
  events,
  isCoach,
  namesOn,
  onOpen,
  onCalendar,
}: {
  events: SessionEvent[];
  isCoach: boolean;
  namesOn: (e: SessionEvent) => string[];
  onOpen: (e: SessionEvent) => void;
  onCalendar: () => void;
}) {
  const live = events.filter((e) => !e.canceled);
  const nextId = nextUp(events)?.id;
  const nextIdx = events.findIndex((e) => e.id === nextId);
  const mins = live.reduce((n, e) => n + (e.durationMin || totalMinutes(e.blocks ?? [])), 0);
  const blocks = live.reduce((n, e) => n + (e.blocks?.length ?? 0), 0);

  const summary = [
    `${live.length} ${live.length === 1 ? 'session' : 'sessions'}`,
    mins ? `${mins} min` : null,
    blocks ? `${blocks} ${blocks === 1 ? 'drill' : 'drills'}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <View>
      <Animated.View entering={enter(0)} style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>Today</Text>
          <Text style={s.date} accessibilityRole="header">
            {new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
          <Text style={s.summary}>{summary}</Text>
        </View>
        <CalendarButton onPress={onCalendar} />
      </Animated.View>

      {events.map((e, i) => (
        <Animated.View key={e.id} entering={enter(i + 1)}>
          <Hero
            event={e}
            next={e.id === nextId}
            // Before the next one in time order; everything, once the day is done.
            past={!e.canceled && (nextIdx < 0 || i < nextIdx)}
            names={isCoach ? namesOn(e) : []}
            isCoach={isCoach}
            onOpen={() => onOpen(e)}
          />
        </Animated.View>
      ))}

      <Animated.View entering={enter(events.length + 1)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open the full calendar"
          onPress={onCalendar}
          style={({ pressed }) => [s.back, pressed && { backgroundColor: color.inkHover }]}
        >
          <CalendarDays size={17} color={color.chalk} strokeWidth={2} />
          <Text style={s.backText}>Open the full calendar</Text>
          <ChevronRight size={17} color={color.textDim} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function CalendarButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to the calendar"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [s.calBtn, pressed && { backgroundColor: color.inkHover, transform: [{ scale: 0.97 }] }]}
    >
      <CalendarDays size={15} color={color.chalk} strokeWidth={2.2} />
      <Text style={s.calBtnText}>Calendar</Text>
    </Pressable>
  );
}

function Hero({
  event: e,
  next,
  past,
  names,
  isCoach,
  onOpen,
}: {
  event: SessionEvent;
  next: boolean;
  past: boolean;
  names: string[];
  isCoach: boolean;
  onOpen: () => void;
}) {
  const cats = typesOf(e);
  const primary = cats[0];
  const tint = e.canceled ? color.slate : (SESSION_TYPES[primary]?.color ?? color.slate);
  const verb = e.canceled ? 'View' : isCoach ? 'Edit session' : next ? 'Start workout' : 'Open workout';

  return (
    <Surface style={[s.hero, (past || e.canceled) && { opacity: 0.62 }]}>
      {next ? <FlowFill tint={tint} peak={0.14} /> : null}
      <View style={s.heroTop}>
        <View style={s.glyphWell}>
          <SessionGlyph kind={primary} size={next ? 64 : 52} animated={next} muted={e.canceled} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.markRow}>
            {next ? (
              <View style={[s.mark, { backgroundColor: `${tint}26` }]}>
                <View style={[s.dot, { backgroundColor: tint }]} />
                <Text style={[s.markText, { color: tint }]}>Up next</Text>
              </View>
            ) : null}
            {e.canceled ? <Text style={s.markDim}>Canceled</Text> : past ? <Text style={s.markDim}>Earlier</Text> : null}
          </View>
          <Text style={[s.clock, e.canceled && s.struck]}>{clock(e)}</Text>
          <Text style={[s.name, e.canceled && s.struck]} numberOfLines={2}>
            {e.name}
          </Text>
          <Text style={s.meta} numberOfLines={2}>
            {[e.durationMin ? `${e.durationMin} min` : null, e.location, names.length ? names.join(', ') : null]
              .filter(Boolean)
              .join('  ·  ')}
          </Text>
        </View>
      </View>

      {/* Every category, each with its own symbol and word: colour is never the only
          signal (the palette's two hues are red and teal). */}
      <View style={s.types}>
        {cats.map((k) => (
          <View key={k} style={s.type}>
            <SessionGlyph kind={k} size={16} muted={e.canceled} />
            <Text style={[s.typeText, { color: e.canceled ? color.textDim : SESSION_TYPES[k]?.color }]}>
              {SESSION_TYPES[k]?.label ?? k}
            </Text>
          </View>
        ))}
        {e.kind === 'coached' ? (
          <View style={s.type}>
            <Users size={14} color={color.miamiTeal} strokeWidth={2.2} />
            <Text style={[s.typeText, { color: color.miamiTeal }]}>Coached</Text>
          </View>
        ) : null}
      </View>

      {e.blocks?.length ? (
        <View style={s.steps}>
          {e.blocks.map((b, i) => (
            <View key={b.id ?? i} style={s.step}>
              <View style={s.rail}>
                <View style={[s.stepNum, next && i === 0 && { borderColor: tint }]}>
                  <Text style={s.stepNumText}>{i + 1}</Text>
                </View>
                {i < (e.blocks?.length ?? 0) - 1 ? <View style={s.line} /> : null}
              </View>
              <Text style={s.stepName} numberOfLines={1}>
                {b.name}
              </Text>
              <Text style={s.stepAmt}>{blockAmount(b)}</Text>
            </View>
          ))}
        </View>
      ) : e.notes ? (
        <Text style={s.notes} numberOfLines={3}>
          {e.notes}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${verb}: ${e.name}`}
        onPress={onOpen}
        style={({ pressed }) => [
          s.go,
          next && !e.canceled && !isCoach ? s.goPrimary : null,
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        ]}
      >
        <Text style={[s.goText, next && !e.canceled && !isCoach && { color: color.bone }]}>{verb}</Text>
        {(() => {
          const Icon = isCoach ? SquarePen : Play;
          const fg = next && !e.canceled && !isCoach ? color.bone : color.chalk;
          return <Icon size={16} color={fg} fill={isCoach ? 'none' : fg} strokeWidth={2.2} />;
        })()}
      </Pressable>
    </Surface>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  eyebrow: { ...type.eyebrow, color: color.redHot },
  date: { fontSize: 26, fontWeight: '900', color: color.chalk, letterSpacing: -0.5, marginTop: 4 },
  summary: { fontSize: 13, fontWeight: '600', color: color.textDim, marginTop: 4 },
  calBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
  },
  calBtnText: { fontSize: 13, fontWeight: '700', color: color.chalk },

  // Concentric corners: every rounded thing inside sits 16 in from the card's edge, so
  // its radius is the card's minus 16 (28 - 16 = 12). That shared centre is what makes
  // nested iOS shapes look machined rather than stacked.
  hero: {
    backgroundColor: semantic.surfaceCard,
    borderRadius: HERO_R,
    overflow: 'hidden',
    padding: HERO_PAD,
    marginBottom: 12,
    gap: 14,
  },
  heroTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  glyphWell: {
    width: 80,
    height: 80,
    borderRadius: HERO_R - HERO_PAD,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.courtBlack,
  },
  markRow: { flexDirection: 'row', gap: 8, marginBottom: 4, minHeight: 20, alignItems: 'center' },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  markText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  markDim: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: color.textDim },
  clock: { fontSize: 22, fontWeight: '900', color: color.chalk, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  name: { fontSize: 15.5, fontWeight: '700', color: color.chalk, marginTop: 2 },
  meta: { ...type.meta, marginTop: 3, lineHeight: 17 },

  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  type: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },

  steps: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border, paddingTop: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 34 },
  rail: { alignItems: 'center', width: 22 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 11, fontWeight: '800', color: color.textLede, fontVariant: ['tabular-nums'] },
  line: { width: 1, flex: 1, minHeight: 10, backgroundColor: semantic.border },
  stepName: { flex: 1, fontSize: 14, color: color.textLede, marginTop: 2 },
  stepAmt: { fontSize: 12.5, fontWeight: '700', color: color.textDim, marginTop: 3, fontVariant: ['tabular-nums'] },
  notes: { ...type.body, fontSize: 13.5 },

  go: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: HERO_R - HERO_PAD,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: semantic.borderStrong,
  },
  goPrimary: { backgroundColor: color.fastRed, borderColor: color.fastRed },
  goText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.4, color: color.chalk },

  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: radius.card, borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    marginTop: 4,
  },
  backText: { flex: 1, fontSize: 14, fontWeight: '700', color: color.chalk },
  struck: { textDecorationLine: 'line-through', color: color.textDim },
});

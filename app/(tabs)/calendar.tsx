import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSession } from '../../src/session';
import { moveEvent, pasteEvents, subscribeEvents } from '../../src/data';
import type { Athlete, SessionEvent } from '../../src/types';
import { Empty, Eyebrow, GhostButton } from '../../src/ui';
import { SESSION_TYPES, color, radius, semantic, type } from '../../src/theme';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * The calendar, and for the coach the place he actually runs the week from.
 *
 * The one authored interaction is the drag: press and hold a session in the day list,
 * and it lifts off the page and follows your thumb up into the month grid, where the
 * day under it lights up. Let go and it moves. That is the gesture a coach reaches for
 * without being taught, and it is the whole reason this screen is not a list.
 *
 * It is built on PanResponder and Animated, which ship with React Native. Reanimated
 * and gesture-handler would run the same drag on the UI thread, and both are native
 * modules: adding them means a new prebuild of a release pipeline that works today,
 * for a gesture that moves one small card at a time. If the roster ever grows to the
 * point where this drops frames, that trade is worth revisiting. It is not now.
 */
export default function CalendarScreen() {
  const { role, athlete, athletesById } = useSession();
  const router = useRouter();
  const isCoach = role === 'coach';

  const [events, setEvents] = useState<SessionEvent[] | null>(null);
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [filter, setFilter] = useState<string>('all');
  const [clipboard, setClipboard] = useState<{ from: Date; events: SessionEvent[] } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Direct manipulation is not decoration, so the drag itself always works. What
  // Reduce Motion turns off is the spring: the card snaps home instead of overshooting.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduceMotion(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isCoach && !athlete?.id) return;
    return subscribeEvents(role, isCoach ? null : (athlete?.id ?? null), setEvents);
  }, [role, athlete?.id, isCoach]);

  const visible = useMemo(
    () => (events ?? []).filter((e) => filter === 'all' || e.athleteId === filter),
    [events, filter]
  );

  const month = cursor.getMonth();
  const year = cursor.getFullYear();
  const today = startOfDay(new Date());

  const byDay = useMemo(() => {
    const m = new Map<number, SessionEvent[]>();
    for (const e of visible) {
      const d = e.startsAt?.toDate?.();
      if (!d || d.getMonth() !== month || d.getFullYear() !== year) continue;
      m.set(d.getDate(), [...(m.get(d.getDate()) ?? []), e]);
    }
    return m;
  }, [visible, month, year]);

  const dayEvents = useMemo(
    () => (visible ?? []).filter((e) => e.startsAt?.toDate && sameDay(e.startsAt.toDate(), selected)),
    [visible, selected]
  );

  // --- drag plumbing --------------------------------------------------------
  // The grid's window position, taken once when a drag begins. Scrolling is frozen
  // for the duration, so a single measurement stays true until the finger lifts.
  const gridRef = useRef<View>(null);
  const gridWin = useRef({ x: 0, y: 0 });
  const cellRects = useRef(new Map<number, LayoutRectangle>());
  const [dragging, setDragging] = useState(false);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const hoverRef = useRef<number | null>(null);

  const measureGrid = useCallback(() => {
    gridRef.current?.measureInWindow((x, y) => {
      gridWin.current = { x, y };
    });
  }, []);

  const hitTest = useCallback((pageX: number, pageY: number) => {
    const gx = pageX - gridWin.current.x;
    const gy = pageY - gridWin.current.y;
    for (const [day, r] of cellRects.current) {
      if (gx >= r.x && gx <= r.x + r.width && gy >= r.y && gy <= r.y + r.height) return day;
    }
    return null;
  }, []);

  async function drop(e: SessionEvent, day: number | null) {
    if (day == null) return;
    const target = new Date(year, month, day);
    if (sameDay(e.startsAt.toDate(), target)) return;
    setError(null);
    try {
      await moveEvent(e, target);
      setSelected(target);
      setFlash(`Moved to ${target.toLocaleDateString([], { weekday: 'short', day: 'numeric' })}`);
    } catch {
      setError('That did not move. Check your connection and try again.');
    }
  }

  async function paste() {
    if (!clipboard) return;
    setError(null);
    try {
      const n = await pasteEvents(clipboard.events, selected);
      setFlash(`${n} ${n === 1 ? 'session' : 'sessions'} pasted`);
    } catch {
      setError('That did not paste. Try again.');
    }
  }

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const roster = Object.values(athletesById);

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.pad}
      // A drag that also scrolls the page is a drag that lands somewhere else.
      scrollEnabled={!dragging}
    >
      <View style={s.calHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.month}>{cursor.toLocaleDateString([], { month: 'long' })}</Text>
          <Text style={s.year}>{year}</Text>
        </View>
        <NavBtn
          icon="chevron-back"
          label="Previous month"
          onPress={() => setCursor(new Date(year, month - 1, 1))}
        />
        <NavBtn
          icon="chevron-forward"
          label="Next month"
          onPress={() => setCursor(new Date(year, month + 1, 1))}
        />
      </View>

      {isCoach && roster.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
        >
          <FilterChip label="Everyone" on={filter === 'all'} onPress={() => setFilter('all')} />
          {roster.map((a) => (
            <FilterChip
              key={a.id}
              label={a.playerName.split(' ')[0]}
              on={filter === a.id}
              onPress={() => setFilter(a.id)}
            />
          ))}
        </ScrollView>
      )}

      <View style={s.dow}>
        {DOW.map((d) => (
          <Text key={d} style={s.dowLabel}>
            {d}
          </Text>
        ))}
      </View>

      <View style={s.grid} ref={gridRef} collapsable={false} onLayout={measureGrid}>
        {Array.from({ length: new Date(year, month, 1).getDay() }, (_, i) => (
          <View key={`blank${i}`} style={s.cell} />
        ))}
        {Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => {
          const day = i + 1;
          const date = new Date(year, month, day);
          return (
            <DayCell
              key={day}
              day={day}
              events={byDay.get(day) ?? []}
              isToday={sameDay(date, today)}
              isSelected={sameDay(date, selected)}
              isHovered={hoverDay === day}
              onPress={() => setSelected(date)}
              onLayout={(r) => cellRects.current.set(day, r)}
            />
          );
        })}
      </View>

      <Legend />

      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {flash ? (
        <View style={s.flash} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={15} color={color.miamiTeal} />
          <Text style={s.flashText}>{flash}</Text>
        </View>
      ) : null}

      {clipboard && isCoach && (
        <View style={s.clip}>
          <Ionicons name="copy-outline" size={16} color={color.chalk} />
          <Text style={s.clipText}>
            {clipboard.events.length} {clipboard.events.length === 1 ? 'session' : 'sessions'} copied
            from {clipboard.from.toLocaleDateString([], { weekday: 'short', day: 'numeric' })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the copied sessions"
            onPress={() => setClipboard(null)}
            style={s.clipClear}
          >
            <Ionicons name="close" size={16} color={color.textDim} />
          </Pressable>
        </View>
      )}

      <View style={s.dayHead}>
        <Text style={s.dayTitle}>
          {selected.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
        </Text>
        {sameDay(selected, today) ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            onPress={() => {
              setCursor(today);
              setSelected(today);
            }}
          >
            <Text style={s.todayLink}>Today</Text>
          </Pressable>
        )}
      </View>

      {isCoach && (
        <View style={s.dayTools}>
          <GhostButton
            label="Add a session"
            icon="add"
            onPress={() =>
              router.push({
                pathname: '/schedule',
                params: {
                  date: selected.toISOString(),
                  ...(filter !== 'all' ? { athleteId: filter } : {}),
                },
              })
            }
          />
          <GhostButton
            label="Copy day"
            icon="copy-outline"
            disabled={dayEvents.length === 0}
            onPress={() => {
              setClipboard({ from: selected, events: dayEvents });
              setFlash(`${dayEvents.length} copied`);
            }}
          />
          <GhostButton label="Paste here" icon="clipboard-outline" disabled={!clipboard} onPress={paste} />
        </View>
      )}

      {events === null && <Text style={type.meta}>Loading…</Text>}
      {events !== null && dayEvents.length === 0 && (
        <Empty icon="calendar-outline">
          {isCoach
            ? 'Nothing on this day.\nAdd a session, or drag one here from another day.'
            : 'Nothing on this day.'}
        </Empty>
      )}

      {dayEvents.map((e) => (
        <SessionCard
          key={e.id}
          event={e}
          athlete={athletesById[e.athleteId]}
          showAthlete={isCoach && filter === 'all'}
          draggable={isCoach}
          reduceMotion={reduceMotion}
          onOpen={() => router.push({ pathname: '/schedule', params: { eventId: e.id } })}
          onCopy={() => {
            setClipboard({ from: selected, events: [e] });
            setFlash('Session copied');
          }}
          onDragStart={() => {
            measureGrid();
            setDragging(true);
          }}
          onDragMove={(x, y) => {
            const day = hitTest(x, y);
            hoverRef.current = day;
            setHoverDay(day);
          }}
          onDragEnd={async () => {
            const day = hoverRef.current;
            hoverRef.current = null;
            setDragging(false);
            setHoverDay(null);
            await drop(e, day);
          }}
        />
      ))}

      {isCoach && dayEvents.length > 0 && (
        <Text style={s.hint}>
          Press and hold a session to pick it up, then drop it on any day above.
        </Text>
      )}
    </ScrollView>
  );
}

// --- the month grid ---------------------------------------------------------

function DayCell({
  day,
  events,
  isToday,
  isSelected,
  isHovered,
  onPress,
  onLayout,
}: {
  day: number;
  events: SessionEvent[];
  isToday: boolean;
  isSelected: boolean;
  isHovered: boolean;
  onPress: () => void;
  onLayout: (r: LayoutRectangle) => void;
}) {
  const label = events.length
    ? `${day}, ${events.length} ${events.length === 1 ? 'session' : 'sessions'}: ${events
        .map((e) => `${SESSION_TYPES[e.type]?.label ?? e.type}, ${e.name}`)
        .join('. ')}`
    : `${day}, nothing scheduled`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      onLayout={(e) => onLayout(e.nativeEvent.layout)}
      style={({ pressed }) => [
        s.cell,
        isSelected && s.cellSelected,
        isHovered && s.cellHover,
        pressed && !isSelected && { backgroundColor: color.ink },
      ]}
    >
      <Text style={[s.cellNum, isToday && s.cellNumToday, isSelected && { color: color.bone }]}>
        {day}
      </Text>
      <View style={s.chips}>
        {events.slice(0, 2).map((e) => {
          // On the selected cell the fill is the brand red, and a type colour on top of
          // it measures as low as 1.34:1. Bone reads on both, and the type is still
          // carried by the day list below, which is where the labels are.
          const tint = isSelected ? color.bone : (SESSION_TYPES[e.type]?.color ?? color.slate);
          return (
            <View
              key={e.id}
              style={[
                s.gridChip,
                { backgroundColor: e.canceled ? 'transparent' : tint, borderColor: tint },
              ]}
            />
          );
        })}
        {events.length > 2 && (
          <Text style={[s.more, isSelected && { color: color.bone }]}>+{events.length - 2}</Text>
        )}
      </View>
    </Pressable>
  );
}

function Legend() {
  return (
    <>
      <Eyebrow>Legend</Eyebrow>
      <View style={s.legend}>
        {Object.entries(SESSION_TYPES).map(([k, v]) => (
          <View key={k} style={s.legendItem}>
            <Ionicons name={v.icon} size={13} color={v.color} />
            <Text style={s.legendText}>{v.label}</Text>
          </View>
        ))}
        <View style={s.legendItem}>
          <Ionicons name="close-circle-outline" size={13} color={color.slate} />
          <Text style={s.legendText}>Canceled</Text>
        </View>
      </View>
    </>
  );
}

// --- a session in the day list, and the drag that lifts it ------------------

function SessionCard({
  event,
  athlete,
  showAthlete,
  draggable,
  reduceMotion,
  onOpen,
  onCopy,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  event: SessionEvent;
  athlete?: Athlete;
  showAthlete: boolean;
  draggable: boolean;
  reduceMotion: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onDragStart: () => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: () => void;
}) {
  const t = SESSION_TYPES[event.type] ?? {
    label: event.type,
    icon: 'ellipse-outline' as const,
    color: color.slate,
  };
  const d = event.startsAt.toDate();

  const pan = useRef(new Animated.ValueXY()).current;
  const lift = useRef(new Animated.Value(0)).current;
  const armed = useRef(false);
  const [held, setHeld] = useState(false);

  const release = useCallback(() => {
    armed.current = false;
    setHeld(false);
    Animated.parallel([
      reduceMotion
        ? Animated.timing(pan, { toValue: { x: 0, y: 0 }, duration: 0, useNativeDriver: false })
        : Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 7,
            tension: 90,
          }),
      Animated.timing(lift, {
        toValue: 0,
        duration: reduceMotion ? 0 : 140,
        useNativeDriver: false,
      }),
    ]).start();
  }, [pan, lift, reduceMotion]);

  // Rebuilt handlers during a live gesture are the classic PanResponder footgun: the
  // parent re-renders on every hover change, and a fresh handler object arrives
  // mid-drag. Build the responder once and read the current callbacks off a ref.
  const cb = useRef({ onDragStart, onDragMove, onDragEnd });
  cb.current = { onDragStart, onDragMove, onDragEnd };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Capture, not bubble: the Pressable underneath has already claimed the touch
        // by the time the long press arms the drag, and only a capture handler can
        // take it back from a child that is already the responder.
        onMoveShouldSetPanResponderCapture: () => armed.current,
        onPanResponderGrant: () => {
          pan.setValue({ x: 0, y: 0 });
          cb.current.onDragStart();
        },
        onPanResponderMove: (e, g) => {
          pan.setValue({ x: g.dx, y: g.dy });
          cb.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
        },
        onPanResponderRelease: () => {
          cb.current.onDragEnd();
          release();
        },
        // A terminate is the system taking the gesture away, which must still put the
        // card back rather than leaving it stranded mid-flight.
        onPanResponderTerminate: () => {
          cb.current.onDragEnd();
          release();
        },
      }),
    [pan, release]
  );

  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  return (
    <Animated.View
      {...(draggable ? responder.panHandlers : {})}
      style={[
        s.ev,
        held && s.evHeld,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }],
          zIndex: held ? 20 : 0,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.label}, ${event.name}, ${event.timeLabel || d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${event.canceled ? ', canceled' : ''}`}
        accessibilityHint={draggable ? 'Opens the session. Press and hold to move it to another day.' : undefined}
        onPress={onOpen}
        delayLongPress={220}
        onLongPress={() => {
          if (!draggable) return;
          armed.current = true;
          setHeld(true);
          Animated.timing(lift, { toValue: 1, duration: 120, useNativeDriver: false }).start();
        }}
        style={s.evInner}
      >
        <View style={[s.evIcon, { backgroundColor: `${t.color}22`, borderColor: t.color }]}>
          <Ionicons name={t.icon} size={16} color={t.color} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={s.evTop}>
            <Text style={[s.evClock, event.canceled && s.struck]}>
              {event.timeLabel || d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
            {event.durationMin ? <Text style={s.evDur}>{event.durationMin} min</Text> : null}
            {event.kind === 'coached' ? (
              <View style={s.coached}>
                <Ionicons name="people-outline" size={11} color={color.miamiTeal} />
                <Text style={s.coachedText}>Coached</Text>
              </View>
            ) : null}
          </View>

          <Text style={[s.evName, event.canceled && s.struck]}>{event.name}</Text>
          <Text style={s.evMeta}>
            {showAthlete && athlete ? `${athlete.playerName} · ` : ''}
            {event.location}
            {event.canceled ? ' · Canceled' : ''}
          </Text>

          {event.blocks?.length ? (
            <Text style={s.evBlocks} numberOfLines={1}>
              {event.blocks.map((b) => b.name).join(' · ')}
            </Text>
          ) : null}
        </View>

        {draggable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy ${event.name}`}
            onPress={onCopy}
            hitSlop={8}
            style={s.evCopy}
          >
            <Ionicons name="copy-outline" size={16} color={color.textDim} />
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

function NavBtn({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.navBtn, pressed && { backgroundColor: color.inkHover }]}
    >
      <Ionicons name={icon} size={20} color={color.chalk} />
    </Pressable>
  );
}

function FilterChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.filter, on && s.filterOn, pressed && !on && { backgroundColor: color.inkHover }]}
    >
      <Text style={[s.filterText, on && { color: color.bone }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  pad: { padding: 16, paddingBottom: 40 },

  calHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  month: { fontSize: 24, fontWeight: '900', color: color.chalk, letterSpacing: -0.4 },
  year: { fontSize: 13, fontWeight: '700', color: color.textDim, marginTop: 1 },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.chip },

  filterRow: { gap: 6, paddingBottom: 12 },
  filter: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    backgroundColor: semantic.surfaceCard,
  },
  filterOn: { backgroundColor: color.fastRed, borderColor: color.fastRed },
  filterText: { fontSize: 12.5, fontWeight: '700', color: color.textBody },

  dow: { flexDirection: 'row', marginBottom: 4 },
  dowLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: color.textDim,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cellSelected: { backgroundColor: color.fastRed },
  // The drop target. A ring plus a fill, not a fill alone: on a grid of small cells a
  // tint change is easy to miss with a thumb over it.
  cellHover: { borderColor: color.miamiTeal, backgroundColor: color.tealTint },
  cellNum: { fontSize: 13.5, fontWeight: '600', color: color.textBody },
  cellNumToday: { color: color.redHot, fontWeight: '900' },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 9, marginTop: 4 },
  gridChip: { width: 12, height: 3.5, borderRadius: 2, borderWidth: 1 },
  more: { fontSize: 9, fontWeight: '700', color: color.textDim, marginLeft: 1 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, columnGap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 12, color: color.textBody },

  dayHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  dayTitle: { fontSize: 17, fontWeight: '800', color: color.chalk },
  todayLink: { fontSize: 13, fontWeight: '700', color: color.redHot },
  dayTools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },

  clip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.tealTint,
    borderWidth: 1,
    borderColor: color.tealLine,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 4,
    marginTop: 14,
  },
  clipText: { flex: 1, fontSize: 13, color: color.chalk, lineHeight: 18 },
  clipClear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  ev: {
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    borderRadius: radius.card,
    marginBottom: 8,
  },
  // An offset and a real blur, so the card reads as lifted off the page rather than
  // ringed. A zero-offset glow is decoration; this is depth.
  evHeld: {
    borderColor: color.miamiTeal,
    backgroundColor: color.inkHover,
    boxShadow: '0 10px 22px rgba(0,0,0,0.45)',
  },
  evInner: { flexDirection: 'row', gap: 11, padding: 12, alignItems: 'flex-start' },
  evIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.chip,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  evClock: { fontSize: 15, fontWeight: '800', color: color.chalk },
  evDur: { fontSize: 11.5, fontWeight: '700', color: color.textDim },
  coached: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  coachedText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: color.miamiTeal },
  evName: { fontSize: 15, fontWeight: '600', color: color.chalk, marginTop: 3 },
  evMeta: { ...type.meta, marginTop: 2 },
  evBlocks: { fontSize: 12, color: color.textDim, marginTop: 5 },
  evCopy: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -6 },
  struck: { textDecorationLine: 'line-through', color: color.textDim },

  flash: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  flashText: { fontSize: 13, fontWeight: '600', color: color.miamiTeal },
  error: { marginTop: 12, color: color.redHot, fontSize: 13.5, lineHeight: 19 },
  hint: { ...type.meta, marginTop: 6, lineHeight: 17 },
});

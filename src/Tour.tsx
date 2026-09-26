import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  interpolate,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { SessionGlyph } from './SessionGlyph';
import { Celebrate, SPECS } from './Celebrate';
import { CELEBRATIONS, isUnlocked, type RewardState } from './rewards';
import type { Role } from './types';
import { CHAT_COLORS, color, radius, semantic, type } from './theme';

/**
 * The first-run tour: what each tab is for, one page each, for the role that is
 * holding the phone. It replaced a sheet that only explained the rewards.
 *
 * Swipe or tap Next. Every page has an animated centrepiece over its own field of
 * embers, and only the page on screen animates, so six pages cost what one does.
 * Shown once per DEVICE (AsyncStorage), and again whenever someone taps "Replay the
 * tour" on the You tab. The key is new, so a phone that saw the old rewards sheet
 * still gets this once.
 *
 * `nativeID="fb-tour"` is load-bearing: scripts/store-screenshots.mjs looks for it and
 * refuses to capture a screen with the tour over it.
 */

const SEEN_KEY = 'fb_seen_tour';
let openNow = false;
const listeners = new Set<(open: boolean) => void>();
const setOpenAll = (v: boolean) => {
  openNow = v;
  listeners.forEach((l) => l(v));
};

/** Open the tour from anywhere (the You tab's "Replay the tour"). */
export const openTour = () => setOpenAll(true);

interface Page {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  art: (active: boolean) => ReactNode;
  tint: string[];
}

const EMBER = [color.fastRed, color.redHot, color.fastRed, color.redHot, '#FF4A26'];
const TEAL = [color.miamiTeal, '#8FF3E8', '#FFFFFF'];

function pagesFor(role: Role | null, state: RewardState): Page[] {
  const coach = role === 'coach';
  const who = role === 'parent' ? 'your athlete' : 'you';
  const welcome: Page = {
    key: 'welcome',
    eyebrow: 'Welcome',
    title: coach ? 'Your program, in one place' : 'Your training, in one place',
    body: coach
      ? 'Schedule sessions, build workouts once, message families on the record, and see who put the work in.'
      : `Sessions from Coach Kingsley, the work between them, and a record of every rep ${who} put in.`,
    art: (on) => <WelcomeArt on={on} />,
    tint: EMBER,
  };
  const calendar: Page = {
    key: 'calendar',
    eyebrow: 'Calendar',
    title: coach ? 'Run the week from here' : 'Today comes first',
    body: coach
      ? 'Tap a day to add a session, or hold one and drag it to another day. Pick Everyone to post an open gym or a team event to every family.'
      : 'On a day with a session the calendar opens on it: the drills, the time, and one button to start. The month is one tap away.',
    art: (on) => <GlyphArt on={on} kind={coach ? 'team' : 'shoot'} badge={coach ? 'Everyone' : 'Up next'} />,
    tint: TEAL,
  };
  const messages: Page = {
    key: 'messages',
    eyebrow: 'Messages',
    title: 'Every message is on the record',
    body: coach
      ? 'A guardian reads everything you send their athlete, and nothing can be edited or deleted afterwards.'
      : role === 'parent'
        ? 'You read every word between Coach Kingsley and your athlete, and messaging only opens when you switch consent on.'
        : 'Your parent reads the thread too. That is how it works until you are 18, and it keeps everyone honest.',
    art: (on) => <MessagesArt on={on} />,
    tint: EMBER,
  };
  const workouts: Page = {
    key: 'workouts',
    eyebrow: 'Workouts',
    title: 'Build it once, schedule it all term',
    body: 'Make a workout from blocks of reps and minutes, then put it on a family’s calendar every week without typing it again.',
    art: (on) => <GlyphArt on={on} kind="skills" badge="12 weeks" />,
    tint: EMBER,
  };
  const locker: Page = {
    key: 'locker',
    eyebrow: 'The Locker',
    title: coach ? 'Worksheets, and who filled them in' : 'Worksheets and a timer',
    body: coach
      ? 'Each athlete’s submissions fold up under the newest, so a season of weekly forms stays one line. There is a timer here too.'
      : 'Fill in what Coach Kingsley assigns, and use the timer for a set, a wall sit or a rest. Your newest submission sits on top.',
    art: (on) => <TimerArt on={on} />,
    tint: EMBER,
  };
  const rewards: Page = {
    key: 'rewards',
    eyebrow: 'Rewards',
    title: 'The app keeps score of the work',
    body: `Opening the app counts the day, and finishing a session on the timer logs the workout. Both unlock celebrations: tap one to watch it${
      isUnlocked(CELEBRATIONS[CELEBRATIONS.length - 1], state) ? '' : ', locked or not'
    }.`,
    art: (on) => <FlameArt on={on} />,
    tint: EMBER,
  };
  const you: Page = {
    key: 'you',
    eyebrow: 'You',
    title: 'Make it yours',
    body: 'Pick your message colour, turn the glowing dust on or off, and replay this tour any time, all on the You tab.',
    art: (on) => <YouArt on={on} />,
    tint: EMBER,
  };
  return coach
    ? [welcome, calendar, workouts, messages, locker, you]
    : [welcome, calendar, messages, locker, rewards, you];
}

export function Tour({ role, state }: { role: Role | null; state: RewardState }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(openNow);
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState({ id: 'spark', nonce: 0 });
  const x = useSharedValue(0);
  const scroller = useAnimatedRef<Animated.ScrollView>();

  useEffect(() => {
    listeners.add(setOpen);
    let cancelled = false;
    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => !cancelled && !seen && setOpenAll(true))
      // A storage that will not answer is not a reason to block the app.
      .catch(() => {});
    return () => {
      cancelled = true;
      listeners.delete(setOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setIndex(0);
      x.set(0);
    }
  }, [open, x]);

  const pages = pagesFor(role, state);
  const last = index === pages.length - 1;

  const onScroll = useAnimatedScrollHandler((e) => {
    x.set(e.contentOffset.x);
  });

  function go(i: number) {
    const next = Math.max(0, Math.min(pages.length - 1, i));
    scroller.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  }

  function close() {
    setOpenAll(false);
    AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
  }

  if (!open) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View nativeID="fb-tour" style={[s.page, { paddingTop: insets.top + 8 }]}>
        <View style={s.top}>
          <Dots count={pages.length} x={x} width={width} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip the tour"
            onPress={close}
            hitSlop={8}
            style={({ pressed }) => [s.skip, pressed && { opacity: 0.6 }]}
          >
            <Text style={s.skipText}>Skip</Text>
          </Pressable>
        </View>

        <Animated.ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {pages.map((p, i) => (
            <ScrollView
              key={p.key}
              style={{ width }}
              contentContainerStyle={s.pagePad}
              showsVerticalScrollIndicator={false}
            >
              <View style={s.art}>
                <EmberField colors={p.tint} on={i === index} />
                {p.art(i === index)}
              </View>
              {i === index ? (
                <Animated.View entering={FadeInDown.duration(320).easing(Easing.bezier(0.23, 1, 0.32, 1))}>
                  <Text style={s.eyebrow}>{p.eyebrow}</Text>
                  <Text style={s.h1}>{p.title}</Text>
                  <Text style={s.body}>{p.body}</Text>
                  {p.key === 'rewards' ? (
                    <CelebrationGrid state={state} onPlay={(id) => setPreview({ id, nonce: preview.nonce + 1 })} />
                  ) : null}
                </Animated.View>
              ) : (
                <View style={{ opacity: 0 }}>
                  <Text style={s.h1}>{p.title}</Text>
                </View>
              )}
            </ScrollView>
          ))}
        </Animated.ScrollView>

        <View style={[s.foot, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          {index > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => go(index - 1)}
              style={({ pressed }) => [s.back, pressed && { backgroundColor: color.inkHover }]}
            >
              <Icon name="chevron-back" size={20} color={color.chalk} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={last ? 'Start using the app' : 'Next'}
            onPress={() => (last ? close() : go(index + 1))}
            style={({ pressed }) => [s.next, pressed && { transform: [{ scale: 0.98 }], backgroundColor: color.redDeep }]}
          >
            <Text style={s.nextText}>{last ? 'Let’s go' : 'Next'}</Text>
            {!last ? <Icon name="chevron-forward" size={18} color={color.bone} /> : null}
          </Pressable>
        </View>

        <Celebrate id={preview.id} nonce={preview.nonce} />
      </View>
    </Modal>
  );
}

/** Progress dots that stretch into a bar for the current page, following the finger. */
function Dots({ count, x, width }: { count: number; x: SharedValue<number>; width: number }) {
  return (
    <View style={s.dots} accessibilityElementsHidden>
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} i={i} x={x} width={width} />
      ))}
    </View>
  );
}

function Dot({ i, x, width }: { i: number; x: SharedValue<number>; width: number }) {
  const st = useAnimatedStyle(() => {
    const d = Math.abs(x.get() / width - i);
    const k = Math.max(0, 1 - d);
    return {
      width: 7 + k * 17,
      opacity: 0.35 + k * 0.65,
      backgroundColor: k > 0.5 ? color.redHot : color.textFaint,
    };
  });
  return <Animated.View style={[s.dot, st]} />;
}

/**
 * Embers rising through a page's art box, denser than the ambient dust because the
 * box is small and this is a moment, not a background. Only the page on screen runs it.
 */
function EmberField({ colors, on }: { colors: string[]; on: boolean }) {
  const reduced = useReducedMotion();
  if (!on || reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 22 }, (_, i) => (
        <Rising key={i} i={i} tint={colors[i % colors.length]} />
      ))}
    </View>
  );
}

const rnd = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

function Rising({ i, tint }: { i: number; tint: string }) {
  const p = useSharedValue(0);
  const ms = 2600 + rnd(i, 1) * 3200;
  const phase = rnd(i, 2);
  const left = `${4 + rnd(i, 3) * 92}%` as const;
  const size = 2 + rnd(i, 4) * 3;
  const sway = 6 + rnd(i, 5) * 14;
  useEffect(() => {
    p.set(withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1));
    return () => cancelAnimation(p);
  }, [p, ms]);
  const st = useAnimatedStyle(() => {
    const f = (p.get() + phase) % 1;
    return {
      opacity: Math.min(1, f * 5, (1 - f) * 3) * 0.85,
      transform: [{ translateY: 240 - f * 260 }, { translateX: Math.sin(f * Math.PI * 3 + i) * sway }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: tint,
          boxShadow: `0 0 ${Math.round(size * 2)}px 0px ${tint}`,
        },
        st,
      ]}
    />
  );
}

// --- the centrepieces -------------------------------------------------------

function WelcomeArt({ on }: { on: boolean }) {
  return <View style={s.center}>{on ? <Logo width={260} /> : null}</View>;
}

function GlyphArt({ on, kind, badge }: { on: boolean; kind: 'shoot' | 'team' | 'skills'; badge: string }) {
  return (
    <View style={s.center}>
      <View style={s.well}>
        <SessionGlyph kind={kind} size={112} animated={on} />
      </View>
      {on ? (
        <Animated.View entering={FadeInDown.delay(180).duration(300)} style={s.badge}>
          <View style={s.badgeDot} />
          <Text style={s.badgeText}>{badge}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function MessagesArt({ on }: { on: boolean }) {
  if (!on) return <View style={s.center} />;
  return (
    <View style={[s.center, { gap: 10, alignItems: 'stretch', paddingHorizontal: 34 }]}>
      <Animated.View entering={FadeInDown.delay(80).duration(320)} style={[s.bubble, { alignSelf: 'flex-start', backgroundColor: CHAT_COLORS.red.bg }]}>
        <Text style={s.bubbleText}>Film from Saturday: your first step is quicker.</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(420).duration(320)} style={[s.bubble, { alignSelf: 'flex-end', backgroundColor: CHAT_COLORS.teal.bg }]}>
        <Text style={s.bubbleText}>Thank you, coach. See you Thursday.</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(760).duration(320)} style={s.onRecord}>
        <Icon name="eye-outline" size={14} color={color.miamiTeal} />
        <Text style={s.onRecordText}>A guardian reads this thread</Text>
      </Animated.View>
    </View>
  );
}

const ARing = Animated.createAnimatedComponent(Circle);

function TimerArt({ on }: { on: boolean }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  const R = 70;
  const C = 2 * Math.PI * R;
  useEffect(() => {
    if (!on || reduced) {
      p.set(0.3);
      return;
    }
    p.set(0);
    p.set(withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1));
    return () => cancelAnimation(p);
  }, [on, reduced, p]);
  const ring = useAnimatedProps(() => ({ strokeDashoffset: C * p.get() }));
  return (
    <View style={s.center}>
      <Svg width={180} height={180}>
        <Defs>
          <LinearGradient id="tourArc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FF4A26" />
            <Stop offset="1" stopColor={color.fastRed} />
          </LinearGradient>
        </Defs>
        <Circle cx={90} cy={90} r={R} stroke={semantic.surfaceCard} strokeWidth={9} fill="none" />
        <ARing
          cx={90}
          cy={90}
          r={R}
          stroke="url(#tourArc)"
          strokeWidth={9}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={[C, C]}
          transform="rotate(-90 90 90)"
          animatedProps={ring}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.center]}>
        <Icon name="stopwatch-outline" size={40} color={color.redHot} />
      </View>
    </View>
  );
}

function FlameArt({ on }: { on: boolean }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!on || reduced) return;
    t.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(t);
  }, [on, reduced, t]);
  const st = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.get(), [0, 1], [0.96, 1.06]) }],
  }));
  return (
    <View style={s.center}>
      <Animated.View style={[s.flame, st]}>
        <Icon name="flame" size={72} color={color.redHot} />
      </Animated.View>
    </View>
  );
}

function YouArt({ on }: { on: boolean }) {
  const keys = Object.keys(CHAT_COLORS) as (keyof typeof CHAT_COLORS)[];
  return (
    <View style={[s.center, { flexDirection: 'row', gap: 10 }]}>
      {on
        ? keys.map((k, i) => (
            <Animated.View
              key={k}
              entering={FadeInDown.delay(60 * i).duration(280)}
              style={[s.swatch, { backgroundColor: CHAT_COLORS[k].bg }]}
            />
          ))
        : null}
    </View>
  );
}

/** Every celebration, playable, locked ones included: a grid of padlocks tells an
 *  athlete nothing about what they are chasing, and the animation is the thing. */
function CelebrationGrid({ state, onPlay }: { state: RewardState; onPlay: (id: string) => void }) {
  return (
    <View style={s.grid}>
      {CELEBRATIONS.map((c) => {
        const unlocked = isUnlocked(c, state);
        const need = [
          c.needWorkouts !== undefined ? `${c.needWorkouts} workouts` : '',
          c.needStreak !== undefined ? `${c.needStreak} day streak` : '',
        ]
          .filter(Boolean)
          .join(' or ');
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={`Play ${c.label}. ${unlocked ? 'Unlocked.' : `Unlocks at ${need}.`}`}
            onPress={() => onPlay(c.id)}
            style={({ pressed }) => [s.tile, pressed && { backgroundColor: color.inkHover }]}
          >
            <View style={s.tileTop}>
              <Text style={[s.tileWord, { color: SPECS[c.id]?.colors[0] ?? color.redHot }]}>
                {SPECS[c.id]?.word ?? c.label}
              </Text>
              <Icon name={unlocked ? 'play-circle' : 'lock-closed'} size={16} color={unlocked ? color.redHot : color.textFaint} />
            </View>
            <Text style={s.tileName}>{c.label}</Text>
            <Text style={s.tileNeed}>{unlocked ? 'Yours now' : need}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 44 },
  dots: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 7, borderRadius: 4 },
  skip: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontSize: 15, fontWeight: '700', color: color.textDim },

  pagePad: { paddingHorizontal: 22, paddingBottom: 24 },
  art: {
    height: 250,
    marginTop: 8,
    marginBottom: 22,
    borderRadius: 28,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: color.ink,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { ...type.eyebrow, color: color.redHot },
  h1: { fontSize: 28, fontWeight: '900', color: color.chalk, letterSpacing: -0.6, lineHeight: 32, marginTop: 6 },
  body: { ...type.body, fontSize: 16, lineHeight: 23, marginTop: 10 },

  well: {
    width: 150,
    height: 150,
    borderRadius: 36,
    borderCurve: 'continuous',
    backgroundColor: color.courtBlack,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(37,224,208,0.16)',
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.miamiTeal },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: color.miamiTeal },

  bubble: { maxWidth: '82%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16, borderCurve: 'continuous' },
  bubbleText: { fontSize: 14, lineHeight: 19, color: color.chalk },
  onRecord: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 6 },
  onRecordText: { fontSize: 12, fontWeight: '700', color: color.miamiTeal },

  flame: { boxShadow: '0 0 40px 0px rgba(230,12,32,0.35)', borderRadius: 60, padding: 16 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  tile: {
    width: '47.5%',
    flexGrow: 1,
    minHeight: 84,
    backgroundColor: semantic.surfaceCard,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    padding: 12,
    justifyContent: 'center',
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tileWord: { flex: 1, fontSize: 13, fontWeight: '900', letterSpacing: 0.6 },
  tileName: { fontSize: 14.5, fontWeight: '700', color: color.chalk, marginTop: 7 },
  tileNeed: { fontSize: 12, color: color.textDim, marginTop: 2 },

  foot: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  back: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.surfaceCard,
    // Something you press gets the measured edge, the app-wide rule.
    borderWidth: 1,
    borderColor: semantic.borderStrong,
  },
  next: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: color.fastRed,
    boxShadow: '0 6px 24px rgba(230,12,32,0.35)',
  },
  nextText: { fontSize: 17, fontWeight: '800', color: color.bone, letterSpacing: 0.3 },
});

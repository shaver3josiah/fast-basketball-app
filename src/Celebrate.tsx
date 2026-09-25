import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { color } from './theme';
import { playSfx } from './sfx';

/**
 * The thing that goes off when an athlete marks work done.
 *
 * Six variants, unlocked in src/rewards.ts, all driven by ONE shared value, so the whole
 * thing runs on the UI thread: a burst that stutters because JavaScript was busy writing
 * the completion to Firestore would undercut the only moment this screen has.
 *
 * Four layers, back to front:
 *  - a BLOOM of light at the centre, a radial gradient that swells and fades;
 *  - shockwave RINGS, staggered so several read as a blast wave, not a dartboard;
 *  - EMBERS, each a glowing streak drawn along its own direction of flight: long while
 *    it is fast, a dot once gravity has it, so the burst reads as thrown sparks;
 *  - GLITTER, a second wave of pinpoints that wink on across the blast radius as the
 *    embers fall away, which is the afterglow that makes it feel expensive.
 *
 * Every layer is a fixed number of components whatever the variant asks for, because
 * hooks cannot live in a loop whose length changes. The surplus render at zero opacity.
 */

interface Spec {
  colors: string[];
  word: string;
  /** How many of the embers this variant actually throws. */
  shards: number;
  /** How far they travel, in points, before gravity takes them. */
  spread: number;
  ms: number;
  /** Long streaks instead of short ones. */
  bar?: boolean;
  /** How many shockwave rings. Climbs with the unlock order: the last one an athlete
   *  earns should not look like the first. */
  rings: number;
  /** A full-screen flash behind everything. */
  flash?: string;
}

export const SPECS: Record<string, Spec> = {
  spark: { colors: [color.fastRed, color.redHot, '#FFD34D'], word: 'DONE', shards: 22, spread: 160, ms: 1100, rings: 1 },
  swish: { colors: ['#FFD34D', '#FFF1C2', color.fastRed], word: 'SWISH', shards: 28, spread: 200, ms: 1200, bar: true, rings: 2 },
  fire: { colors: ['#FF7A18', '#FFD34D', color.fastRed], word: 'HEAT CHECK', shards: 34, spread: 230, ms: 1300, bar: true, rings: 3, flash: 'rgba(255,122,24,0.30)' },
  quake: { colors: ['#F5F3EF', color.redHot, '#8E8E9B'], word: 'POSTER', shards: 30, spread: 270, ms: 1300, rings: 4, flash: 'rgba(245,243,239,0.22)' },
  bolt: { colors: ['#8FD8FF', '#FFFFFF', color.miamiTeal], word: 'LIGHTS OUT', shards: 36, spread: 290, ms: 1350, bar: true, rings: 5, flash: 'rgba(143,216,255,0.34)' },
  nova: { colors: ['#FFFFFF', '#FFD34D', color.redHot], word: 'SUPERNOVA', shards: 44, spread: 330, ms: 1500, rings: 7, flash: 'rgba(255,255,255,0.40)' },
};

const MAX_EMBERS = 44;
const MAX_RINGS = 7;
const GLITTER = 24;
/** Downward pull, points per unit of the timeline squared. */
const GRAVITY = 170;

/** Deterministic per-particle jitter. A real random would re-roll on every render and
 *  make the burst twitch mid-flight. */
const rnd = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export function Celebrate({
  id,
  nonce,
  label,
  onDone,
}: {
  /** A key from SPECS. Anything unknown falls back to the free one. */
  id: string;
  /** Bump this to play. Zero plays nothing, which is the mounted-but-idle state. */
  nonce: number;
  /** Optional line under the word, e.g. what was just finished. */
  label?: string;
  onDone?: () => void;
}) {
  const spec = SPECS[id] ?? SPECS.spark;
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const t = useSharedValue(0);

  useEffect(() => {
    if (!nonce) return;
    setPlaying(true);
    // Sound is not motion, so it plays even under Reduce Motion: someone who has turned
    // animation down has not asked to stop being told the work landed.
    playSfx(id);
    t.value = 0;
    // Linear clock; each layer applies its own easing, because an ember's flight and a
    // ring's expansion want different curves off the same time.
    t.value = withTiming(1, { duration: spec.ms, easing: Easing.linear });
    const done = setTimeout(() => {
      setPlaying(false);
      onDone?.();
    }, spec.ms + 120);
    return () => clearTimeout(done);
    // Deliberately keyed on the nonce alone: re-running this because a parent
    // re-rendered would restart the burst halfway through.
  }, [nonce]);

  const flash = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.06, 0.4, 1], [0, 1, 0.3, 0]),
  }));

  const bloom = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.05, 0.5, 1], [0, 0.95, 0.35, 0]),
    transform: reduce ? [] : [{ scale: interpolate(t.value, [0, 0.12, 1], [0.2, 1.1, 1.9]) }],
  }));

  const word = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.07, 0.75, 1], [0, 1, 1, 0]),
    transform: reduce
      ? []
      : [
          { scale: interpolate(t.value, [0, 0.13, 0.22, 0.8, 1], [2.2, 0.94, 1, 1, 1.1]) },
          { translateY: interpolate(t.value, [0, 1], [10, -28]) },
        ],
  }));

  if (!playing) return null;

  const cx = width / 2;
  const cy = height / 2;
  const B = 260;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
      {spec.flash ? (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: spec.flash }, flash]} />
      ) : null}

      <Animated.View style={[{ position: 'absolute', left: cx - B / 2, top: cy - B / 2, width: B, height: B }, bloom]}>
        <Svg width={B} height={B}>
          <Defs>
            <RadialGradient id="celebrateBloom" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
              <Stop offset="0.25" stopColor={spec.colors[0]} stopOpacity={0.7} />
              <Stop offset="1" stopColor={spec.colors[0]} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={B / 2} cy={B / 2} r={B / 2} fill="url(#celebrateBloom)" />
        </Svg>
      </Animated.View>

      {Array.from({ length: MAX_RINGS }, (_, i) => (
        <Ring key={i} i={i} t={t} spec={spec} cx={cx} cy={cy} still={reduce} />
      ))}

      {Array.from({ length: MAX_EMBERS }, (_, i) => (
        <Ember key={i} i={i} t={t} spec={spec} cx={cx} cy={cy} still={reduce} />
      ))}

      {Array.from({ length: GLITTER }, (_, i) => (
        <Glitter key={i} i={i} t={t} spec={spec} cx={cx} cy={cy} still={reduce} />
      ))}

      <Animated.View style={[s.wordBox, { top: cy - 60, width }, word]}>
        <Text
          style={[
            s.word,
            { color: spec.colors[0], textShadowColor: spec.colors[0] },
          ]}
        >
          {spec.word}
        </Text>
        {label ? <Text style={s.label}>{label}</Text> : null}
      </Animated.View>
    </View>
  );
}

interface LayerProps {
  i: number;
  t: SharedValue<number>;
  spec: Spec;
  cx: number;
  cy: number;
  still: boolean;
}

/**
 * One ember. Its position is launch velocity times time plus gravity, and it is DRAWN
 * along its current velocity: rotated to the direction it is travelling and stretched
 * by its speed, so a fresh ember is a streak and a falling one is a dot. That single
 * rule is most of what separates sparks from confetti.
 */
function Ember({ i, t, spec, cx, cy, still }: LayerProps) {
  const on = i < spec.shards;
  const angle = (i / Math.max(1, spec.shards)) * Math.PI * 2 + rnd(i, 3) * 0.7;
  const dist = spec.spread * (0.45 + rnd(i, 7) * 0.8);
  const vx = Math.cos(angle) * dist;
  const vy = Math.sin(angle) * dist - 40 * rnd(i, 13);
  const life = 0.7 + rnd(i, 17) * 0.3;
  const size = 3 + rnd(i, 5) * 3.5;
  const long = spec.bar ? 28 : 14;
  const tint = spec.colors[i % spec.colors.length];

  const st = useAnimatedStyle(() => {
    if (!on || still) return { opacity: 0 };
    const raw = Math.min(1, t.value / life);
    // Out fast, then drag: an ember loses speed, it does not glide at a constant rate.
    const p = 1 - Math.pow(1 - raw, 2.2);
    const x = vx * p;
    const y = vy * p + GRAVITY * raw * raw;
    // Current velocity, for the streak's direction and length.
    const sx = vx * 2.2 * Math.pow(1 - raw, 1.2);
    const sy = vy * 2.2 * Math.pow(1 - raw, 1.2) + 2 * GRAVITY * raw;
    const speed = Math.sqrt(sx * sx + sy * sy);
    const stretch = Math.max(1, Math.min(long / size, speed / 90));
    return {
      opacity: interpolate(raw, [0, 0.04, 0.7, 1], [0, 1, 0.85, 0]),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${Math.atan2(sy, sx)}rad` },
        { scaleX: stretch },
        { scale: interpolate(raw, [0, 0.15, 1], [0.6, 1.1, 0.4]) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: i % 3 === 0 ? '#FFFFFF' : tint,
          boxShadow: `0 0 ${Math.round(size * 2.5)}px ${Math.round(size * 0.8)}px ${tint}`,
        },
        st,
      ]}
    />
  );
}

/** A pinpoint that winks on late, somewhere inside the blast radius, and twinkles out. */
function Glitter({ i, t, spec, cx, cy, still }: LayerProps) {
  const a = rnd(i, 21) * Math.PI * 2;
  const r = spec.spread * (0.25 + rnd(i, 22) * 0.75);
  const x = Math.cos(a) * r;
  const y = Math.sin(a) * r * 0.8;
  const start = 0.25 + rnd(i, 23) * 0.35;
  const size = 2 + rnd(i, 24) * 2.5;
  const tint = spec.colors[(i + 1) % spec.colors.length];

  const st = useAnimatedStyle(() => {
    if (still) return { opacity: 0 };
    const q = (t.value - start) / (1 - start);
    if (q <= 0) return { opacity: 0 };
    const tw = 0.55 + 0.45 * Math.sin(q * 26 + i);
    return {
      opacity: interpolate(q, [0, 0.15, 1], [0, 1, 0]) * tw,
      transform: [{ translateX: x }, { translateY: y + q * 18 }, { scale: interpolate(q, [0, 0.2, 1], [0.2, 1.3, 0.6]) }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: '#FFFFFF',
          boxShadow: `0 0 ${Math.round(size * 3)}px ${Math.round(size)}px ${tint}`,
        },
        st,
      ]}
    />
  );
}

/**
 * One shockwave ring. Each starts a beat after the one before and travels further.
 * Under Reduce Motion only the innermost shows, as a fading circle that does not travel.
 */
function Ring({ i, t, spec, cx, cy, still }: LayerProps) {
  const on = i < spec.rings;
  const start = i * 0.06;
  const reach = 1.9 + i * 0.3;
  const tint = spec.colors[i % spec.colors.length];

  const st = useAnimatedStyle(() => {
    if (!on) return { opacity: 0 };
    if (still) return i === 0 ? { opacity: interpolate(t.value, [0, 0.1, 1], [0, 0.5, 0]) } : { opacity: 0 };
    const q = Math.max(0, Math.min(1, (t.value - start) / (1 - start)));
    // Ease-out: a blast wave is fastest the instant it leaves.
    const e = 1 - Math.pow(1 - q, 3);
    return {
      opacity: interpolate(q, [0, 0.06, 1], [0, Math.max(0.2, 0.85 - i * 0.09), 0]),
      transform: [{ scale: interpolate(e, [0, 1], [0.12, reach]) }],
    };
  });

  return (
    <Animated.View
      style={[
        s.ring,
        { left: cx - 90, top: cy - 90, borderColor: tint, boxShadow: `0 0 18px 2px ${tint}` },
        st,
      ]}
      pointerEvents="none"
    />
  );
}

const s = StyleSheet.create({
  ring: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 3 },
  wordBox: { position: 'absolute', alignItems: 'center' },
  word: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 1.5,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  label: { marginTop: 6, fontSize: 13, fontWeight: '700', color: color.chalk, letterSpacing: 0.4 },
});

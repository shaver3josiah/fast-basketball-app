import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  type AnimatedStyle,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { ICON, ICON_VIEW_BOX, LOGO, LOGO_H, LOGO_W, VIEW_BOX } from './brand/logo-paths';
import { color } from './theme';

/**
 * The FAST Basketball lockup, and the site's own intro animation.
 *
 * This is the swoosh build from build/site/src/styles/fb-polish.css, part for part:
 * the crescent sweeps out of a strike point with its left tip first, FAST is knocked
 * upward out of that impact rather than sliding in, the speed lines are the exhaust
 * of the hit, the A-notch strikes across, and then the rules wipe outward while
 * BASKETBALL rises between them. Same order, same delays, same two easing curves.
 *
 * The vector is the real one, copied from the brand file (src/brand/logo-paths.ts).
 * It used to be a lightning-bolt emoji, which rendered at the mercy of whichever font
 * the platform substituted and was not the client's mark in any case.
 *
 * Each animated part is its own Svg layer, stacked absolutely and sharing one
 * viewBox, so they register exactly and every part moves with an ordinary Reanimated
 * view transform. Animating SVG attributes instead would put the same motion behind a
 * much more fragile API for no gain.
 */

// The two curves the site uses. --ease-whip is fast out with a long settle;
// --ease-recoil overshoots, which is what makes the letters read as struck rather
// than placed.
const WHIP = Easing.bezierFn(0.14, 0.92, 0.22, 1);
const RECOIL = Easing.bezierFn(0.34, 1.42, 0.44, 1);

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;
const ox = (v: number) => pct(v, LOGO_W);
const oy = (v: number) => pct(v, LOGO_H);

/** Each part's transform origin, in the whole box's coordinates. Without these the
 *  crescent would sweep out of the canvas edge rather than its own left tip, and the
 *  letters would scale about the middle of the lockup rather than themselves. */
type Origin = (string | number)[];
const ORIGIN: Record<string, Origin> = {
  crescent: [ox(454), oy(518), 0],   // left tip, vertical centre
  lines: [ox(331), oy(159), 0],      // right edge: they stream leftwards
  f: [ox(420.5), oy(159), 0],
  a: [ox(637.5), oy(159), 0],
  st: [ox(1149.5), oy(159), 0],
  notch: [ox(637.5), oy(159), 0],    // the notch belongs to the A
  ruleL: [ox(243.5), oy(365), 0],
  ruleR: [ox(1317), oy(365), 0],
  word: [ox(781), oy(365), 0],
};

/** A part's own progress through its window of the timeline, eased. Returns 0 before
 *  it starts and 1 once it has landed, which is what `both` does in CSS. */
function phase(now: number, delay: number, duration: number, easing: (v: number) => number) {
  'worklet';
  const p = (now - delay) / duration;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return easing(p);
}

/** The design system's floor: below this the lockup is not legible and the square
 *  icon is the correct mark instead. Nothing in this app lays out narrower than this,
 *  so it is a guard rather than a branch. */
export const LOCKUP_MIN_WIDTH = 250;

interface PartProps {
  paths: readonly string[];
  width: number;
  height: number;
  fill: string;
  style: StyleProp<AnimatedStyle<ViewStyle>>;
}

/** One animated part of the lockup, drawn in the full viewBox so that stacking the
 *  parts lines them up with no arithmetic. */
function Part({ paths, width, height, fill, style }: PartProps) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={width} height={height} viewBox={VIEW_BOX}>
        {paths.map((d, i) => (
          <Path key={i} d={d} fill={fill} fillRule="evenodd" />
        ))}
      </Svg>
    </Animated.View>
  );
}

export function Logo({
  width,
  fill = color.fastRed,
  play = true,
}: {
  /** Rendered width in points. The lockup's aspect ratio decides the height. */
  width: number;
  fill?: string;
  /** False renders the finished lockup with no animation at all. */
  play?: boolean;
}) {
  const w = Math.max(LOCKUP_MIN_WIDTH, width);
  const h = (w * LOGO_H) / LOGO_W;
  // The design system asks for clear space of 9% of the mark's width on every side.
  // It is the rule most easily lost when a logo is dropped into somebody's layout.
  const pad = w * 0.09;

  // One clock for the whole build, in seconds, so every part below reads exactly like
  // the stylesheet it was ported from.
  const t = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!play || reduceMotion) {
      t.value = 3;
      return;
    }
    t.value = 0;
    t.value = withTiming(3, { duration: 3000, easing: Easing.linear });
  }, [play, reduceMotion, t]);

  // --- the crescent sweeps out of the strike point, left tip first ---------
  const crescent = useAnimatedStyle(() => {
    const p = phase(t.value, 0.3, 0.64, WHIP);
    return {
      opacity: interpolate(p, [0, 0.14, 1], [0, 1, 1]),
      // The sweep grows from the crescent's own left tip, as the stylesheet does.
      transformOrigin: ORIGIN.crescent,
      transform: [
        { translateX: interpolate(p, [0, 1], [-0.02 * w, 0]) },
        { scaleX: interpolate(p, [0, 0.74, 1], [0.03, 1.05, 1]) },
        { scaleY: interpolate(p, [0, 0.74, 1], [0.6, 1.02, 1]) },
        { rotate: `${interpolate(p, [0, 0.74, 1], [-5, 1.1, 0])}deg` },
      ],
    };
  });

  // --- FAST is knocked up and out of the impact ----------------------------
  // Each letter gets its own delay and its own sideways kick, so the three read as
  // struck by one impact rather than sliding in as a block.
  const hit = (p: number, dx: number, origin: Origin) => {
    'worklet';
    return {
      opacity: interpolate(p, [0, 0.58, 1], [0, 1, 1]),
      transformOrigin: origin,
      transform: [
        { translateX: interpolate(p, [0, 0.58, 1], [dx * w, 0, 0]) },
        { translateY: interpolate(p, [0, 0.58, 1], [0.48 * h, -0.05 * h, 0]) },
        { skewX: `${interpolate(p, [0, 0.58, 1], [-11, 2, 0])}deg` },
        { scale: interpolate(p, [0, 0.58, 1], [0.9, 1.02, 1]) },
      ],
    };
  };
  const fStyle = useAnimatedStyle(() => hit(phase(t.value, 0.1, 0.54, RECOIL), -0.15, ORIGIN.f));
  const aStyle = useAnimatedStyle(() => hit(phase(t.value, 0.145, 0.54, RECOIL), 0, ORIGIN.a));
  const stStyle = useAnimatedStyle(() => hit(phase(t.value, 0.19, 0.54, RECOIL), 0.13, ORIGIN.st));

  // --- speed lines: the exhaust of the hit, then two gusts ------------------
  const lines = useAnimatedStyle(() => {
    const p = phase(t.value, 0.16, 0.46, WHIP);
    // The gusts are the one live beat in the hang, so 1.0s to 2.3s is never a dead
    // frame while the screen waits for a tap.
    const gust = (start: number, len: number, amount: number) => {
      const g = (t.value - start) / len;
      if (g <= 0 || g >= 1) return 0;
      return Math.sin(g * Math.PI) * amount;
    };
    const drift = gust(1.02, 0.4, -0.06) + gust(1.68, 0.52, -0.11);
    return {
      opacity: interpolate(p, [0, 0.55, 1], [0, 1, 1]),
      transformOrigin: ORIGIN.lines,
      transform: [
        { translateX: interpolate(p, [0, 1], [-0.46 * w, 0]) + drift * w },
        { scaleX: interpolate(p, [0, 1], [3.2, 1]) + Math.abs(drift) * 3 },
      ],
    };
  });

  // --- the A-notch strikes across the letters ------------------------------
  const notch = useAnimatedStyle(() => {
    const p = phase(t.value, 0.26, 0.38, RECOIL);
    return {
      opacity: interpolate(p, [0, 0.64, 1], [0, 1, 1]),
      transformOrigin: ORIGIN.notch,
      transform: [
        { translateX: interpolate(p, [0, 0.64, 1], [0.88 * w, -0.05 * w, 0]) },
        { translateY: interpolate(p, [0, 0.64, 1], [-0.96 * h, 0.04 * h, 0]) },
        { rotate: `${interpolate(p, [0, 0.64, 1], [14, -2, 0])}deg` },
      ],
    };
  });

  // --- rules wipe outward, BASKETBALL rises between them -------------------
  // The two rules wipe outward from their own centres, so each needs its own origin.
  const ruleL = useAnimatedStyle(() => {
    const p = phase(t.value, 0.56, 0.44, WHIP);
    return { opacity: p > 0 ? 1 : 0, transformOrigin: ORIGIN.ruleL, transform: [{ scaleX: p }] };
  });
  const ruleR = useAnimatedStyle(() => {
    const p = phase(t.value, 0.56, 0.44, WHIP);
    return { opacity: p > 0 ? 1 : 0, transformOrigin: ORIGIN.ruleR, transform: [{ scaleX: p }] };
  });

  const word = useAnimatedStyle(() => {
    const p = phase(t.value, 0.6, 0.4, RECOIL);
    return {
      opacity: interpolate(p, [0, 0.62, 1], [0, 1, 1]),
      transformOrigin: ORIGIN.word,
      transform: [
        { translateY: interpolate(p, [0, 0.62, 1], [0.74 * h, -0.09 * h, 0]) },
        { scaleY: interpolate(p, [0, 0.62, 1], [0.86, 1.03, 1]) },
      ],
    };
  });

  return (
    <View
      style={{ width: w + pad * 2, height: h + pad * 2, padding: pad }}
      accessibilityRole="image"
      accessibilityLabel="FAST Basketball"
    >
      <View style={{ width: w, height: h }}>
        <Part paths={LOGO.crescent} width={w} height={h} fill={fill} style={crescent} />
        <Part paths={LOGO.lines} width={w} height={h} fill={fill} style={lines} />
        <Part paths={LOGO.f} width={w} height={h} fill={fill} style={fStyle} />
        <Part paths={LOGO.a} width={w} height={h} fill={fill} style={aStyle} />
        <Part paths={LOGO.st} width={w} height={h} fill={fill} style={stStyle} />
        <Part paths={LOGO.notch} width={w} height={h} fill={fill} style={notch} />
        <Part paths={LOGO.ruleL} width={w} height={h} fill={fill} style={ruleL} />
        <Part paths={LOGO.ruleR} width={w} height={h} fill={fill} style={ruleR} />
        <Part paths={LOGO.word} width={w} height={h} fill={fill} style={word} />
      </View>
    </View>
  );
}

/**
 * FAST on its own: the lockup's letters, speed lines and notch, with the BASKETBALL line,
 * its rules and the crescent left out, cropped to the box those parts occupy in the
 * brand file (x 24 to 1515, y 24 to 294, measured off the paths). Nothing is redrawn or
 * set in type; it is the real vector, fewer parts of it.
 *
 * For a top bar, where the full lockup would have to go under its 250px floor and the
 * small word would be unreadable. A derived mark, so it is the owner's call rather than
 * the design system's: the kit's own answer at this size is the square icon.
 */
const FAST_VIEW_BOX = '24 24 1491 270';
const FAST_PARTS = [...LOGO.lines, ...LOGO.f, ...LOGO.a, ...LOGO.st, ...LOGO.notch];

export function FastMark({
  height = 18,
  fill = color.fastRed,
  style,
}: {
  height?: number;
  fill?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const width = (height * 1491) / 270;
  return (
    <View style={[{ width, height }, style]} accessibilityRole="image" accessibilityLabel="FAST Basketball">
      <Svg width={width} height={height} viewBox={FAST_VIEW_BOX}>
        {FAST_PARTS.map((d, i) => (
          <Path key={i} d={d} fill={fill} fillRule="evenodd" />
        ))}
      </Svg>
    </View>
  );
}

/**
 * The square mark, static.
 *
 * This is the correct brand asset below the lockup's 250px floor, and the design
 * system says so in as many words: the lockup is not legible small, and stretching it
 * down there is worse than not using it at all.
 */
export function BrandIcon({ size = 44, fill = color.fastRed }: { size?: number; fill?: string }) {
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="image"
      accessibilityLabel="FAST Basketball"
    >
      <Svg width={size} height={size} viewBox={ICON_VIEW_BOX}>
        {ICON.map((d, i) => (
          <Path key={i} d={d} fill={fill} fillRule="evenodd" />
        ))}
      </Svg>
    </View>
  );
}

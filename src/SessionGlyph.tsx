import { useEffect } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SESSION_TYPES, color, type SessionType } from './theme';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
const AEllipse = Animated.createAnimatedComponent(Ellipse);

/**
 * One drawn symbol per session type, on a 48 unit grid, replacing the stock icon font
 * wherever a session is shown. Each is a single stroke path that says what the work IS:
 * a bolt for quickness, a shot's arc into a rim, a ball on the floor, a heartbeat, three
 * players joined up, a film frame.
 *
 * Animated, it is a neon trace: the path sits dim, and a short bright comet runs along
 * it over a breathing halo. The comet is strokeDashoffset on the SAME path, so it can
 * never leave the shape. There is no SVG blur filter (react-native-svg draws filters
 * unevenly across the three platforms); the bloom is a second, wider, faint stroke.
 *
 * `len` is each path's length, rounded UP: the dash gap is wider than any path, so an
 * overestimate only adds a beat of darkness between laps, and an underestimate would
 * cut the comet off early.
 */
const GLYPHS: Record<SessionType, { d: string; len: number; extra?: string }> = {
  skills: { d: 'M27 4 L12 27 H23 L20 44 L36 19 H25 Z', len: 115 },
  shoot: { d: 'M6 42 Q16 4 36 19', len: 52, extra: 'M31 20 H45 M33 20 L35.5 29 H40.5 L43 20' },
  handle: { d: 'M8 43 H40', len: 34 },
  cond: { d: 'M3 26 H14 L18 16 L24 36 L29 10 L33 26 H45', len: 100 },
  team: { d: 'M24 9 L10 37 H38 Z', len: 92 },
  rest: { d: 'M10 10 H38 Q42 10 42 14 V34 Q42 38 38 38 H10 Q6 38 6 34 V14 Q6 10 10 10 Z', len: 124, extra: 'M20 17 L31 24 L20 31 Z' },
};

const COMET = 14;
const GAP = 400;
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

export function SessionGlyph({
  kind,
  size = 34,
  animated = false,
  muted = false,
}: {
  kind: SessionType;
  size?: number;
  /** Loop the trace. For the few hero symbols on the Today snapshot only: a list of
   *  thirty looping cards is noise, and every loop is a frame of UI-thread work. */
  animated?: boolean;
  /** Canceled: drawn in slate and never animated, so it reads as switched off. */
  muted?: boolean;
}) {
  const g = GLYPHS[kind] ?? GLYPHS.skills;
  const tint = muted ? color.slate : (SESSION_TYPES[kind]?.color ?? color.slate);
  const reduced = useReducedMotion();
  const live = animated && !muted && !reduced;

  // Thin lines vanish at legend size, so the stroke thickens in grid units as the
  // symbol shrinks and lands near 1.5px on screen at every size.
  const sw = Math.max(2.4, (1.5 * 48) / size);

  const run = useSharedValue(0); // 0..1, one lap of the comet
  const breath = useSharedValue(0); // 0..1, the halo
  const bounce = useSharedValue(0); // 0 floor, 1 top, for the dribble

  useEffect(() => {
    if (!live) {
      cancelAnimation(run);
      cancelAnimation(breath);
      cancelAnimation(bounce);
      run.set(0);
      breath.set(0.5);
      bounce.set(0.6);
      return;
    }
    // Constant motion, so linear (the marquee rule), with a pause at the end of each
    // lap so it reads as a signal pulsing, not a spinner waiting on a network call.
    run.set(0);
    run.set(withRepeat(withSequence(withTiming(1, { duration: 1500, easing: Easing.linear }), withTiming(1, { duration: 600 })), -1));
    breath.set(withRepeat(withTiming(1, { duration: 1800, easing: EASE_IN_OUT }), -1, true));
    // A real ball: slow at the top, fastest at the floor. Gravity is ease-in on the way
    // down and ease-out on the way up; this is physics, not a UI entrance.
    bounce.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })
        ),
        -1
      )
    );
    return () => {
      cancelAnimation(run);
      cancelAnimation(breath);
      cancelAnimation(bounce);
    };
  }, [live, run, breath, bounce]);

  const comet = useAnimatedProps(() => ({
    strokeDashoffset: COMET - run.get() * (g.len + COMET),
  }));
  const halo = useAnimatedProps(() => ({ opacity: 0.18 + breath.get() * 0.22 }));
  const ball = useAnimatedProps(() => ({ cy: 34 - bounce.get() * 20 }));
  const seams = useAnimatedProps(() => {
    const y = 34 - bounce.get() * 20;
    return { d: `M15.5 ${y} H32.5 M24 ${y - 8.5} V${y + 8.5} M18 ${y - 6} Q21.5 ${y} 18 ${y + 6} M30 ${y - 6} Q26.5 ${y} 30 ${y + 6}` };
  });
  const shadow = useAnimatedProps(() => ({
    rx: 9 - bounce.get() * 4,
    opacity: 0.55 - bounce.get() * 0.35,
  }));

  const gid = `halo-${kind}${muted ? '-m' : ''}`;
  const common = {
    fill: 'none',
    stroke: tint,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {animated && !muted ? (
        <>
          <Defs>
            <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tint} stopOpacity={0.9} />
              <Stop offset="1" stopColor={tint} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <ACircle cx={24} cy={24} r={24} fill={`url(#${gid})`} animatedProps={halo} />
        </>
      ) : null}

      {/* The resting shape: full strength when still, dimmed when a comet runs on it. */}
      <Path d={g.d} {...common} strokeWidth={sw} strokeOpacity={live ? 0.4 : 1} />
      {g.extra ? <Path d={g.extra} {...common} strokeWidth={sw * 0.8} strokeOpacity={live ? 0.55 : 0.9} /> : null}

      {kind === 'handle' ? (
        <G>
          <AEllipse cx={24} cy={43} rx={8} ry={1.8} fill={tint} animatedProps={shadow} />
          <ACircle cx={24} cy={26} r={8.5} {...common} strokeWidth={sw} animatedProps={ball} />
          {/* Seams ride with the ball: the path is rebuilt from the same bounce value,
              so they need no transform of their own. */}
          <APath {...common} strokeWidth={sw * 0.7} strokeOpacity={0.7} animatedProps={seams} />
        </G>
      ) : null}

      {live ? (
        <>
          {/* Bloom, then the core. Both are the same dash on the same path. */}
          <APath
            d={g.d}
            {...common}
            strokeWidth={sw * 3.2}
            strokeDasharray={[COMET, GAP]}
            strokeOpacity={0.25}
            animatedProps={comet}
          />
          <APath
            d={g.d}
            fill="none"
            stroke={color.bone}
            strokeLinecap="round"
            strokeWidth={sw * 1.1}
            strokeDasharray={[COMET, GAP]}
            animatedProps={comet}
          />
        </>
      ) : null}

      {kind === 'team' ? (
        <G>
          {[
            [24, 9],
            [10, 37],
            [38, 37],
          ].map(([x, y]) => (
            <Circle key={`${x}${y}`} cx={x} cy={y} r={4.4} fill={color.courtBlack} stroke={tint} strokeWidth={sw} />
          ))}
        </G>
      ) : null}
      {kind === 'rest' ? (
        <G>
          {[12.5, 33.5].flatMap((y) =>
            [12, 22.5, 33].map((x) => (
              <Rect key={`${x}${y}`} x={x} y={y} width={3} height={2} rx={0.6} fill={tint} opacity={0.7} />
            ))
          )}
        </G>
      ) : null}
    </Svg>
  );
}

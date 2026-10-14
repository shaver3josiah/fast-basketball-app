import { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * A slow gradient wash that flows behind a box's content, in place of a coloured
 * outline. A tinted outline plus a tinted fill is two signals saying one thing, and on a
 * dark screen the ring is what reads as busy; Apple marks an emphasised surface with its
 * fill and leaves the edge alone.
 *
 * Put it FIRST inside a container that has `overflow: 'hidden'` and a radius. The band is
 * 200% of the container, painted with a gradient whose period is exactly half of it, and
 * it slides left by half its own width on a loop: the frame after the last is the first,
 * so there is no seam and no reset. The slide is a percentage translate, so nothing is
 * measured; the only thing that moves is a translateX on the UI thread.
 *
 * `peak` is the strongest alpha the tint reaches. Text sits on top of it, so the peak is
 * what contrast is measured against (scripts/contrast.mjs, Banner tones).
 */
export function FlowFill({
  tint,
  peak = 0.16,
  still = false,
}: {
  /** A #RRGGBB colour. */
  tint: string;
  peak?: number;
  /** Paint the gradient but never move it: for rows that repeat down a list. */
  still?: boolean;
}) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const id = `flow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const moving = !still && !reduced;

  useEffect(() => {
    if (!moving) {
      cancelAnimation(x);
      x.set(0);
      return;
    }
    // Constant motion, so linear. Slow enough to be ambient: one width every 7 s.
    x.set(0);
    x.set(withRepeat(withTiming(-50, { duration: 7000, easing: Easing.linear }), -1));
    return () => cancelAnimation(x);
  }, [moving, x]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: `${x.get()}%` }] }));
  const low = peak / 4;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[s.band, slide]}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={tint} stopOpacity={low} />
                <Stop offset="0.25" stopColor={tint} stopOpacity={peak} />
                <Stop offset="0.5" stopColor={tint} stopOpacity={low} />
                <Stop offset="0.75" stopColor={tint} stopOpacity={peak} />
                <Stop offset="1" stopColor={tint} stopOpacity={low} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '200%' },
});

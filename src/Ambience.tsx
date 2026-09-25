import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { color } from './theme';

/**
 * Glowing dust: a few embers drifting up behind the app's black screens, red at the
 * cool end of the ramp through orange to gold.
 *
 * It takes no layout space: one absolutely positioned layer under the tab screens,
 * whose pages are transparent so it shows in the gaps between cards and never on top
 * of anything. Each mote is a translate and an opacity on the UI thread, so the whole
 * field costs no React renders once it is running.
 *
 * On by default, off per DEVICE from the You tab (AsyncStorage, the same call the
 * first-run sheet makes): a visual preference for one phone, not a field for the
 * preferences document or its rules. Reduce Motion hides it outright, because drifting
 * particles are exactly what that setting exists to stop.
 */

const KEY = 'fb_dust';
let dustOn = true;
const listeners = new Set<(on: boolean) => void>();
AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === '0') {
      dustOn = false;
      listeners.forEach((l) => l(false));
    }
  })
  .catch(() => {});

/** The switch, shared by the layer and the setting, so flipping it takes effect at once. */
export function useDustSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(dustOn);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return [
    on,
    (next) => {
      dustOn = next;
      listeners.forEach((l) => l(next));
      AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
    },
  ];
}

/** Deterministic, so the field does not re-roll every render. */
const rnd = (i: number, salt: number) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Red, orange, gold: the ramp an ember cools along. */
const RAMP = [color.fastRed, color.redHot, '#FF7A18', '#FFB020', '#FFD34D'];

const MOTES = 20;

export function Dust() {
  const [on] = useDustSetting();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  if (!on || reduced || !width) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: MOTES }, (_, i) => (
        <Mote key={i} i={i} w={width} h={height} />
      ))}
    </View>
  );
}

function Mote({ i, w, h }: { i: number; w: number; h: number }) {
  const size = 2 + rnd(i, 1) * 2.6;
  const tint = RAMP[Math.floor(rnd(i, 2) * RAMP.length)];
  const x0 = rnd(i, 3) * w;
  const sway = 10 + rnd(i, 4) * 26;
  const turns = 1 + rnd(i, 5) * 1.5;
  const phase = rnd(i, 6);
  const peak = 0.45 + rnd(i, 7) * 0.45;
  const ms = 9000 + rnd(i, 8) * 9000;

  const p = useSharedValue(0);
  useEffect(() => {
    // One lap from the bottom to the top, linear because it is constant drift; the
    // per-mote phase is added in the worklet so they never start in a line.
    p.set(withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1));
    return () => cancelAnimation(p);
  }, [p, ms]);

  const st = useAnimatedStyle(() => {
    const f = (p.get() + phase) % 1;
    // Fades in off the bottom and out before the top, and flickers a little on the
    // way, which is what makes it read as embers rather than as bubbles.
    const edge = Math.min(1, f * 6, (1 - f) * 4);
    const flicker = 0.75 + 0.25 * Math.sin(f * 40 + i);
    return {
      opacity: peak * edge * flicker,
      transform: [
        { translateX: x0 + Math.sin(f * Math.PI * 2 * turns) * sway },
        { translateY: h * (1.02 - f * 1.1) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: tint,
          // The glow. A zero-offset shadow in the mote's own colour; new-architecture
          // boxShadow draws it on both platforms without a blur view or an image.
          boxShadow: `0 0 ${Math.round(size * 3.5)}px ${Math.round(size)}px ${tint}`,
        },
        st,
      ]}
    />
  );
}

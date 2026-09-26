import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '../src/Icon';
import { Celebrate } from '../src/Celebrate';
import { useSession } from '../src/session';
import { activeCelebration, readState } from '../src/rewards';
import { Segmented } from '../src/ui';
import { color, radius, semantic } from '../src/theme';

const ACircle = Animated.createAnimatedComponent(Circle);

const PRESETS = [30, 60, 120, 300, 600];
const SIZE = 260;
const STROKE = 10;
const R = (SIZE - STROKE) / 2 - 8;
const C = 2 * Math.PI * R;

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};
const presetLabel = (sec: number) => (sec < 60 ? `${sec}s` : `${sec / 60} min`);

/**
 * A plain timer in the Locker, for whatever someone is doing: a wall sit, a free-throw
 * block, a rest between sets. Countdown or stopwatch, nothing else.
 *
 * The countdown runs to a DEADLINE, not by decrementing a number, for the same reason
 * the workout timer does: a phone that throttles timers would otherwise make a minute
 * take seventy seconds. The ring is a Reanimated animation to that deadline on the UI
 * thread, so it sweeps smoothly while the digits tick at ten a second. The screen stays
 * awake while this is open, because a timer that goes dark mid-set is useless.
 *
 * Reaching zero fires the athlete's own celebration and a success haptic. It logs
 * nothing: the workout timer is what pays out rewards, and a timer anyone can start
 * and walk away from must not be a way to earn them.
 */
export default function Timer() {
  useKeepAwake();
  const { prefs, role } = useSession();
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<'down' | 'up'>('down');
  const [total, setTotal] = useState(60);
  const [running, setRunning] = useState(false);
  // Seconds shown. For the countdown: remaining. For the stopwatch: elapsed.
  const [shown, setShown] = useState(60);
  const [burst, setBurst] = useState(0);
  const deadline = useRef(0);
  const startedAt = useRef(0);
  const banked = useRef(0); // stopwatch seconds before the current run
  const progress = useSharedValue(0); // 0 full ring, 1 empty

  const celebration = role === 'coach' ? 'spark' : activeCelebration(readState(prefs));

  function reset(nextTotal = total, nextMode = mode) {
    setRunning(false);
    cancelAnimation(progress);
    progress.set(0);
    banked.current = 0;
    setShown(nextMode === 'down' ? nextTotal : 0);
  }

  function start() {
    if (mode === 'down') {
      if (shown <= 0) return;
      deadline.current = Date.now() + shown * 1000;
      // Sweep the ring from where it is to empty, in exactly the time left.
      progress.set(withTiming(1, { duration: shown * 1000, easing: Easing.linear }));
    } else {
      startedAt.current = Date.now();
    }
    setRunning(true);
    tap();
  }

  function pause() {
    setRunning(false);
    cancelAnimation(progress);
    if (mode === 'up') banked.current += (Date.now() - startedAt.current) / 1000;
    tap();
  }

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (mode === 'down') {
        const left = (deadline.current - Date.now()) / 1000;
        if (left <= 0) {
          setShown(0);
          setRunning(false);
          progress.set(1);
          setBurst((b) => b + 1);
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
        } else {
          setShown(left);
        }
      } else {
        setShown(banked.current + (Date.now() - startedAt.current) / 1000);
      }
    }, 100);
    return () => clearInterval(id);
  }, [running, mode, progress]);

  const ring = useAnimatedProps(() => ({ strokeDashoffset: C * progress.get() }));
  // The glowing head rides the end of the arc. The ring starts at twelve o'clock and
  // empties clockwise, so the head sits at the boundary between spent and left.
  const head = useAnimatedProps(() => {
    const a = -Math.PI / 2 + (1 - progress.get()) * Math.PI * 2;
    return { cx: SIZE / 2 + Math.cos(a) * R, cy: SIZE / 2 + Math.sin(a) * R };
  });

  const done = mode === 'down' && shown <= 0;

  return (
    <ScrollView style={s.page} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: 'Timer' }} />

      <Segmented
        label="Timer mode"
        value={mode}
        onChange={(m) => {
          setMode(m);
          reset(total, m);
        }}
        options={[
          { value: 'down', label: 'Countdown', icon: 'time-outline' },
          { value: 'up', label: 'Stopwatch', icon: 'stopwatch-outline' },
        ]}
      />

      <View style={s.dial} accessibilityLiveRegion="polite">
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <LinearGradient id="timerArc" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FF4A26" />
              <Stop offset="0.5" stopColor={color.redHot} />
              <Stop offset="1" stopColor={color.fastRed} />
            </LinearGradient>
          </Defs>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={semantic.surfaceCard} strokeWidth={STROKE} fill="none" />
          {mode === 'down' ? (
            <>
              {/* Bloom under the arc: the same arc, wide and faint. */}
              <ACircle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                stroke="url(#timerArc)"
                strokeOpacity={0.22}
                strokeWidth={STROKE * 2.6}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={[C, C]}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                animatedProps={ring}
              />
              <ACircle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                stroke="url(#timerArc)"
                strokeWidth={STROKE}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={[C, C]}
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                animatedProps={ring}
              />
              {!reduce && !done ? (
                <>
                  <ACircle r={STROKE * 1.2} fill={color.redHot} fillOpacity={0.3} animatedProps={head} />
                  <ACircle r={STROKE * 0.55} fill="#FFFFFF" animatedProps={head} />
                </>
              ) : null}
            </>
          ) : null}
        </Svg>
        <View style={s.readout}>
          <Text style={[s.digits, done && { color: color.redHot }]}>{clock(mode === 'down' ? Math.ceil(shown) : shown)}</Text>
          <Text style={s.sub}>
            {mode === 'down' ? (done ? 'Time' : `of ${clock(total)}`) : running ? 'Running' : shown > 0 ? 'Paused' : 'Ready'}
          </Text>
        </View>
      </View>

      <View style={s.controls}>
        <RoundButton icon="refresh-outline" label="Reset" onPress={() => reset()} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={running ? 'Pause' : done ? 'Start again' : 'Start'}
          onPress={() => {
            if (running) pause();
            else if (done) startFresh();
            else start();
          }}
          style={({ pressed }) => [s.go, pressed && { transform: [{ scale: 0.96 }], backgroundColor: color.redDeep }]}
        >
          <Icon name={running ? 'pause' : 'play'} size={22} color={color.bone} />
          <Text style={s.goText}>{running ? 'Pause' : done ? 'Again' : shown === (mode === 'down' ? total : 0) ? 'Start' : 'Resume'}</Text>
        </Pressable>
        <View style={{ width: 56 }} />
      </View>

      {mode === 'down' ? (
        <View style={s.presets}>
          {PRESETS.map((p) => {
            const on = p === total;
            return (
              <Pressable
                key={p}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={presetLabel(p)}
                disabled={running}
                onPress={() => {
                  setTotal(p);
                  reset(p);
                }}
                style={({ pressed }) => [
                  s.preset,
                  on && s.presetOn,
                  pressed && !on && { backgroundColor: color.inkHover },
                  running && { opacity: 0.45 },
                ]}
              >
                <Text style={[s.presetText, on && { color: color.bone }]}>{presetLabel(p)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Celebrate id={celebration} nonce={burst} label="Time" />
    </ScrollView>
  );

  // "Again" on a finished countdown: back to full, then straight into a new run.
  function startFresh() {
    deadline.current = Date.now() + total * 1000;
    progress.set(0);
    progress.set(withTiming(1, { duration: total * 1000, easing: Easing.linear }));
    setShown(total);
    setRunning(true);
  }
}

function tap() {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: 'refresh-outline';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.round, pressed && { backgroundColor: color.inkHover, transform: [{ scale: 0.95 }] }]}
    >
      <Icon name={icon} size={22} color={color.chalk} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  pad: { padding: 16, paddingBottom: 40, alignItems: 'stretch' },
  dial: { alignSelf: 'center', width: SIZE, height: SIZE, marginTop: 26, marginBottom: 20 },
  readout: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  digits: { fontSize: 64, fontWeight: '800', color: color.chalk, fontVariant: ['tabular-nums'], letterSpacing: -1 },
  sub: { fontSize: 13, fontWeight: '700', color: color.textDim, marginTop: 2, letterSpacing: 0.6 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
  },
  go: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 150,
    height: 64,
    justifyContent: 'center',
    paddingHorizontal: 22,
    borderRadius: 32,
    backgroundColor: color.fastRed,
    boxShadow: '0 6px 24px rgba(230,12,32,0.35)',
  },
  goText: { fontSize: 18, fontWeight: '800', color: color.bone, letterSpacing: 0.4 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 26 },
  preset: {
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semantic.borderStrong,
    backgroundColor: semantic.surfaceCard,
  },
  presetOn: { backgroundColor: color.fastRed, borderColor: color.fastRed },
  presetText: { fontSize: 14, fontWeight: '700', color: color.textBody },
});

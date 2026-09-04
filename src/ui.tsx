import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { color, radius, roleTint, semantic, type } from './theme';
import type { Role } from './types';

/** Page scaffold: court-black ground, consistent gutters. */
export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  if (!scroll) return <View style={[s.page, s.pad, contentStyle]}>{children}</View>;
  return (
    <ScrollView style={s.page} contentContainerStyle={[s.pad, contentStyle]}>
      {children}
    </ScrollView>
  );
}

export const Eyebrow = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ marginTop: 18, marginBottom: 8 }, style]}>
    <Text style={type.eyebrow}>{children}</Text>
  </View>
);

/**
 * The three banner tones carry real weight in this app — `watch` is how a player and a
 * parent are told, in plain words, that the conversation is visible. It is deliberately
 * loud rather than a footnote: silent monitoring of a minor is both an ethics problem
 * and an App Review problem.
 */
export function Banner({
  tone,
  title,
  children,
}: {
  tone: 'watch' | 'lock' | 'ok';
  title: string;
  children: React.ReactNode;
}) {
  const tint = {
    watch: { bg: 'rgba(37,224,208,0.10)', line: color.tealLine, ic: '◉', fg: color.miamiTeal },
    lock: { bg: color.redTint, line: color.redLine, ic: '⚿', fg: color.redHot },
    ok: { bg: 'rgba(245,243,239,0.06)', line: color.lineDark, ic: '↑', fg: color.chalk },
  }[tone];
  return (
    <View style={[s.banner, { backgroundColor: tint.bg, borderColor: tint.line }]}>
      <Text style={[s.bannerIcon, { color: tint.fg }]}>{tint.ic}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.bannerTitle, { color: tint.fg }]}>{title}</Text>
        <Text style={s.bannerBody}>{children}</Text>
      </View>
    </View>
  );
}

export function Avatar({ name, role, size = 40 }: { name: string; role: Role; size?: number }) {
  const tint = roleTint[role];
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint.bg,
        borderWidth: 1,
        borderColor: tint.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: tint.fg, fontWeight: '700', fontSize: size * 0.36 }}>{ini}</Text>
    </View>
  );
}

export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.card, style]}>{children}</View>
);

export const CardTitle = ({ children }: { children: React.ReactNode }) => (
  <Text style={s.cardTitle}>{children}</Text>
);

export const Body = ({ children }: { children: React.ReactNode }) => (
  <Text style={type.body}>{children}</Text>
);

export function Tag({ tone, children }: { tone: 'mon' | 'ro' | 'muted'; children: React.ReactNode }) {
  const tint = {
    mon: { bg: 'rgba(37,224,208,0.14)', fg: color.miamiTeal, bd: color.tealLine },
    ro: { bg: 'rgba(255,255,255,0.06)', fg: color.textDim, bd: color.lineDark },
    muted: { bg: 'rgba(255,255,255,0.06)', fg: color.textFaint, bd: color.lineDark },
  }[tone];
  return (
    <View style={[s.tag, { backgroundColor: tint.bg, borderColor: tint.bd }]}>
      <Text style={{ color: tint.fg, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6 }}>
        {children}
      </Text>
    </View>
  );
}

/**
 * A settings row with a switch. Uses a Pressable rather than RN's Switch so the whole
 * row is the target — a 44pt hit area, per the design system's own minimum.
 */
export function Setting({
  title,
  description,
  value,
  onChange,
  disabled,
  tone = 'red',
}: {
  title: string;
  description: string;
  value: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  tone?: 'red' | 'teal';
}) {
  const on = tone === 'teal' ? color.miamiTeal : color.fastRed;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={title}
      accessibilityHint={description}
      disabled={disabled || !onChange}
      onPress={() => onChange?.(!value)}
      style={[s.setting, disabled && { opacity: 0.65 }]}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.settingTitle}>{title}</Text>
        <Text style={s.settingDesc}>{description}</Text>
      </View>
      <View style={[s.track, { backgroundColor: value ? on : 'rgba(255,255,255,0.14)' }]}>
        <View style={[s.knob, value && { alignSelf: 'flex-end' }]} />
      </View>
    </Pressable>
  );
}

export const Empty = ({ icon, children }: { icon: string; children: React.ReactNode }) => (
  <View style={s.empty}>
    <Text style={{ fontSize: 32, color: color.textLabel, marginBottom: 10 }}>{icon}</Text>
    <Text style={[type.body, { textAlign: 'center', color: color.textDim }]}>{children}</Text>
  </View>
);

export const Loading = ({ label }: { label?: string }) => (
  <View style={[s.page, { alignItems: 'center', justifyContent: 'center', padding: 40 }]}>
    <ActivityIndicator color={color.redHot} />
    {label ? <Text style={[type.meta, { marginTop: 12 }]}>{label}</Text> : null}
  </View>
);

export function Button({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: pressed ? color.redHot : color.fastRed },
        (disabled || busy) && { opacity: 0.5 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={color.bone} />
      ) : (
        <Text style={s.btnLabel}>{label.toUpperCase()}</Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: semantic.surfacePage },
  pad: { padding: 16, paddingBottom: 32 },

  banner: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 12,
    marginBottom: 12,
  },
  bannerIcon: { fontSize: 15, marginTop: 1 },
  bannerTitle: { fontSize: 13, fontWeight: '800', marginBottom: 3, letterSpacing: 0.2 },
  bannerBody: { fontSize: 13, lineHeight: 18.5, color: color.textBody },

  card: {
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.cardLg,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: color.textLabel,
    marginBottom: 10,
  },

  tag: { borderWidth: 1, borderRadius: radius.badge, paddingHorizontal: 7, paddingVertical: 3 },

  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
  settingTitle: { fontSize: 14, fontWeight: '700', color: color.chalk, marginBottom: 2 },
  settingDesc: { fontSize: 12.5, lineHeight: 17, color: color.textDim },
  track: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: color.bone },

  empty: { alignItems: 'center', paddingVertical: 34 },

  btn: {
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  btnLabel: { color: color.bone, fontWeight: '800', letterSpacing: 1.4, fontSize: 13.5 },
});

import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { SquircleView } from 'expo-squircle-view';

const ANDROID = Platform.OS === 'android';

/**
 * Smoothed corners on Android, to match what iOS draws with borderCurve 'continuous'.
 *
 * Android has no continuous corner curve, so expo-squircle-view paints one: a native
 * view that draws the fill and border along a Figma-style smoothed path. It is ANDROID
 * ONLY on purpose:
 *  - iOS already gets Apple's own continuous corner from borderCurve, which also clips.
 *  - on web the package's SquircleView renders an empty <div> and drops its children,
 *    which would blank every card in the store-screenshot pipeline.
 *
 * It paints but never clips, so it is a LAYER: the container keeps its borderRadius and
 * any overflow:'hidden' for clipping, hands its fill and border colour to the layer,
 * and the layer sits behind the content. A smoothed corner lies inside the circular one
 * of the same radius, so the container's clip never cuts into the painted shape.
 */
export function SquircleLayer({ style }: { style: StyleProp<ViewStyle> }) {
  if (!ANDROID) return null;
  const f = StyleSheet.flatten(style) ?? {};
  const bw = f.borderWidth ?? 0;
  return (
    <SquircleView
      pointerEvents="none"
      // Absolute children are placed inside the border, so the layer reaches back out
      // over it to paint the edge where the border used to be.
      style={{ position: 'absolute', top: -bw, left: -bw, right: -bw, bottom: -bw }}
      borderRadius={typeof f.borderRadius === 'number' ? f.borderRadius : 0}
      backgroundColor={f.backgroundColor}
      borderColor={f.borderColor}
      borderWidth={bw}
      // Apple's own icon curve measures near 60%; the package default of 100 is rounder.
      cornerSmoothing={60}
      ignoreBorderWidthFromPadding
    />
  );
}

/** What the container keeps on Android once the layer paints for it: its box, radius and
 *  clip, but no fill and a transparent border (the border's width still holds layout). */
export const shell = (style: StyleProp<ViewStyle>): StyleProp<ViewStyle> =>
  ANDROID ? [style, { backgroundColor: 'transparent', borderColor: 'transparent' }] : style;

/** A View with smoothed corners on every platform. */
export function Surface({ style, children, ...rest }: ViewProps) {
  return (
    <View {...rest} style={shell(style)}>
      <SquircleLayer style={style} />
      {children}
    </View>
  );
}

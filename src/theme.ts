/**
 * Fast Basketball design system, ported from the site's tokens.css and
 * docs/app-preview.html. Values are copied, not re-derived — the canonical red is
 * #E60C20 and nothing in here is allowed to drift from it.
 */

import Ionicons from '@expo/vector-icons/Ionicons';

export const color = {
  courtBlack: '#0A0A0C',
  ink: '#131318',
  inkLift: '#1B1B22',
  inkHover: '#20202A',

  fastRed: '#E60C20',
  redHot: '#FF3A41',
  redDeep: '#8E0F14',

  bone: '#FFFFFF',
  chalk: '#F5F3EF',
  chalk2: '#E7E3DC',
  slate: '#6C6C78',

  miamiTeal: '#25E0D0',

  lineDark: 'rgba(255,255,255,0.10)',
  redTint: 'rgba(230,12,32,0.07)',
  redLine: 'rgba(230,12,32,0.36)',
  tealTint: 'rgba(37,224,208,0.12)',
  tealLine: 'rgba(37,224,208,0.5)',

  textLede: '#C9C9D2',
  textBody: '#B4B4C0',
  textDim: '#9C9CA9',
  textFaint: '#82828F',
  textMute: '#75757F',
  /**
   * MEASURED FAILING. 3.94:1 on the page, 3.41:1 on a card, 3.22:1 on a pressed row.
   * There is no surface in this app where it clears AA as normal text, so nothing
   * uses it. Kept only because the site DS carries it; reach for textFaint instead,
   * or textDim on anything that also renders on inkHover. `npm run contrast`.
   */
  textLabel: '#6E6E7C',
} as const;

/** Semantic aliases. Fills use the canonical red; small text uses --red-hot. */
export const semantic = {
  surfacePage: color.courtBlack,
  surfaceBand: color.ink,
  surfaceCard: color.inkLift,
  surfaceInput: '#0C0C11',
  action: color.fastRed,
  /**
   * On small text the canonical red measures 4.18:1 on court-black — below AA.
   * --red-hot is 5.59:1 and is already the DS's sanctioned action-hover/focus-ring,
   * so this is a swap inside the system rather than a new color. See APP-SPEC 4b.
   */
  actionText: color.redHot,
  focusRing: color.redHot,
  border: color.lineDark,
  /**
   * The outline of anything you can press or type into. semantic.border measures
   * 1.20 to 1.55 against every surface here, which is fine for a divider and not
   * fine for the only thing marking where a text field is. slate is the dimmest
   * token that clears 1.4.11 on all five surfaces (3.11 to 3.82).
   */
  borderStrong: color.slate,
} as const;

export const radius = {
  pill: 100,
  cardLg: 18,
  card: 14,
  badge: 11,
  chip: 10,
  input: 9,
} as const;

export const space = (n: number) => n * 4;

/** Every icon in the app comes from Ionicons, which ships with @expo/vector-icons and
 *  already draws the tab bar. Unicode glyphs used to stand in here; they render at the
 *  mercy of whichever font the platform substitutes, which is not an icon system. */
export type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Session types. Color is NEVER the only signal — every consumer must render the
 * label and the icon too (WCAG 1.4.1). Roughly 8 in 100 boys in the 11-18 target
 * are red-green colorblind and this app's primary accent is red.
 */
export const SESSION_TYPES = {
  skills: { label: 'Skills', icon: 'flash-outline', color: color.redHot },
  shoot: { label: 'Shooting', icon: 'locate-outline', color: color.miamiTeal },
  // Red and teal are the only two hues this palette has, and both were already spent,
  // so these two take steps off the same light-grey ramp as Small Group and Rest.
  // Measured on every surface they are drawn on: textLede is 12.0:1 on the page and
  // 10.4:1 on a card, textBody 9.6:1 and 8.3:1, both well past the 7.3:1 Rest has
  // shipped with. The icon and the word are what actually tell them apart.
  handle: { label: 'Ball Handling', icon: 'basketball-outline', color: color.textLede },
  cond: { label: 'Conditioning', icon: 'pulse-outline', color: color.textBody },
  team: { label: 'Small Group', icon: 'people-outline', color: color.chalk },
  rest: { label: 'Rest / Film', icon: 'film-outline', color: '#9C9CA9' },
} as const satisfies Record<string, { label: string; icon: IconName; color: string }>;

export type SessionType = keyof typeof SESSION_TYPES;

/**
 * Every category a workout covers. One session is often two things at once, ball
 * handling and shooting, so `types` carries the whole set.
 *
 * `type` stays the primary one and is never dropped: firebase/firestore.rules
 * validates documents by field name, the calendar tints a day with a single colour,
 * and there is real data in Firestore that predates the set. A document written
 * before today has no `types` at all, and falling back to the single field is the
 * whole reason it still renders. Read a category through here, never off `.type`
 * directly, or a second selection silently disappears from wherever you forgot.
 */
export const typesOf = (x: { type: SessionType; types?: SessionType[] }): SessionType[] =>
  x.types?.length ? x.types : [x.type];

/**
 * The DS display faces (Anton / Bebas / Barlow) are not bundled — shipping four
 * webfont families would add megabytes to the binary for chrome the phone already
 * draws well. Weight and tracking carry the brand instead.
 * ponytail: add expo-font + the woff2 files from build/site/dist/fonts the day a
 * screenshot looks wrong, not before.
 */
export const type = {
  display: { fontSize: 26, fontWeight: '800' as const, letterSpacing: 0.4 },
  title: { fontSize: 17, fontWeight: '700' as const, letterSpacing: 0.2 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
    color: color.textFaint,
  },
  body: { fontSize: 15, lineHeight: 21, color: color.textBody },
  meta: { fontSize: 12, color: color.textDim },
  label: { fontSize: 13, fontWeight: '600' as const, color: color.textLede },
} as const;

/**
 * The colour an account's own message bubbles are painted in, picked on the You tab.
 *
 * Every one of these is dark enough to carry `chalk` body text and `textLede` stamps
 * at AA (measured: 7.0:1 to 10.2:1 and 4.7:1 to 6.8:1). That is the whole constraint
 * on the list — a picker offering a colour the text cannot be read on is not a choice,
 * it is a trap. Add to it only with the ratios measured, not guessed.
 */
export const CHAT_COLORS = {
  red: { label: 'Fast red', bg: color.redDeep },
  ember: { label: 'Ember', bg: '#8A3A0C' },
  gold: { label: 'Gold', bg: '#6B4A06' },
  forest: { label: 'Forest', bg: '#1B5630' },
  teal: { label: 'Miami', bg: '#0B5A52' },
  ocean: { label: 'Ocean', bg: '#17407A' },
  violet: { label: 'Violet', bg: '#4A2A73' },
} as const satisfies Record<string, { label: string; bg: string }>;

export type ChatColor = keyof typeof CHAT_COLORS;

/** Unknown or unset falls back to the brand red the app shipped with. */
export const bubbleColor = (key?: string): string =>
  (CHAT_COLORS as Record<string, { bg: string }>)[key ?? '']?.bg ?? CHAT_COLORS.red.bg;

/** Avatar tint per role — matches the preview's .av.coach / .parent / .player. */
export const roleTint = {
  coach: { bg: color.redTint, fg: color.redHot, border: color.fastRed },
  parent: { bg: color.tealTint, fg: color.miamiTeal, border: color.tealLine },
  player: { bg: 'rgba(245,243,239,0.12)', fg: color.chalk, border: color.chalk2 },
} as const;

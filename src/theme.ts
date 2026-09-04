/**
 * Fast Basketball design system, ported from the site's tokens.css and
 * docs/app-preview.html. Values are copied, not re-derived — the canonical red is
 * #E60C20 and nothing in here is allowed to drift from it.
 */

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

/**
 * Session types. Color is NEVER the only signal — every consumer must render the
 * label and the icon too (WCAG 1.4.1). Roughly 8 in 100 boys in the 11-18 target
 * are red-green colorblind and this app's primary accent is red.
 */
export const SESSION_TYPES = {
  skills: { label: 'Skills', icon: '⚡', color: color.redHot },
  shoot: { label: 'Shooting', icon: '◎', color: color.miamiTeal },
  team: { label: 'Small Group', icon: '▣', color: color.chalk },
  rest: { label: 'Rest / Film', icon: '○', color: '#9C9CA9' },
} as const;

export type SessionType = keyof typeof SESSION_TYPES;

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
    color: color.textLabel,
  },
  body: { fontSize: 15, lineHeight: 21, color: color.textBody },
  meta: { fontSize: 12, color: color.textDim },
  label: { fontSize: 13, fontWeight: '600' as const, color: color.textLede },
} as const;

/** Avatar tint per role — matches the preview's .av.coach / .parent / .player. */
export const roleTint = {
  coach: { bg: 'rgba(230,12,32,0.16)', fg: color.redHot, border: color.redLine },
  parent: { bg: 'rgba(37,224,208,0.14)', fg: color.miamiTeal, border: color.tealLine },
  player: { bg: 'rgba(245,243,239,0.12)', fg: color.chalk, border: color.lineDark },
} as const;

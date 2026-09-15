/**
 * Regenerates src/brand/logo-paths.ts from the site's own brand file.
 *
 * The lockup is fixed artwork. Copying the paths is the point: a hand-traced
 * approximation of a client's logo is the kind of thing nobody notices until a
 * printer does. Run this if build/site/src/brand/logo-anim.svg ever changes.
 *
 *   node scripts/logo-paths.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAND = resolve(HERE, '..', '..', 'build', 'site', 'src', 'brand');
const SRC = join(BRAND, 'logo-anim.svg');
const ICON_SRC = join(BRAND, 'icon.svg');
const OUT = join(HERE, '..', 'src', 'brand', 'logo-paths.ts');

const svg = readFileSync(SRC, 'utf8');
const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
if (!viewBox) throw new Error('no viewBox in ' + SRC);

// The class names are the site's own animation parts, and they are what
// src/Logo.tsx moves. Order matters: it is the paint order of the lockup.
const partOf = (cls) =>
  cls.includes('al-ln') ? 'lines'
  : cls.includes('al-notch') ? 'notch'
  : cls.includes('al-f') ? 'f'
  : cls.includes('al-a') ? 'a'
  : cls.includes('al-st') ? 'st'
  : cls.includes('al-cres') ? 'crescent'
  : cls.includes('al-rule-l') ? 'ruleL'
  : cls.includes('al-rule-r') ? 'ruleR'
  : cls.includes('al-wl') ? 'word'
  : 'other';

const groups = {};
for (const m of svg.matchAll(/<path class="([^"]+)"[^>]*?d="([^"]+)"/g)) {
  (groups[partOf(m[1].trim())] ||= []).push(m[2]);
}
if (groups.other) throw new Error('unrecognised logo part class in ' + SRC);

const order = ['crescent', 'lines', 'f', 'a', 'st', 'notch', 'ruleL', 'ruleR', 'word'];
const missing = order.filter((k) => !groups[k]?.length);
if (missing.length) throw new Error('missing logo parts: ' + missing.join(', '));

// The square mark, a separate file and a separate coordinate space.
const iconSvg = readFileSync(ICON_SRC, 'utf8');
const iconBox = iconSvg.match(/viewBox="([^"]+)"/)?.[1];
const iconPaths = [...iconSvg.matchAll(/<path[^>]*?d="([^"]+)"/g)].map((m) => m[1]);
if (!iconBox || !iconPaths.length) throw new Error('could not read ' + ICON_SRC);

const [, , w, h] = viewBox.split(/\s+/);
writeFileSync(
  OUT,
  `/**
 * The FAST Basketball lockup, copied verbatim out of the site's own
 * build/site/src/brand/logo-anim.svg. GENERATED - do not edit by hand.
 * Regenerate with \`node scripts/logo-paths.mjs\`.
 *
 * Grouped by the animation part the site gives each path, so src/Logo.tsx can move
 * them the way the intro overlay does.
 */

/** The lockup's own coordinate space. Every part is drawn in it, so stacking the
 *  parts registers them exactly. */
export const VIEW_BOX = ${JSON.stringify(viewBox)};
export const LOGO_W = ${w};
export const LOGO_H = ${h};

export const LOGO = {
${order.map((k) => `  ${k}: ${JSON.stringify(groups[k])},`).join('\n')}
} as const;

/** The square icon mark. The design system calls for it anywhere the lockup would
 *  fall below its 250px floor, which inside an app is most places. */
export const ICON_VIEW_BOX = ${JSON.stringify(iconBox)};
export const ICON = ${JSON.stringify(iconPaths)};
`
);
console.log(`logo-paths.ts: icon 1, ${order.map((k) => `${k} ${groups[k].length}`).join(', ')}`);

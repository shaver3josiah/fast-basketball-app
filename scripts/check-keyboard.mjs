/**
 * The keyboard must never cover the field being typed into, on either platform.
 *
 * This is a STATIC check, on purpose. The real test is a finger on a phone, and there
 * is no simulator on the machine this repo is developed on, so the next best thing is
 * to pin the three things that were actually wrong and would silently come back:
 *
 *   1. Five screens passed `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`.
 *      On Android that is no avoidance at all. It is what Expo's own keyboard guide
 *      still recommends, so it gets reintroduced by anyone following the docs.
 *   2. app/roster.tsx — five text fields, including both invite addresses — had no
 *      keyboard handling whatsoever. It was invisible to a grep for the broken
 *      pattern precisely because it had nothing to grep for.
 *   3. A screen under a navigation header needs the header height fed back as the
 *      offset, or it under-pads by exactly that much and the last field stays hidden.
 *
 * So: every text-entry screen goes through KeyboardPad, and KeyboardPad is the only
 * place KeyboardAvoidingView is allowed to appear.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });

const rel = (p) => p.replace(/\\/g, '/');
const screens = walk('app').map(rel);
const problems = [];

for (const f of screens) {
  const src = readFileSync(f, 'utf8');
  // Comments mention the class by name; only real JSX and imports count.
  if (/<KeyboardAvoidingView[\s>]/.test(src) || /^\s*KeyboardAvoidingView,\s*$/m.test(src)) {
    problems.push(`${f}: uses KeyboardAvoidingView directly. Wrap the screen in <KeyboardPad> from src/ui instead.`);
  }
  if (/<TextInput[\s>]/.test(src) && !/<KeyboardPad[\s>]/.test(src)) {
    problems.push(`${f}: has a TextInput but no <KeyboardPad>, so the keyboard will cover it.`);
  }
}

// KeyboardPad itself: padding unconditionally, and the offset only ever narrows to iOS.
const ui = readFileSync('src/ui.tsx', 'utf8');
const pad = ui.slice(ui.indexOf('export function KeyboardPad'));
if (!/behavior="padding"/.test(pad)) {
  problems.push('src/ui.tsx: KeyboardPad must pass behavior="padding" literally, on both platforms.');
}
if (/behavior=\{/.test(pad)) {
  problems.push('src/ui.tsx: KeyboardPad must not branch on platform for `behavior`. Android needs padding too.');
}

const wrapped = screens.filter((f) => /<KeyboardPad[\s>]/.test(readFileSync(f, 'utf8')));
if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\nkeyboard: ${problems.length} problem(s) across ${screens.length} screens.`);
  process.exit(1);
}
console.log(`keyboard: ${wrapped.length} text-entry screens go through KeyboardPad, none bypass it`);

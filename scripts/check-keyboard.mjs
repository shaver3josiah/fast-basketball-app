/**
 * The keyboard must never cover the field being typed into, on either platform.
 *
 * This is a STATIC check, on purpose: there is no simulator on the machine this repo is
 * developed on, so the next best thing is to pin the things that were actually wrong.
 *
 * THE HISTORY MATTERS, because the wrong fix looks right in a diff.
 *
 * Attempt one passed `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`, which is
 * no avoidance at all on Android. Attempt two changed that to `behavior="padding"` on both
 * platforms with a hand-computed header offset, and it ALSO did nothing, on both phones.
 *
 * The reason is that React Native's own KeyboardAvoidingView cannot work in this app.
 * From Android 15 (target SDK 35) edge to edge is forced, the window no longer resizes
 * under the keyboard, and that component has nothing left to measure. It is
 * facebook/react-native#49759 and it is still open. Expo SDK 54 and up cannot opt out of
 * edge to edge on Android 16 at all.
 *
 * So the fix is react-native-keyboard-controller, which tracks the keyboard itself, and
 * the rules below exist to stop anyone quietly going back to the built-in one.
 *
 * There are two containers, because lifting and scrolling are different problems:
 *   KeyboardPad  wraps a fixed bar over a list, the message composer.
 *   KeyboardForm and Screen scroll the focused field INTO VIEW, which padding alone
 *   cannot do. That is what left "Notes for the family" under the keyboard: the form was
 *   padded, so there was room below, but nothing ever moved the field up into it.
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
const CONTAINERS = /<(KeyboardPad|KeyboardForm|Screen)[\s>]/;

for (const f of screens) {
  const src = readFileSync(f, 'utf8');

  // The built-in component, by any route. Comments name it, so only imports and JSX count.
  const importsBuiltIn =
    /import\s*\{[^}]*\bKeyboardAvoidingView\b[^}]*\}\s*from\s*'react-native'/s.test(src) ||
    /^\s*KeyboardAvoidingView,\s*$/m.test(src);
  if (importsBuiltIn) {
    problems.push(
      `${f}: imports KeyboardAvoidingView from react-native. That one does not work on ` +
        `Android 15 and up. Use <KeyboardPad> or <KeyboardForm> from src/ui.`
    );
  }

  if (/<TextInput[\s>]/.test(src) && !CONTAINERS.test(src)) {
    problems.push(
      `${f}: has a TextInput but no <KeyboardPad>, <KeyboardForm> or <Screen>, so the ` +
        `keyboard will cover it.`
    );
  }
}

// The two containers, and the provider that makes either of them move at all.
const ui = readFileSync('src/ui.tsx', 'utf8');
if (!/from\s*'react-native-keyboard-controller'/.test(ui)) {
  problems.push('src/ui.tsx: must take its keyboard components from react-native-keyboard-controller.');
}
const pad = ui.slice(ui.indexOf('export function KeyboardPad'), ui.indexOf('export function KeyboardForm'));
if (!/behavior="padding"/.test(pad)) {
  problems.push('src/ui.tsx: KeyboardPad must pass behavior="padding" literally, on both platforms.');
}
if (!/automaticOffset/.test(pad)) {
  problems.push(
    'src/ui.tsx: KeyboardPad must pass automaticOffset. Without it the navigation header ' +
      'is unaccounted for and the bottom of the screen stays hidden.'
  );
}
if (/Platform\.OS/.test(pad)) {
  problems.push('src/ui.tsx: KeyboardPad must not branch on platform. Android needs the same treatment as iOS.');
}
if (!/KeyboardAwareScrollView/.test(ui.slice(ui.indexOf('export function Screen')))) {
  problems.push(
    'src/ui.tsx: Screen must scroll with KeyboardAwareScrollView, or a field low on a long ' +
      'form is never moved out from under the keyboard.'
  );
}

const layout = readFileSync('app/_layout.tsx', 'utf8');
if (!/<KeyboardProvider>/.test(layout)) {
  problems.push(
    'app/_layout.tsx: KeyboardProvider must wrap the app. Without it every keyboard-aware ' +
      'component renders normally and simply never moves.'
  );
}

const wrapped = screens.filter((f) => CONTAINERS.test(readFileSync(f, 'utf8')));
if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\nkeyboard: ${problems.length} problem(s) across ${screens.length} screens.`);
  process.exit(1);
}
console.log(
  `keyboard: ${wrapped.length} screens go through KeyboardPad/KeyboardForm/Screen, ` +
    `none reach the built-in KeyboardAvoidingView`
);

/**
 * Rewrite the coachUid() constant inside firebase/firestore.rules.
 *
 *   npm run set-coach-uid -- <uid>
 *
 * This is the one edit the owner has to make when Blake's real Auth account exists.
 * The rules file is the security model, so it gets a checked, reversible edit with a
 * before/after print rather than a hand-rolled sed — which on PowerShell is exactly
 * the kind of quoting that silently writes nothing and leaves the placeholder in place.
 *
 * Exported so scripts/seed.mjs can call it for the demo uid instead of duplicating it.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RULES_FILE = join(ROOT, 'firebase', 'firestore.rules');
export const ENV_FILE = join(ROOT, '.env');

// The whole statement is matched, so a partial/duplicated write cannot happen.
const RE = /(function coachUid\(\)\s*\{\s*return\s*')([^']*)('\s*;\s*\})/;

/** Firebase uids are <=128 chars of [A-Za-z0-9_-]; anything else is a typo or an email. */
export const isUid = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);

export function setCoachUid(uid, file = RULES_FILE) {
  if (!isUid(uid)) throw new Error(`"${uid}" is not an Auth uid (expected [A-Za-z0-9_-]{1,128})`);
  const src = readFileSync(file, 'utf8');
  const m = src.match(RE);
  if (!m) throw new Error(`coachUid() not found in ${file} — has the rules file been reshaped?`);
  const before = m[2];
  const changed = before !== uid;
  if (changed) writeFileSync(file, src.replace(RE, `$1${uid}$3`), 'utf8');
  return { file, before, after: uid, changed };
}

/**
 * The rules constant and EXPO_PUBLIC_COACH_UID have to be the same value: the rules
 * decide who the coach IS, the env var decides which screens the app draws for him.
 * Disagree and Blake signs in to an app that shows him nothing. Writing only one of
 * them and printing a reminder about the other is how they drift, so both are written
 * together or neither is.
 */
export function setCoachUidInEnv(uid, file = ENV_FILE) {
  if (!existsSync(file)) return { file, changed: false, missing: true };
  const src = readFileSync(file, 'utf8');
  const line = `EXPO_PUBLIC_COACH_UID=${uid}`;
  // Only a real assignment, never a commented example.
  const RE_ENV = /^EXPO_PUBLIC_COACH_UID=.*$/m;
  const next = RE_ENV.test(src)
    ? src.replace(RE_ENV, line)
    : src.replace(/\n*$/, '') + '\n' + line + '\n';
  const changed = next !== src;
  if (changed) writeFileSync(file, next, 'utf8');
  return { file, changed, missing: false };
}

/**
 * Ask for a password without echoing it. Node has no built-in for this, and the
 * alternative — passing it as an argument — writes it into shell history.
 */
function askHidden(prompt) {
  return new Promise((resolve) => {
    // Terminal mode only when stdin really is one. Forcing it on a pipe makes the
    // masking pointless and leaves node tearing down a handle it believes is a tty,
    // which on Windows prints a libuv assertion after the command has already finished.
    const isTty = process.stdin.isTTY === true;
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: isTty });
    const onData = (ch) => {
      // Redraw the prompt with nothing after it, so the characters never appear.
      if (![String.fromCharCode(13), String.fromCharCode(10)].includes(ch)) {
        process.stdout.write('\r' + prompt);
      }
    };
    if (isTty) process.stdin.on('data', onData);
    rl.question(prompt, (answer) => {
      if (isTty) process.stdin.off('data', onData);
      rl.close();
      process.stdin.pause();
      // KNOWN, cosmetic: piping input to this script (rather than typing) makes node on
      // Windows print "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" as it
      // exits — AFTER the work has finished, exit code and files unaffected. pause(),
      // unref() and destroy() were all tried and none of them suppress it. Typing the
      // password interactively, which is the only real way to use this, does not hit it.
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

/**
 * Resolve an email address to its Auth uid by signing in as that account.
 *
 * There is no way to look a uid up from an address without an Admin SDK service-account
 * key, which is a credential nobody should be passing around to save one console visit.
 * Signing in proves you hold the account, and the password goes straight to Google over
 * HTTPS — it is never stored, logged, or passed as an argument.
 */
async function uidForEmail(email) {
  const envPath = ENV_FILE;
  if (!existsSync(envPath)) throw new Error('.env is missing — cannot find the Firebase API key.');
  const apiKey = (readFileSync(envPath, 'utf8').match(/^EXPO_PUBLIC_FIREBASE_API_KEY=(.+)$/m)?.[1] ?? '').trim();
  if (!apiKey) throw new Error('EXPO_PUBLIC_FIREBASE_API_KEY is not set in .env');

  const password = await askHidden(`Password for ${email}: `);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(
      msg === 'INVALID_LOGIN_CREDENTIALS'
        ? `Wrong password, or no account for ${email}. (Firebase will not say which.)`
        : msg
    );
  }
  return body.localId;
}

// Run directly (`npm run set-coach-uid -- <uid>`); importing it from seed.mjs does not
// trip this. The basename is separator-agnostic, so it holds on Windows too.
if (process.argv[1]?.endsWith('set-coach-uid.mjs')) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: node scripts/set-coach-uid.mjs <auth-uid | email>');
    process.exit(2);
  }
  let uid = arg;
  try {
    if (arg.includes('@')) {
      console.log(`Looking up ${arg} — signing in to read its uid.`);
      uid = await uidForEmail(arg);
      console.log('  uid: ' + uid + '\n');
    }
    const r = setCoachUid(uid);
    console.log(`${r.file}`);
    console.log(`  before: function coachUid() { return '${r.before}'; }`);
    console.log(`  after:  function coachUid() { return '${r.after}'; }`);
    console.log(r.changed ? '  written.' : '  already set — nothing written.');

    const e = setCoachUidInEnv(uid);
    console.log(`\n${e.file}`);
    if (e.missing) {
      console.log('  NOT FOUND — create .env from .env.example, then run this again.');
      process.exit(1);
    }
    console.log(`  EXPO_PUBLIC_COACH_UID=${uid}`);
    console.log(e.changed ? '  written.' : '  already set — nothing written.');

    console.log('\nNow redeploy the rules so the new coach uid takes effect:');
    console.log(
      '  npx firebase deploy --only firestore:rules --project fast-basketball-b3ebe --config firebase/firebase.json'
    );
  } catch (e) {
    console.error(`set-coach-uid: ${e.message}`);
    process.exit(1);
  }
}

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

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const RULES_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'firebase',
  'firestore.rules'
);

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

// Run directly (`npm run set-coach-uid -- <uid>`); importing it from seed.mjs does not
// trip this. The basename is separator-agnostic, so it holds on Windows too.
if (process.argv[1]?.endsWith('set-coach-uid.mjs')) {
  const uid = process.argv[2];
  if (!uid) {
    console.error('usage: node scripts/set-coach-uid.mjs <auth-uid>');
    process.exit(2);
  }
  try {
    const r = setCoachUid(uid);
    console.log(`${r.file}`);
    console.log(`  before: function coachUid() { return '${r.before}'; }`);
    console.log(`  after:  function coachUid() { return '${r.after}'; }`);
    console.log(r.changed ? '  written.' : '  already set — nothing written.');
    console.log(`\nSet EXPO_PUBLIC_COACH_UID=${r.after} for the app, and redeploy the rules.`);
  } catch (e) {
    console.error(`set-coach-uid: ${e.message}`);
    process.exit(1);
  }
}

/**
 * npm run review:account -- --key <service-account.json>          provision, then verify
 * npm run review:account -- --key <service-account.json> --check   verify only
 *
 * Builds and proves the demo account that Google Play and App Review sign in with.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AS A SCRIPT AND NOT A RUNBOOK
 * ---------------------------------------------------------------------------
 * It used to be a runbook. `docs/owner-open-items.md` listed three steps -- click the
 * verification link, have the coach invite the address, put messages in the thread --
 * and all three were skipped, so Play rejected version code 18 with "Multi-factor
 * authentication blocks access": the reviewer signed in and hit the app's own
 * email-verification gate with no way through it.
 *
 * The gate is real and stays. src/session.tsx exempts only the coach, because his
 * identity is a uid constant in firestore.rules rather than an address. Everyone else
 * must verify, which is correct for a product where a stranger must not be able to
 * reach a minor's conversation by typing an address they do not own.
 *
 * What changes is that `emailVerified` is set HERE, through the Identity Toolkit admin
 * API, instead of by a human opening an inbox. Google's own rule (Play Console Help
 * 15748846) is that sign-in details must be "accessible at all times, reusable, and
 * valid regardless of user location", and that an app which would otherwise demand an
 * OTP must "provide reusable login credentials that can bypass these requirements".
 * A pre-verified account satisfies that exactly, and needs no code path that a real
 * user does not also take.
 *
 * REJECTED, deliberately: a "demo mode" button on the sign-in screen, and a hardcoded
 * bypass keyed to the reviewer's address. Both are reported to work. Both put a door
 * into a child-safety app whose whole promise is that there is no way in without an
 * invitation, and this repository is public, so the door would be documented too.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT firebase-admin
 * ---------------------------------------------------------------------------
 * Same trade scripts/seed.mjs already made: ~40 transitive packages to write a dozen
 * documents is not worth it. The service-account JWT dance is already solved in
 * scripts/play-upload.mjs, so accessToken() is imported from there rather than
 * rewritten. The Firestore value encoder is hand-rolled below because seed.mjs runs
 * its emulator guards at module scope -- importing it from a script holding a real
 * credential would hard-exit by design, which is the guard working.
 */

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { accessToken } from './play-upload.mjs';

const PROJECT = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const COACH = process.env.EXPO_PUBLIC_COACH_UID;

// Neither of these is in the repo, which is public. They are documented by NAME in
// .env.example and by VALUE in docs/owner-open-items.md, which is not version
// controlled. REVIEW_EMAIL is a real address the owner controls; printing it here
// would publish it.
const EMAIL = process.env.REVIEW_EMAIL;
const PASSWORD = process.env.REVIEW_PASSWORD;
const PLAYER_EMAIL = process.env.REVIEW_PLAYER_EMAIL;
const PLAYER_PASSWORD = process.env.REVIEW_PLAYER_PASSWORD;

// THE SYNTHETIC RECORD. Fixed ids, and nothing in this file writes to any athlete but
// this one. That is the guardrail: the shortest path for a tired operator is to add the
// reviewer as a second guardian on a REAL family's athlete, which would hand a Google
// reviewer a real conversation about a real child. Making that impossible here beats
// writing a sentence asking nobody to do it.
const ATHLETE = 'review-demo-athlete';
const T_PARENT = 'review-demo-thread-parent';
const T_PLAYER = 'review-demo-thread-player';

const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const IDP = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;

const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const keyPath = args[args.indexOf('--key') + 1];

function requireEnv() {
  for (const [name, v] of [
    ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', PROJECT],
    ['EXPO_PUBLIC_FIREBASE_API_KEY', API_KEY],
    ['EXPO_PUBLIC_COACH_UID', COACH],
    ['REVIEW_EMAIL', EMAIL],
    ['REVIEW_PASSWORD', PASSWORD],
  ]) {
    if (!v) die(`${name} is not set. The first three come from .env; the review ones are in docs/owner-open-items.md.`);
  }
  // A password Play will still accept in six months. Google's rule is that sign-in
  // details are "maintained at all times without any error" -- an expiring or rotated
  // password is a rejection, so this one is set by the script and never by a human
  // typing it into a form.
  if (PASSWORD.length < 12) {
    die('REVIEW_PASSWORD is under 12 characters. Play rejects credentials that stop working; pick one nobody will feel the need to change.');
  }
}

// --- Firestore's typed-value encoding ---------------------------------------
// Hand-rolled for the reason in the header. Same shape as the one in seed.mjs.

export const val = (v) =>
  v === null
    ? { nullValue: null }
    : v instanceof Date
      ? { timestampValue: v.toISOString() }
      : typeof v === 'string'
        ? { stringValue: v }
        : typeof v === 'boolean'
          ? { booleanValue: v }
          : typeof v === 'number'
            ? Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
            : Array.isArray(v)
              ? { arrayValue: { values: v.map(val) } }
              : { mapValue: { fields: fields(v) } };

export const fields = (o) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, val(v)])
  );

export const plain = (f = {}) =>
  Object.fromEntries(
    Object.entries(f).map(([k, v]) => [
      k,
      v.stringValue ?? v.booleanValue ?? v.integerValue ??
      v.timestampValue ?? (v.arrayValue ? (v.arrayValue.values ?? []).map((x) => x.stringValue) : undefined),
    ])
  );

async function api(url, { token, method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url.replace(API_KEY ?? '', 'KEY')} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const daysAgo = (n, h = 16, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d;
};

// --- provision ---------------------------------------------------------------

/** Create the account if it is new, and in every case force emailVerified and the password. */
async function ensureUser(token, email, password, displayName) {
  const found = await api(`${IDP}/accounts:lookup`, {
    token, method: 'POST', body: { email: [email] },
  });
  const existing = found.users?.[0];

  if (existing) {
    // update, not create: the account already exists from an earlier attempt and its
    // uid is referenced by any athlete record that already claimed it.
    await api(`${IDP}/accounts:update`, {
      token, method: 'POST',
      body: { localId: existing.localId, email, password, emailVerified: true, displayName },
    });
    return { uid: existing.localId, created: false };
  }

  const made = await api(`${IDP}/accounts`, {
    token, method: 'POST',
    body: { email, password, emailVerified: true, displayName },
  });
  return { uid: made.localId, created: true };
}

/**
 * The guardrail, as a pure function. Returns the offending [field, value] when the
 * athlete id has been repurposed for a real family, else null.
 *
 * This is the one check that protects a person rather than a submission: the shortest
 * path for a tired operator is to attach the reviewer to a REAL athlete, which hands a
 * Google reviewer a real conversation about a real child. An empty record is safe
 * (nothing to destroy); a record naming any address but a review address is not.
 */
export function unsafeTarget(f, email, playerEmail) {
  for (const k of ['guardianEmail', 'playerEmail']) {
    const v = f?.[k];
    if (v && v !== email && v !== playerEmail) return [k, v];
  }
  return null;
}

/** Refuse to touch anything but the synthetic record. */
async function assertSafeTarget(token) {
  let doc;
  try {
    doc = await api(`${FS}/athletes/${ATHLETE}`, { token });
  } catch (e) {
    if (String(e).includes('404')) return; // does not exist yet, nothing to protect
    throw e;
  }
  const f = plain(doc.fields);
  for (const [k, v] of [['guardianEmail', f.guardianEmail], ['playerEmail', f.playerEmail]]) {
    if (v && v !== EMAIL && v !== PLAYER_EMAIL) {
      die(
        `athletes/${ATHLETE} has ${k}=${v}, which is not a review address.\n` +
        `  This script only ever writes the synthetic review athlete. Something has\n` +
        `  repurposed that id for a real family, and overwriting it would destroy their\n` +
        `  record. Nothing was changed.`
      );
    }
  }
}

async function provision(token) {
  await assertSafeTarget(token);

  const guardian = await ensureUser(token, EMAIL, PASSWORD, 'Demo Parent');
  console.log(`  guardian ${guardian.created ? 'created' : 'updated'}, emailVerified true`);

  let playerUid = '';
  if (PLAYER_EMAIL && PLAYER_PASSWORD) {
    const p = await ensureUser(token, PLAYER_EMAIL, PLAYER_PASSWORD, 'Demo Athlete');
    playerUid = p.uid;
    console.log(`  player   ${p.created ? 'created' : 'updated'}, emailVerified true`);
  } else {
    console.log('  player   skipped (REVIEW_PLAYER_EMAIL unset) -- guardian-only athlete');
  }

  const writes = [
    [`athletes/${ATHLETE}`, {
      guardianUid: guardian.uid,
      playerUid,
      guardianEmail: EMAIL,
      playerEmail: PLAYER_EMAIL ?? '',
      playerName: 'Demo Athlete',
      guardianName: 'Demo Parent',
      age: 15,
      joinedAt: daysAgo(21),
      // Consent GRANTED, unlike the emulator seed. A reviewer needs to see a working
      // conversation; the revoke switch on the You tab is what demonstrates the control,
      // and it only reads as a control if it is currently on.
      consentGrantedAt: daysAgo(20),
    }],
    [`threads/${T_PARENT}`, {
      athleteId: ATHLETE,
      participants: [COACH, guardian.uid],
      readers: [COACH, guardian.uid],
      kind: 'coach-parent',
      title: 'Coach Kingsley / Demo Parent',
    }],
  ];

  if (playerUid) {
    writes.push([`threads/${T_PLAYER}`, {
      athleteId: ATHLETE,
      participants: [COACH, playerUid],
      // The guardian is a reader and not a participant: she sees everything and can post
      // nothing. That is the monitoring guarantee the review notes describe, and it is
      // the thing a reviewer should be able to see for themselves.
      readers: [COACH, playerUid, guardian.uid],
      kind: 'coach-player',
      title: 'Coach Kingsley / Demo Athlete',
    }]);
  }

  // Written for a reviewer to read. Nothing here is a real person's words, and none of
  // it says anything that would be odd to find quoted in a policy decision.
  const msgs = [
    [T_PARENT, 'm1', COACH, 'Thanks for getting Demo signed up. Sessions are Tuesday and Thursday at the Salvation Army gym on SW 9th Ave.', daysAgo(6, 9, 12)],
    [T_PARENT, 'm2', guardian.uid, 'Perfect. Is there anything he should bring the first week?', daysAgo(6, 9, 40)],
    [T_PARENT, 'm3', COACH, 'Just a ball and water. I put a ball-handling workout on his calendar for the days in between.', daysAgo(6, 10, 2)],
    [T_PARENT, 'm4', guardian.uid, 'Got it, thank you.', daysAgo(5, 18, 30)],
  ];
  if (playerUid) {
    msgs.push(
      [T_PLAYER, 'p1', COACH, 'Good work on the form shooting today. Keep the elbow under the ball.', daysAgo(4, 17, 5)],
      [T_PLAYER, 'p2', playerUid, 'Thanks coach. I logged 50 makes tonight.', daysAgo(4, 20, 15)],
      [T_PLAYER, 'p3', COACH, 'That is the way. See you Thursday.', daysAgo(4, 20, 30)]
    );
  }
  for (const [tid, mid, senderUid, text, createdAt] of msgs) {
    writes.push([`threads/${tid}/messages/${mid}`, { senderUid, text, createdAt }]);
  }

  for (const [path, data] of writes) {
    await api(`${FS}/${path}`, { token, method: 'PATCH', body: { fields: fields(data) } });
  }
  console.log(`  wrote    1 athlete, ${playerUid ? 2 : 1} thread(s), ${msgs.length} messages`);
}

// --- verify ------------------------------------------------------------------

/**
 * Signs in exactly the way a reviewer's phone does and reads THROUGH firestore.rules
 * with the resulting token, not around them with the service account. An admin read
 * would prove the documents exist; only this proves the reviewer can see them.
 */
async function verify() {
  const out = [];
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    }
  );
  const session = await signIn.json();
  if (!signIn.ok) {
    return [[false, `sign-in failed: ${session.error?.message ?? signIn.status}`]];
  }
  out.push([true, 'signs in with the documented password']);

  // THE REJECTION, in one assertion. A freshly minted token is what a reviewer's first
  // sign-in produces, so if emailVerified is false here it is false for them too, and
  // src/session.tsx puts the verification wall in front of the whole app.
  const claims = JSON.parse(Buffer.from(session.idToken.split('.')[1], 'base64url').toString());
  out.push([claims.email_verified === true, 'token says email_verified — no inbox needed']);

  const tok = session.idToken;
  let athlete = null;
  try {
    const q = await api(`${FS}:runQuery`, {
      token: tok, method: 'POST',
      body: {
        structuredQuery: {
          from: [{ collectionId: 'athletes' }],
          where: { fieldFilter: { field: { fieldPath: 'guardianUid' }, op: 'EQUAL', value: { stringValue: session.localId } } },
          limit: 1,
        },
      },
    });
    athlete = q.find((r) => r.document)?.document ?? null;
  } catch (e) {
    out.push([false, `athlete lookup denied by rules: ${e.message.slice(0, 120)}`]);
  }

  // notInvited in src/session.tsx. A reviewer who clears the login and lands on
  // "Coach has not added you to an athlete yet" rejects for app completeness instead,
  // which is a worse outcome than the rejection this script exists to fix.
  out.push([Boolean(athlete), 'is linked to an athlete (not the notInvited empty state)']);
  if (athlete) {
    const f = plain(athlete.fields);
    out.push([Boolean(f.consentGrantedAt), 'consent is granted, so the conversation is live']);
  }

  let msgCount = 0;
  try {
    const m = await api(`${FS}/threads/${T_PARENT}/messages?pageSize=20`, { token: tok });
    msgCount = (m.documents ?? []).length;
  } catch (e) {
    out.push([false, `thread read denied: ${e.message.slice(0, 120)}`]);
  }
  // "A reviewer who signs in to an empty app has been known to reject it as incomplete."
  out.push([msgCount >= 3, `conversation has ${msgCount} messages (needs 3+)`]);

  // THE MONITORING PROMISE, checked rather than asserted. The review notes tell both
  // stores that a guardian reads every word between the coach and her athlete and
  // cannot post into it, and Apple asked specifically to see the controls that govern
  // user-generated content. That claim is only true while the rules enforce it, so
  // prove both halves with the reviewer's own token before saying it in a submission.
  if (PLAYER_EMAIL) {
    let seen = -1;
    try {
      const m = await api(`${FS}/threads/${T_PLAYER}/messages?pageSize=20`, { token: tok });
      seen = (m.documents ?? []).length;
    } catch {
      seen = -1;
    }
    out.push([seen >= 1, `guardian reads her athlete's thread (${seen < 0 ? 'denied' : seen + ' messages'})`]);

    // A write that SUCCEEDS here is the failure, so it is cleaned up rather than left
    // sitting in a thread a reviewer is about to read.
    const probe = `${FS}/threads/${T_PLAYER}/messages/rules-probe`;
    let posted = false;
    try {
      await api(probe, {
        token: tok, method: 'PATCH',
        body: { fields: fields({ senderUid: session.localId, text: 'rules probe', createdAt: new Date() }) },
      });
      posted = true;
      await api(probe, { token: tok, method: 'DELETE' }).catch(() => {});
    } catch {
      posted = false;
    }
    out.push([!posted, posted ? 'GUARDIAN CAN POST into her athlete thread' : 'guardian is refused posting into it']);
  }

  return out;
}

// --- main --------------------------------------------------------------------

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  requireEnv();
  await main();
}

async function main() {
if (!CHECK_ONLY) {
  if (!keyPath || !existsSync(keyPath)) {
    die('Pass --key <service-account.json>. Firebase Console, Project settings, Service accounts, Generate new private key.');
  }
  const key = JSON.parse(readFileSync(keyPath, 'utf8'));
  if (key.project_id !== PROJECT) {
    die(`that key is for ${key.project_id}, but .env points at ${PROJECT}. Refusing to cross projects.`);
  }
  console.log(`\n  provisioning the review account on ${PROJECT}\n`);
  const token = await accessToken(key, fetch, 'https://www.googleapis.com/auth/cloud-platform');
  await provision(token);
}

console.log('\n  verifying as the reviewer would\n');
const results = await verify();
for (const [ok, label] of results) console.log(`   ${ok ? 'ok  ' : 'FAIL'}  ${label}`);

const failed = results.filter(([ok]) => !ok).length;
console.log(
  failed
    ? `\n  ${failed} check(s) failed. Do not submit; a reviewer would hit the same wall.\n`
    : '\n  the review account is ready to submit.\n'
);
process.exit(failed ? 1 : 0);
}

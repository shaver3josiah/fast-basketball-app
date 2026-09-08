/**
 * npm run seed — fill the LOCAL Firebase emulators with the three demo accounts and
 * their data, so the app runs end to end with no cloud project at all.
 *
 * It is also how cross-device messaging is proven: sign in as the parent on one client
 * and the coach on another, both pointed at this emulator, and a message sent in one
 * appears in the other through the same realtime listener the shipped app uses.
 *
 * ---------------------------------------------------------------------------
 * WHY PLAIN fetch() AND NOT firebase-admin
 * ---------------------------------------------------------------------------
 * firebase-admin is not a dependency of this project (see package.json) and pulling in
 * ~40 transitive packages to write 30 documents is not a trade worth making. The
 * `firebase` client SDK IS installed, but it goes through firestore.rules — and the
 * seed deliberately writes things the rules forbid: back-dated message timestamps
 * (the rule pins `createdAt == request.time`) and a thread the coach cannot author
 * alone. So this talks to the emulators' REST APIs with Node's built-in fetch and the
 * emulator's `Bearer owner` token, the documented rules-bypass. No new dependency, and
 * no rules to fight.
 *
 * ---------------------------------------------------------------------------
 * WHY SEEDING PRODUCTION IS IMPOSSIBLE, NOT MERELY UNLIKELY
 * ---------------------------------------------------------------------------
 * Every URL below is a literal 127.0.0.1 emulator address. There is no code path that
 * resolves *.googleapis.com, so no credential — real or stolen — can send this script's
 * writes anywhere but a loopback emulator. The guards under `refuse()` are the second
 * line: a real credential in the environment or a project id that is not a demo id
 * hard-exits before the first request, because their presence means the operator
 * believes they are somewhere they are not.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { workflowDocs } from './workflow-docs.mjs';
import { setCoachUid } from './set-coach-uid.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- guards ----------------------------------------------------------------

const PROJECT = process.env.FB_PROJECT ?? 'fast-basketball-dev';
const AUTH_HOST = '127.0.0.1:9099'; // ports come from firebase/firebase.json
const FS_HOST = '127.0.0.1:8080';

// Set, never read. Anything else in this process that speaks Firebase is pinned to the
// emulator too, whatever the ambient environment says.
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;

const refuse = (why) => {
  console.error(`\n  REFUSING TO SEED: ${why}\n`);
  console.error('  This script only ever writes to a local emulator. If you meant to');
  console.error('  touch a real project, that is a deploy, not a seed.\n');
  process.exit(1);
};

for (const k of [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CREDENTIALS',
  'FIREBASE_TOKEN',
  'FIREBASE_SERVICE_ACCOUNT',
]) {
  if (process.env[k]) refuse(`${k} is set — that is a real credential.`);
}

// demo-* is Firebase's own reserved "this is not a real project" prefix; the
// -dev/-demo/-test suffixes cover the ids this repo already uses.
if (!/^demo-|-(dev|demo|test)$/.test(PROJECT)) {
  refuse(`project id "${PROJECT}" does not look like a demo/emulator project.`);
}

// --- emulator REST ---------------------------------------------------------

const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

async function call(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, headers: { ...OWNER, ...(init.headers ?? {}) } });
  } catch (e) {
    console.error(`\n  Cannot reach ${new URL(url).host} — are the emulators running?\n`);
    console.error('    npm run emulators      (needs a JDK 21+ on PATH)\n');
    console.error(`  (${e.message})\n`);
    process.exit(1);
  }
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url}\n${body}`);
  return body ? JSON.parse(body) : {};
}

/** Proves we are talking to an emulator, not to something answering on its port. */
async function assertEmulators() {
  // .catch(): the very next thing this script does is DELETE every account and every
  // document. A squatter on 9099 that answers 200 with non-JSON is exactly the case
  // this function exists to catch, so it must reach refuse() rather than die in
  // JSON.parse with a stack trace. (call() already exits on a connection failure.)
  const auth = await call(`http://${AUTH_HOST}/`).catch(() => null);
  if (!auth || !auth.authEmulator) {
    refuse(`${AUTH_HOST} answered, but it is not the Auth emulator.`);
  }
  const fs = await fetch(`http://${FS_HOST}/`).catch(() => null);
  if (!fs || !fs.ok) refuse(`${FS_HOST} is not answering — start the Firestore emulator.`);
}

// Firestore's REST API wants typed values. Small enough to hand-roll; the alternative
// is dragging in an SDK for a type tag.
const val = (v) =>
  v === null
    ? { nullValue: null }
    : v instanceof Date
      ? { timestampValue: v.toISOString() }
      : typeof v === 'string'
        ? { stringValue: v }
        : typeof v === 'boolean'
          ? { booleanValue: v }
          : typeof v === 'number'
            ? Number.isInteger(v)
              ? { integerValue: String(v) }
              : { doubleValue: v }
            : Array.isArray(v)
              ? { arrayValue: { values: v.map(val) } }
              : { mapValue: { fields: fields(v) } };

const fields = (o) =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, val(v)])
  );

// The REST *URL* and the resource *name* Firestore wants inside a write are not the
// same string: `update.name` is a bare `projects/.../documents/...` path, and passing
// the URL there comes back as an opaque `lacks "projects" at index 0`.
const DOC_PATH = `projects/${PROJECT}/databases/(default)/documents`;
const DOCS = `http://${FS_HOST}/v1/${DOC_PATH}`;
const CLEAR_DB = `http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`;

/** One commit for the whole seed: it either all lands or none of it does. */
const commit = (docs) =>
  call(`${DOCS}:commit`, {
    method: 'POST',
    body: JSON.stringify({
      writes: docs.map(([path, data]) => ({
        update: { name: `${DOC_PATH}/${path}`, fields: fields(data) },
      })),
    }),
  });

// --- the demo cast ---------------------------------------------------------

// Fixed uids so they survive a reseed: the rules constant, EXPO_PUBLIC_COACH_UID and
// any already-signed-in client all keep pointing at the same three people.
const COACH = 'coach_demo_uid';
const PARENT = 'parent_demo_uid';
const PLAYER = 'player_demo_uid';
const ATHLETE = 'athlete_marcus';
const T_PLAYER = 'thread_coach_player';
const T_PARENT = 'thread_coach_parent';

// Demo password on a local emulator that listens on loopback only. It is not a secret,
// it is a label — nothing shaped like this ever reaches a real project.
const PASSWORD = 'fastbb123';

const USERS = [
  { localId: COACH, email: 'coach@fastbasketball.test', displayName: 'Coach Kingsley' },
  { localId: PARENT, email: 'parent@fastbasketball.test', displayName: 'Denise Alvarez' },
  { localId: PLAYER, email: 'player@fastbasketball.test', displayName: 'Marcus Alvarez' },
];

const now = new Date();
const daysAgo = (d, h = 9, m = 0) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, h, m);

/**
 * Seed conversation, in the voice of the demo copy.
 *
 * Note what is NOT here: a single player message. Consent starts OFF, so the athlete
 * has never been able to post — the thread is one-sided on purpose. That is the gate
 * the reviewer is meant to watch open: grant consent as Denise, and Marcus's composer
 * unlocks. Seeding player history would quietly contradict the thing being demoed.
 */
const MESSAGES = [
  [T_PLAYER, 'm01', COACH, 'Marcus — welcome to Fast Basketball. Everything we say in here is visible to your mom. That is not a punishment, it is how this works.', daysAgo(6, 17, 12)],
  [T_PLAYER, 'm02', COACH, 'Saw the film from Saturday. Your first step off the catch is quicker — that is the work showing up.', daysAgo(4, 8, 41)],
  [T_PLAYER, 'm03', COACH, 'Put the 4-week guard block in the Locker. Start with the tight-space handling, both hands.', daysAgo(2, 19, 3)],
  [T_PLAYER, 'm04', COACH, 'Once your mom switches consent on you can answer me right here.', daysAgo(1, 7, 55)],

  [T_PARENT, 'm01', COACH, 'Hi Denise — Marcus is on the schedule for the month. You can read every word he and I exchange, always.', daysAgo(7, 16, 20)],
  [T_PARENT, 'm02', PARENT, 'Thank you. I will go through the calendar tonight.', daysAgo(7, 20, 48)],
  [T_PARENT, 'm03', COACH, 'No rush. He cannot message me until you switch consent on in his profile. That one is yours to decide, not mine.', daysAgo(6, 9, 15)],
  [T_PARENT, 'm04', PARENT, 'Appreciate that. One question about the Thursday sessions — where are those?', daysAgo(3, 21, 2)],
  [T_PARENT, 'm05', COACH, 'Kendall Indoor, 6pm. Bring the sleeve for his elbow.', daysAgo(3, 21, 30)],
];

/** Thirteen sessions spread across the CURRENT month, one canceled. */
const SESSIONS = [
  ['skills', 'Ball Handling — Tight Space', 'Kendall Indoor', 18, 0, '6:00 PM'],
  ['shoot', 'Form + Spot Shooting', 'Sunset Gym', 16, 30, '4:30 PM'],
  ['team', 'Small Group — 3v3 Reads', 'Kendall Indoor', 19, 15, '7:15 PM'],
  ['rest', 'Rest Day', 'Home', 9, 0, ''],
  ['skills', 'Change of Pace + Hesitation', 'Kendall Indoor', 18, 0, '6:00 PM'],
  ['shoot', 'Shooting Log — 200 Makes', 'Sunset Gym', 16, 30, '4:30 PM'],
  ['rest', 'Film Review with Coach', 'Video call', 9, 0, ''],
  ['skills', 'Finishing Package', 'Kendall Indoor', 18, 0, '6:00 PM'],
  ['team', 'Small Group — Pick & Roll', 'Kendall Indoor', 19, 15, '7:15 PM'],
  ['shoot', 'Off the Catch, 5 Spots', 'Sunset Gym', 16, 30, '4:30 PM'],
  ['skills', 'Live Reads — 1v1 from the Wing', 'Kendall Indoor', 18, 0, '6:00 PM'],
  ['rest', 'Rest Day', 'Home', 9, 0, ''],
  ['team', 'Small Group — Full Court', 'Kendall Indoor', 19, 15, '7:15 PM'],
];
const CANCELED = 8; // gym double-booked — renders struck through with the word "Canceled"

const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

const events = SESSIONS.map(([type, name, location, h, m, timeLabel], i) => {
  // Even spread, so this is valid in February and in a 31-day month alike.
  const day = Math.max(1, Math.round(((i + 1) * daysInMonth) / (SESSIONS.length + 1)));
  return [
    `events/ev_${String(i + 1).padStart(2, '0')}`,
    {
      athleteId: ATHLETE,
      type,
      name,
      location,
      startsAt: new Date(now.getFullYear(), now.getMonth(), day, h, m),
      timeLabel,
      ...(i === CANCELED ? { canceled: true } : {}),
    },
  ];
});

// --- run -------------------------------------------------------------------

console.log(`\nFast Basketball — seeding emulator project "${PROJECT}"`);
await assertEmulators();

// The emulator hot-reloads firestore.rules from disk, so it picks this up immediately.
const rules = setCoachUid(COACH);
console.log(
  rules.changed
    ? `  rules    coachUid(): '${rules.before}' -> '${rules.after}'`
    : `  rules    coachUid() already '${rules.after}'`
);

// Wipe first, so a reseed is a reseed and not a merge on top of yesterday's demo.
await call(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
await call(CLEAR_DB, { method: 'DELETE' });
console.log('  cleared  auth users and firestore documents');

for (const u of USERS) {
  await call(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`, {
    method: 'POST',
    body: JSON.stringify({ ...u, password: PASSWORD, emailVerified: true }),
  });
}
console.log(`  created  ${USERS.length} auth users with fixed uids`);

await commit([
  [
    `athletes/${ATHLETE}`,
    {
      guardianUid: PARENT,
      playerUid: PLAYER,
      // The addresses the coach invited. A signup only attaches to an athlete when a
      // VERIFIED account with the matching address claims an empty uid slot — these two
      // are already claimed here, so the demo can sign straight in.
      guardianEmail: 'parent@fastbasketball.test',
      playerEmail: 'player@fastbasketball.test',
      playerName: 'Marcus Alvarez',
      guardianName: 'Denise Alvarez',
      age: 15,
      joinedAt: daysAgo(8),
      // consentGrantedAt is deliberately absent: consent starts OFF. Absent and null
      // both read as "no consent" in the rules, and absent is the honest one — nobody
      // has ever granted it.
    },
  ],
  [
    `threads/${T_PLAYER}`,
    {
      athleteId: ATHLETE,
      participants: [COACH, PLAYER],
      // The guardian is a READER here and not a participant: total visibility, no
      // ability to post into her son's thread. That is the monitoring guarantee, and
      // firestore.rules refuses to create this thread without her in the list.
      readers: [COACH, PLAYER, PARENT],
      kind: 'coach-player',
      title: 'Coach Kingsley ↔ Marcus',
    },
  ],
  [
    `threads/${T_PARENT}`,
    {
      athleteId: ATHLETE,
      participants: [COACH, PARENT],
      readers: [COACH, PARENT],
      kind: 'coach-parent',
      title: 'Coach Kingsley ↔ Denise',
    },
  ],
  ...MESSAGES.map(([tid, mid, senderUid, text, createdAt]) => [
    `threads/${tid}/messages/${mid}`,
    { senderUid, text, createdAt },
  ]),
  ...events,
  ...workflowDocs().map((w) => [
    `workflows/${w.id}`,
    {
      name: w.name,
      html: w.html,
      publishedBy: 'Coach Kingsley',
      publishedAt: daysAgo(5, 11, 0),
      sizeBytes: w.sizeBytes,
      // Decides whether a save overwrites or files a new submission. The weekly game
      // evaluation and the quarterly report are obligations in the signed agreement,
      // and each needs its own document or it destroys the previous one.
      cadence: w.cadence,
    },
  ]),
]);
console.log(
  `  wrote    1 athlete, 2 threads, ${MESSAGES.length} messages, ${events.length} events, ` +
    `${workflowDocs().length} workflows`
);

// --- read back -------------------------------------------------------------
// A seed that prints "done" without looking is how you demo an empty app.

const count = async (path) => ((await call(`${DOCS}/${path}?pageSize=100`)).documents ?? []).length;
const athlete = await call(`${DOCS}/athletes/${ATHLETE}`);

let ok = true;
const fail = (msg) => {
  ok = false;
  console.error(`  FAIL     ${msg}`);
};

for (const [path, want] of [
  ['athletes', 1],
  ['threads', 2],
  [`threads/${T_PLAYER}/messages`, 4],
  [`threads/${T_PARENT}/messages`, 5],
  ['events', events.length],
  ['workflows', workflowDocs().length],
]) {
  const got = await count(path);
  if (got !== want) fail(`${path}: expected ${want} docs, read back ${got}`);
}
if ('consentGrantedAt' in athlete.fields) fail('consent is NOT off on the athlete doc');

// Every workflow must carry a cadence. Without one the app treats it as 'once', so a
// weekly game evaluation would overwrite last week's instead of filing a new one — the
// exact data loss the submission work exists to prevent, and silent if unchecked.
const published = (await call(`${DOCS}/workflows?pageSize=100`)).documents ?? [];
for (const d of published) {
  const id = d.name.split('/').pop();
  const cadence = d.fields?.cadence?.stringValue;
  if (!cadence) fail(`workflow ${id} has no cadence`);
  else if (!['once', 'daily', 'weekly', 'quarterly'].includes(cadence))
    fail(`workflow ${id} has an unknown cadence "${cadence}"`);
}
console.log(
  `  cadences ${published
    .map((d) => `${d.name.split('/').pop()}:${d.fields?.cadence?.stringValue ?? '??'}`)
    .sort()
    .join('  ')}`
);
const readers = (await call(`${DOCS}/threads/${T_PLAYER}`)).fields.readers.arrayValue.values.map(
  (v) => v.stringValue
);
if (!readers.includes(PARENT)) fail('the guardian is not in the coach<->player readers');
if (!ok) process.exit(1);
console.log('  verified consent off, guardian in the coach<->player readers, counts match');

// --- point the app at all this ---------------------------------------------
// Expo loads .env.local itself, so the next command below is one line and not three
// PowerShell $env: assignments the operator has to get right.

const MARK = '# written by npm run seed';
const ENV = join(ROOT, '.env.local');
const envBody =
  `${MARK} — local emulator demo. Delete this file to point the app at a real project.\n` +
  `EXPO_PUBLIC_USE_EMULATOR=1\n` +
  `EXPO_PUBLIC_COACH_UID=${COACH}\n`;
// Never clobber an .env.local somebody else wrote; it may hold a real project's config.
const envIsOurs = !existsSync(ENV) || readFileSync(ENV, 'utf8').startsWith(MARK);
if (envIsOurs) writeFileSync(ENV, envBody, 'utf8');

// That guard watches .env.local and misses the case that actually bites: a real .env
// exists, and the .env.local just written SHADOWS it, because Expo loads .env.local
// first. The app then points at an emulator that stops when this script does, and the
// only symptom is a connection failure that names nothing. Say so, loudly.
const REAL_ENV = join(ROOT, '.env');
const realProject = existsSync(REAL_ENV)
  ? (readFileSync(REAL_ENV, 'utf8').match(/^EXPO_PUBLIC_FIREBASE_PROJECT_ID=(.+)$/m)?.[1] ?? '').trim()
  : '';
const shadowed = envIsOurs && realProject;

const L = (s = '') => console.log(s);
L('\n' + '-'.repeat(72));
L('  SIGN IN — same password for all three');
L();
for (const u of USERS) L(`    ${u.email.padEnd(28)} ${PASSWORD}   ${u.displayName}`);
L();
if (shadowed) {
  L();
  L('  ' + '!'.repeat(68));
  L(`  THE APP NOW POINTS AT THE EMULATOR, NOT ${realProject}.`);
  L('  .env.local shadows .env, and it outlives this emulator. When the emulator');
  L('  stops, the app fails to connect and nothing on screen says why.');
  L();
  L('      npm run use-cloud     <- switch back when you are done demoing');
  L('  ' + '!'.repeat(68));
}
L();
L(`  COACH UID: ${COACH}`);
L('    - firebase/firestore.rules  coachUid()   <- set by this script');
L('    - EXPO_PUBLIC_COACH_UID                  <- set in .env.local');
L('    Both must equal that uid, or the coach is just another signed-in stranger.');
L('    When Blake has a real account:  npm run set-coach-uid -- <his-auth-uid>');
if (!envIsOurs) {
  L();
  L('  .env.local exists and is not mine — left alone. Add these two lines:');
  L('    EXPO_PUBLIC_USE_EMULATOR=1');
  L(`    EXPO_PUBLIC_COACH_UID=${COACH}`);
}
L();
L('  NEXT (leave the emulators running in their own window):');
L('    ...but `npm run test:rules` starts its OWN firestore emulator on 8080, so');
L('    stop this one first or it fails with a bare "port taken".');
L();
L('    npm run web');
L();
L('  For the cross-device proof, open it twice: sign in as the parent in one window');
L('  and the coach in the other. Both hit this one emulator, so a message sent in');
L('  either shows up in the other with no refresh.');
L('-'.repeat(72) + '\n');

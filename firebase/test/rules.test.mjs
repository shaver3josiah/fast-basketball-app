/**
 * The security rules ARE the security model — there is no server-side code to fall
 * back on (Cloud Functions need the Blaze plan). So they get tested.
 *
 * A prior audit found three majors in this file: the coach could pre-grant consent at
 * create time, he could write the guardian out of a thread's readers, and the consent
 * gate wrongly locked the PARENT out of messaging. Each of those is pinned below, so a
 * future edit that reintroduces one fails here instead of in production.
 *
 *   npm run test:rules      (starts the emulator itself)
 *
 * Uses node:test — no jest, no vitest, no config file.
 */

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';

const HERE = dirname(fileURLToPath(import.meta.url));

const COACH = 'coach_test_uid';
const PARENT = 'parent_test_uid';
const PLAYER = 'player_test_uid';
const STRANGER = 'stranger_test_uid';
const ATHLETE = 'athlete1';
const T_CP = 'thread_coach_player';
const T_CX = 'thread_coach_parent';

/**
 * The coach's identity is a constant inside the rules. Swap whatever is currently
 * hard-coded there for a known test uid, so this suite keeps working both before and
 * after the owner pastes in Blake's real Auth uid.
 */
function rulesUnderTest() {
  const src = readFileSync(join(HERE, '..', 'firestore.rules'), 'utf8');
  const patched = src.replace(
    /function coachUid\(\)\s*\{\s*return\s*'[^']*';\s*\}/,
    `function coachUid() { return '${COACH}'; }`
  );
  assert.ok(patched.includes(COACH), 'could not substitute coachUid() in firestore.rules');
  return patched;
}

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'fast-basketball-rules-test',
    firestore: {
      rules: rulesUnderTest(),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await env?.cleanup();
});

/** Fresh, rule-free baseline before every test. */
async function seed({ consent = false } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'athletes', ATHLETE), {
      guardianUid: PARENT,
      playerUid: PLAYER,
      playerName: 'Marcus Alvarez',
      guardianName: 'Denise Alvarez',
      age: 15,
      ...(consent ? { consentGrantedAt: new Date() } : {}),
    });
    // The guardian sits in `readers` on the coach<->player thread. That is the
    // monitoring guarantee, and it is what makes one array-contains query serve
    // all three roles.
    await setDoc(doc(db, 'threads', T_CP), {
      athleteId: ATHLETE,
      participants: [COACH, PLAYER],
      readers: [COACH, PLAYER, PARENT],
      kind: 'coach-player',
      title: 'Coach Kingsley ↔ Marcus',
    });
    await setDoc(doc(db, 'threads', T_CX), {
      athleteId: ATHLETE,
      participants: [COACH, PARENT],
      readers: [COACH, PARENT],
      kind: 'coach-parent',
      title: 'Coach Kingsley ↔ Denise',
    });
    await setDoc(doc(db, 'threads', T_CP, 'messages', 'm1'), {
      senderUid: COACH,
      text: 'Saw the film from Saturday.',
      createdAt: new Date(),
    });
  });
}

const as = (uid) => env.authenticatedContext(uid).firestore();

const send = (db, uid, tid, text = 'hello coach') =>
  addDoc(collection(db, 'threads', tid, 'messages'), {
    senderUid: uid,
    text,
    createdAt: serverTimestamp(),
  });

// ---------------------------------------------------------------------------

describe('consent gate', () => {
  test('player cannot post before the guardian grants consent', async () => {
    await seed({ consent: false });
    await assertFails(send(as(PLAYER), PLAYER, T_CP));
  });

  test('player can post once consent exists', async () => {
    await seed({ consent: true });
    await assertSucceeds(send(as(PLAYER), PLAYER, T_CP));
  });

  test('revoking consent re-locks the thread', async () => {
    await seed({ consent: true });
    await assertSucceeds(
      updateDoc(doc(as(PARENT), 'athletes', ATHLETE), { consentGrantedAt: null })
    );
    await assertFails(send(as(PLAYER), PLAYER, T_CP));
  });

  test('an absent consent field reads as no consent, not as an error', async () => {
    await seed({ consent: true });
    await assertSucceeds(
      updateDoc(doc(as(PARENT), 'athletes', ATHLETE), { consentGrantedAt: deleteField() })
    );
    await assertFails(send(as(PLAYER), PLAYER, T_CP));
  });

  test('the parent can message the coach WITHOUT consent — talking to him is how she decides', async () => {
    await seed({ consent: false });
    await assertSucceeds(send(as(PARENT), PARENT, T_CX));
  });

  test('the coach can message an athlete without consent — only the athlete is gated', async () => {
    await seed({ consent: false });
    await assertSucceeds(send(as(COACH), COACH, T_CP));
  });
});

describe('consent is the guardian’s alone', () => {
  test('the coach cannot pre-grant consent at create time', async () => {
    await seed();
    await assertFails(
      setDoc(doc(as(COACH), 'athletes', 'athlete2'), {
        guardianUid: PARENT,
        playerUid: PLAYER,
        consentGrantedAt: new Date(),
      })
    );
  });

  test('the coach can create an athlete without a consent field', async () => {
    await seed();
    await assertSucceeds(
      setDoc(doc(as(COACH), 'athletes', 'athlete2'), {
        guardianUid: PARENT,
        playerUid: PLAYER,
        playerName: 'Second Athlete',
      })
    );
  });

  test('the coach cannot grant consent by update either', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(as(COACH), 'athletes', ATHLETE), { consentGrantedAt: new Date() })
    );
  });

  test('the player cannot grant his own consent', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(as(PLAYER), 'athletes', ATHLETE), { consentGrantedAt: new Date() })
    );
  });

  test('the guardian may touch consent and nothing else', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(as(PARENT), 'athletes', ATHLETE), { consentGrantedAt: new Date() })
    );
    await assertFails(updateDoc(doc(as(PARENT), 'athletes', ATHLETE), { playerName: 'Renamed' }));
  });

  test('the coach may edit roster fields but never reassign the guardian', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(as(COACH), 'athletes', ATHLETE), { age: 16 }));
    await assertFails(updateDoc(doc(as(COACH), 'athletes', ATHLETE), { guardianUid: STRANGER }));
  });
});

describe('parent monitoring is structural', () => {
  test('the parent reads every message in the coach↔player thread', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(as(PARENT), 'threads', T_CP, 'messages', 'm1')));
  });

  test('the parent cannot post into the coach↔player thread', async () => {
    await seed({ consent: true });
    await assertFails(send(as(PARENT), PARENT, T_CP));
  });

  test('the coach cannot create a thread that leaves the guardian out', async () => {
    await seed();
    await assertFails(
      setDoc(doc(as(COACH), 'threads', 'sneaky'), {
        athleteId: ATHLETE,
        participants: [COACH, PLAYER],
        readers: [COACH, PLAYER],
        kind: 'coach-player',
        title: 'off the record',
      })
    );
  });

  test('threads are immutable — the guardian cannot be edited out afterwards', async () => {
    await seed();
    await assertFails(updateDoc(doc(as(COACH), 'threads', T_CP), { readers: [COACH, PLAYER] }));
    await assertFails(deleteDoc(doc(as(COACH), 'threads', T_CP)));
  });

  test('messages are permanent, for the coach as much as the player', async () => {
    await seed({ consent: true });
    await assertFails(deleteDoc(doc(as(COACH), 'threads', T_CP, 'messages', 'm1')));
    await assertFails(deleteDoc(doc(as(PLAYER), 'threads', T_CP, 'messages', 'm1')));
    await assertFails(
      updateDoc(doc(as(COACH), 'threads', T_CP, 'messages', 'm1'), { text: 'never mind' })
    );
  });
});

describe('message shape', () => {
  test('a sender cannot forge someone else’s uid', async () => {
    await seed({ consent: true });
    await assertFails(send(as(PLAYER), COACH, T_CP));
  });

  test('empty and oversized text are rejected', async () => {
    await seed({ consent: true });
    await assertFails(send(as(PLAYER), PLAYER, T_CP, ''));
    await assertFails(send(as(PLAYER), PLAYER, T_CP, 'x'.repeat(4001)));
  });

  test('a client-chosen timestamp is rejected — createdAt must be the server time', async () => {
    await seed({ consent: true });
    await assertFails(
      addDoc(collection(as(PLAYER), 'threads', T_CP, 'messages'), {
        senderUid: PLAYER,
        text: 'backdated',
        createdAt: new Date(2020, 0, 1),
      })
    );
  });

  test('extra fields are rejected', async () => {
    await seed({ consent: true });
    await assertFails(
      addDoc(collection(as(PLAYER), 'threads', T_CP, 'messages'), {
        senderUid: PLAYER,
        text: 'hi',
        createdAt: serverTimestamp(),
        readByCoach: true,
      })
    );
  });
});

describe('outsiders', () => {
  test('a signed-in stranger sees no athlete, no thread, no message', async () => {
    await seed();
    await assertFails(getDoc(doc(as(STRANGER), 'athletes', ATHLETE)));
    await assertFails(getDoc(doc(as(STRANGER), 'threads', T_CP)));
    await assertFails(getDoc(doc(as(STRANGER), 'threads', T_CP, 'messages', 'm1')));
  });

  test('an unauthenticated client sees nothing', async () => {
    await seed();
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'threads', T_CP, 'messages', 'm1')));
  });
});

describe('the queries the app actually runs', () => {
  test('readers array-contains is the one thread query that serves all three roles', async () => {
    await seed();
    for (const uid of [COACH, PARENT, PLAYER]) {
      await assertSucceeds(
        getDocs(query(collection(as(uid), 'threads'), where('readers', 'array-contains', uid)))
      );
    }
  });

  test('an unconstrained thread list is denied for a parent and allowed for the coach', async () => {
    await seed();
    await assertFails(getDocs(collection(as(PARENT), 'threads')));
    await assertSucceeds(getDocs(collection(as(COACH), 'threads')));
  });

  test('events must be queried by athleteId — rules never filter', async () => {
    await seed();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'events', 'e1'), {
        athleteId: ATHLETE,
        type: 'skills',
        name: 'Ball Handling',
        location: 'Kendall Indoor',
        startsAt: new Date(),
      });
    });
    await assertFails(getDocs(collection(as(PARENT), 'events')));
    await assertSucceeds(
      getDocs(query(collection(as(PARENT), 'events'), where('athleteId', '==', ATHLETE)))
    );
  });

  test('only the coach writes the calendar', async () => {
    await seed();
    const ev = {
      athleteId: ATHLETE,
      type: 'skills',
      name: 'Extra work',
      location: 'anywhere',
      startsAt: new Date(),
    };
    await assertFails(setDoc(doc(as(PARENT), 'events', 'e2'), ev));
    await assertSucceeds(setDoc(doc(as(COACH), 'events', 'e2'), ev));
  });
});

describe('the Locker', () => {
  test('only the coach publishes, and the html has a size ceiling', async () => {
    await seed();
    const wf = { name: 'Warmup', html: '<h1>hi</h1>', publishedBy: 'Coach Kingsley' };
    await assertFails(setDoc(doc(as(PLAYER), 'workflows', 'w1'), wf));
    await assertSucceeds(setDoc(doc(as(COACH), 'workflows', 'w1'), wf));
    await assertFails(
      setDoc(doc(as(COACH), 'workflows', 'w2'), { ...wf, html: 'x'.repeat(900001) })
    );
  });

  test('answers belong to the athlete — the coach reads them but cannot author them', async () => {
    await seed();
    const answers = { answers: { 'Week 10': true }, updatedAt: new Date() };
    await assertSucceeds(
      setDoc(doc(as(PLAYER), 'athletes', ATHLETE, 'savedWorkflows', 'w1'), answers)
    );
    await assertSucceeds(
      getDoc(doc(as(COACH), 'athletes', ATHLETE, 'savedWorkflows', 'w1'))
    );
    await assertFails(
      setDoc(doc(as(COACH), 'athletes', ATHLETE, 'savedWorkflows', 'w1'), answers)
    );
  });

  test('a progress doc cannot be used as free storage', async () => {
    await seed();
    const tooMany = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, true]));
    await assertFails(
      setDoc(doc(as(PLAYER), 'athletes', ATHLETE, 'savedWorkflows', 'w1'), {
        answers: tooMany,
        updatedAt: new Date(),
      })
    );
  });
});

describe('submissions on a cadence', () => {
  // Ids are written out as literals on purpose: this suite tests the RULES, so it must
  // not borrow src/period.ts to build the very ids the rules are supposed to pin.
  const W36 = 'w4__2026-W36';
  const W37 = 'w4__2026-W37';
  const sub = (uid, sid, data) =>
    setDoc(doc(as(uid), 'athletes', ATHLETE, 'savedWorkflows', sid), data);
  const submissions = (uid) => getDocs(collection(as(uid), 'athletes', ATHLETE, 'savedWorkflows'));

  test('a one-off still saves under the bare workflow id', async () => {
    await seed();
    // Written before cadences existed: no workflowId, no periodKey.
    await assertSucceeds(sub(PLAYER, 'w1', { answers: { 'Week 10': true }, updatedAt: new Date() }));
    // And the new client's one-off, which carries an empty period.
    await assertSucceeds(
      sub(PLAYER, 'w1', {
        answers: { 'Week 10': true },
        updatedAt: new Date(),
        workflowId: 'w1',
        periodKey: '',
      })
    );
  });

  test('a repeating submission saves under {workflowId}__{periodKey}', async () => {
    await seed();
    await assertSucceeds(
      sub(PLAYER, W36, {
        answers: { shooting: '7' },
        updatedAt: new Date(),
        workflowId: 'w4',
        periodKey: '2026-W36',
      })
    );
  });

  test('two weeks of the same evaluation coexist — this is the bug', async () => {
    await seed();
    await assertSucceeds(
      sub(PLAYER, W36, {
        answers: { shooting: '7' },
        updatedAt: new Date(),
        workflowId: 'w4',
        periodKey: '2026-W36',
      })
    );
    await assertSucceeds(
      sub(PLAYER, W37, {
        answers: { shooting: '9' },
        updatedAt: new Date(),
        workflowId: 'w4',
        periodKey: '2026-W37',
      })
    );
    const snap = await assertSucceeds(submissions(PLAYER));
    const byId = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    assert.deepEqual(Object.keys(byId).sort(), [W36, W37]);
    assert.equal(byId[W36].answers.shooting, '7');
    assert.equal(byId[W37].answers.shooting, '9');
  });

  test('re-saving the same week overwrites it rather than piling up', async () => {
    await seed();
    const week = (shooting) => ({
      answers: { shooting },
      updatedAt: new Date(),
      workflowId: 'w4',
      periodKey: '2026-W36',
    });
    await assertSucceeds(sub(PLAYER, W36, week('7')));
    await assertSucceeds(sub(PLAYER, W36, week('8')));
    const snap = await assertSucceeds(submissions(PLAYER));
    assert.equal(snap.size, 1);
    assert.equal(snap.docs[0].data().answers.shooting, '8');
  });

  test('the id is pinned — a week cannot be refiled as another week', async () => {
    await seed();
    await assertFails(
      sub(PLAYER, W37, {
        answers: { shooting: '2' },
        updatedAt: new Date(),
        workflowId: 'w4',
        periodKey: '2026-W36',
      })
    );
    await assertFails(
      sub(PLAYER, W37, {
        answers: { shooting: '2' },
        updatedAt: new Date(),
        workflowId: 'w9',
        periodKey: '2026-W37',
      })
    );
  });

  test('a workflowId with no periodKey cannot claim a suffixed id', async () => {
    await seed();
    // Looks like an odd case, and is: the rule builds workflowId + '__' + periodKey, and
    // reading a key that is not there errors out in rules — which denies. The deny is the
    // point, so it is pinned here rather than left to luck.
    await assertFails(
      sub(PLAYER, W36, { answers: { shooting: '7' }, updatedAt: new Date(), workflowId: 'w4' })
    );
  });

  test('extra fields are rejected on a submission too', async () => {
    await seed();
    await assertFails(
      sub(PLAYER, W36, {
        answers: { shooting: '7' },
        updatedAt: new Date(),
        workflowId: 'w4',
        periodKey: '2026-W36',
        gradedBy: COACH,
      })
    );
  });

  test('the 200-key cap survives the new shape', async () => {
    await seed();
    const tooMany = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`k${i}`, true]));
    await assertFails(
      sub(PLAYER, W36, {
        answers: tooMany,
        updatedAt: new Date(),
        workflowId: 'w4',
        periodKey: '2026-W36',
      })
    );
  });

  test('the guardian reads a submission — monitoring extends to assigned forms', async () => {
    await seed();
    const week = {
      answers: { shooting: '7' },
      updatedAt: new Date(),
      workflowId: 'w4',
      periodKey: '2026-W36',
    };
    await assertSucceeds(sub(PLAYER, W36, week));
    await assertSucceeds(getDoc(doc(as(PARENT), 'athletes', ATHLETE, 'savedWorkflows', W36)));
    await assertSucceeds(getDoc(doc(as(COACH), 'athletes', ATHLETE, 'savedWorkflows', W36)));
    await assertFails(getDoc(doc(as(STRANGER), 'athletes', ATHLETE, 'savedWorkflows', W36)));
  });

  test('the coach cannot author a submission, and the guardian still can', async () => {
    await seed();
    const week = {
      answers: { shooting: '7' },
      updatedAt: new Date(),
      workflowId: 'w4',
      periodKey: '2026-W36',
    };
    // The coach is the monitored party: he reads answers, he never writes them.
    await assertFails(sub(COACH, W36, week));
    // The guardian can, and that is deliberate — she files for a minor who cannot.
    // Pinned so removing it is a decision, not an accident.
    await assertSucceeds(sub(PARENT, W36, week));
  });
});

describe('notification mutes', () => {
  test('a mute lives under its owner’s uid and nobody else can reach it', async () => {
    await seed();
    await assertSucceeds(
      setDoc(doc(as(PARENT), 'users', PARENT), { mutedThreads: [T_CP], displayName: 'Denise' })
    );
    await assertFails(setDoc(doc(as(PLAYER), 'users', PARENT), { mutedThreads: [] }));
    await assertFails(getDoc(doc(as(PLAYER), 'users', PARENT)));
    await assertFails(getDoc(doc(as(COACH), 'users', PARENT)));
  });

  test('prefs are not a general-purpose bucket', async () => {
    await seed();
    await assertFails(
      setDoc(doc(as(PARENT), 'users', PARENT), { mutedThreads: [], role: 'coach' })
    );
  });
});

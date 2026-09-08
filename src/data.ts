import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, COACH_UID } from './firebase';
import { parseSubmissionId, periodKey, submissionId } from './period';
import type {
  Athlete,
  Message,
  Role,
  SavedWorkflow,
  SessionEvent,
  Thread,
  UserPrefs,
  Workflow,
} from './types';

/**
 * Every read here is shaped to satisfy firebase/firestore.rules. Rules never filter a
 * query — they reject any query that *could* return a document the caller cannot read.
 * So a query that looks merely inefficient is often the difference between working and
 * a blanket permission-denied. Each one below notes which rule it is answering to.
 */

const err = (label: string) => (e: unknown) => {
  // A denied listener fails silently otherwise, which reads as "no data" and sends you
  // hunting through the UI for a bug that is actually in the query shape.
  console.warn(`[fastbb] ${label} listener failed:`, e);
};

// --- roles -----------------------------------------------------------------

/**
 * Which of the three people is this? The coach is a constant; the other two are found by
 * matching the signed-in uid against the athlete record. Both queries are run because we
 * do not know the answer yet, and the rules permit each of them — the losing one simply
 * comes back empty.
 */
export async function resolveRole(
  uid: string
): Promise<{ role: Role; athlete: Athlete | null }> {
  if (uid === COACH_UID) {
    // The coach may list athletes unconstrained; isCoach() does not depend on the doc.
    const snap = await getDocs(collection(db, 'athletes'));
    const first = snap.docs[0];
    return { role: 'coach', athlete: first ? ({ id: first.id, ...first.data() } as Athlete) : null };
  }

  for (const [field, role] of [
    ['guardianUid', 'parent'],
    ['playerUid', 'player'],
  ] as const) {
    // Matches `resource.data.<field> == request.auth.uid` on /athletes.
    const snap = await getDocs(query(collection(db, 'athletes'), where(field, '==', uid)));
    if (!snap.empty) {
      const d = snap.docs[0];
      return { role, athlete: { id: d.id, ...d.data() } as Athlete };
    }
  }
  return { role: 'player', athlete: null };
}

export function subscribeAthlete(athleteId: string, cb: (a: Athlete | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'athletes', athleteId),
    (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Athlete) : null),
    err('athlete')
  );
}

/**
 * Every athlete this account can see, keyed by id — the coach's whole roster, or the
 * one athlete a family is attached to. Screens label a thread from the athlete named on
 * that thread rather than from "the" athlete, so a second athlete does not inherit the
 * first one's name everywhere.
 */
export function subscribeAthletes(
  role: Role,
  uid: string,
  cb: (byId: Record<string, Athlete>) => void
): Unsubscribe {
  const base = collection(db, 'athletes');
  // Same shape as resolveRole: unconstrained for the coach, matched on the caller's uid
  // otherwise, because rules reject any query that could return a doc they cannot read.
  const q =
    role === 'coach'
      ? query(base)
      : query(base, where(role === 'parent' ? 'guardianUid' : 'playerUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const byId: Record<string, Athlete> = {};
      snap.docs.forEach((d) => (byId[d.id] = { id: d.id, ...d.data() } as Athlete));
      cb(byId);
    },
    err('athletes')
  );
}

/**
 * The athlete record this email was invited to, if any slot is still unclaimed.
 *
 * A brand-new account matches none of the uid fields yet, so it cannot be found the
 * usual way. The rules let a VERIFIED account read the one record naming its own
 * address, which is exactly what these two queries ask for.
 */
export async function findInvite(
  email: string
): Promise<{ athleteId: string; field: 'guardianUid' | 'playerUid' } | null> {
  for (const [emailField, uidField] of [
    ['guardianEmail', 'guardianUid'],
    ['playerEmail', 'playerUid'],
  ] as const) {
    try {
      const snap = await getDocs(
        query(collection(db, 'athletes'), where(emailField, '==', email.toLowerCase()))
      );
      const open = snap.docs.find((d) => (d.data() as Athlete)[uidField] === '');
      if (open) return { athleteId: open.id, field: uidField };
    } catch (e) {
      // A denial here is normal: an address with no invitation matches nothing.
      console.warn(`[fastbb] invite lookup on ${emailField} failed:`, e);
    }
  }
  return null;
}

/**
 * Attach this account to the slot it was invited to. The rules allow it only when the
 * caller's email is verified, matches the invitation, the slot is still empty, and the
 * uid written is the caller's own — so this can be called optimistically.
 */
export function claimInvite(
  athleteId: string,
  field: 'guardianUid' | 'playerUid',
  uid: string
) {
  return updateDoc(doc(db, 'athletes', athleteId), { [field]: uid });
}

export const hasConsent = (a: Athlete | null | undefined): boolean =>
  Boolean(a && a.consentGrantedAt);

/** Only the guardian can call this and have it succeed; the rule enforces it server-side. */
export function setConsent(athleteId: string, granted: boolean) {
  return updateDoc(doc(db, 'athletes', athleteId), {
    consentGrantedAt: granted ? serverTimestamp() : deleteField(),
  });
}

// --- threads and messages --------------------------------------------------

/**
 * One query serves all three roles. Everyone who may see a thread is in `readers` —
 * the coach and the athlete as participants, the guardian as a reader-only — so
 * `array-contains uid` is exactly the set the rule allows, with no per-role branching.
 */
export function subscribeThreads(uid: string, cb: (t: Thread[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'threads'), where('readers', 'array-contains', uid)),
    (snap) => {
      const threads = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Thread);
      // The athlete's own thread first, then the parent thread — the order the preview
      // uses, and the order that puts the thing you came for at the top.
      threads.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'coach-player' ? -1 : 1));
      cb(threads);
    },
    err('threads')
  );
}

/**
 * The most recent `max` messages, oldest-first for rendering.
 *
 * Ordered DESCENDING and reversed rather than ascending, which matters more than it
 * looks: `orderBy('createdAt','asc') + limit(500)` returns the OLDEST 500, so a thread
 * that ever passed 500 messages would freeze — every new message falls outside the
 * window and never arrives.
 *
 * `serverTimestamps: 'estimate'` fills in a local estimate for a message that is still
 * in flight. Without it a just-sent message reads back with createdAt === null, which
 * sorts unpredictably and makes your own message jump around the thread until the
 * server confirms it. The final sort is done here, on the estimates, so the order on
 * screen never depends on how the query treated a pending write.
 */
export function subscribeMessages(
  threadId: string,
  cb: (m: Message[]) => void,
  max = 200
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'threads', threadId, 'messages'), orderBy('createdAt', 'desc'), limit(max)),
    (snap) => {
      const msgs = snap.docs.map(
        (d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as Message
      );
      msgs.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
      cb(msgs);
    },
    err('messages')
  );
}

/**
 * Just the newest message, for a thread row's preview line.
 *
 * The list used to subscribe to every message in every thread and take the last one —
 * up to 500 document reads per thread, per cold start, to draw two lines of text. On
 * Firestore's free tier that was comfortably the largest thing on the bill. This reads
 * exactly one.
 */
export function subscribeLastMessage(
  threadId: string,
  cb: (m: Message | null) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'threads', threadId, 'messages'), orderBy('createdAt', 'desc'), limit(1)),
    (snap) => {
      const d = snap.docs[0];
      cb(d ? ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) } as Message) : null);
    },
    err('lastMessage')
  );
}

/**
 * The rule requires `createdAt == request.time`, which is precisely what
 * serverTimestamp() produces — a client clock can neither backdate a message nor race
 * ahead of one. It also pins the field set, so nothing may be smuggled alongside.
 */
export function sendMessage(threadId: string, senderUid: string, text: string) {
  return addDoc(collection(db, 'threads', threadId, 'messages'), {
    senderUid,
    text: text.trim().slice(0, 4000),
    createdAt: serverTimestamp(),
  });
}

/**
 * Mirrors `canSend()` in the rules. The UI uses this to grey out the composer; the rule
 * is what actually stops the write. If these two ever disagree the rule wins, and the
 * user sees a failure instead of a locked box — which is the right way round.
 */
export function canPostIn(thread: Thread, uid: string, athlete: Athlete | null): boolean {
  if (!thread.participants.includes(uid)) return false;
  if (athlete && uid === athlete.playerUid) return hasConsent(athlete);
  return true;
}

// --- calendar --------------------------------------------------------------

/**
 * The coach's rule branch ignores the document, so he may list the whole collection.
 * Everyone else must constrain by athleteId or the query is rejected outright.
 *
 * ponytail: sorted in memory and unbounded by date. A season is a few hundred events.
 * Add a startsAt range filter — and the composite index it needs — when a roster makes
 * that false.
 */
export function subscribeEvents(
  role: Role,
  athleteId: string | null,
  cb: (e: SessionEvent[]) => void
): Unsubscribe {
  const base = collection(db, 'events');
  const q =
    role === 'coach' && !athleteId ? query(base) : query(base, where('athleteId', '==', athleteId));
  return onSnapshot(
    q,
    (snap) => {
      const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionEvent);
      events.sort((a, b) => (a.startsAt?.toMillis() ?? 0) - (b.startsAt?.toMillis() ?? 0));
      cb(events);
    },
    err('events')
  );
}

// --- the Locker ------------------------------------------------------------

export function subscribeWorkflows(cb: (w: Workflow[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, 'workflows'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Workflow);
      list.sort((a, b) => a.name.localeCompare(b.name));
      cb(list);
    },
    err('workflows')
  );
}

/**
 * Every submission this athlete has made, keyed by SUBMISSION id — which is the
 * workflow id for a one-off and `{workflowId}__{periodKey}` for a repeating one.
 * Callers that want "the submissions for workflow X" should filter on `workflowId`
 * rather than look up by workflow id, or they will miss every repeat.
 */
export function subscribeSubmissions(
  athleteId: string,
  cb: (s: Record<string, SavedWorkflow>) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'athletes', athleteId, 'savedWorkflows'),
    (snap) => {
      const out: Record<string, SavedWorkflow> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as SavedWorkflow;
        // Submissions written before workflowId existed as a field carry it in the id.
        out[d.id] = { ...data, ...(data.workflowId ? {} : parseSubmissionId(d.id)) };
      });
      cb(out);
    },
    err('savedWorkflows')
  );
}

/**
 * The coach's view across the roster. One listener per athlete rather than a
 * collection-group query, which would need its own rules block and a composite index.
 * ponytail: fine for one trainer. If the roster reaches the dozens, denormalise a
 * lastSubmissionAt onto the athlete doc and open submissions on demand.
 */
export function subscribeRosterSubmissions(
  athleteIds: string[],
  cb: (byAthlete: Record<string, Record<string, SavedWorkflow>>) => void
): Unsubscribe {
  const acc: Record<string, Record<string, SavedWorkflow>> = {};
  const unsubs = athleteIds.map((aid) =>
    subscribeSubmissions(aid, (subs) => {
      acc[aid] = subs;
      cb({ ...acc });
    })
  );
  return () => unsubs.forEach((u) => u());
}

/**
 * Save one submission. The answers are the athlete's; the coach's HTML is never copied.
 *
 * The cadence decides whether this overwrites or files a new document: a weekly game
 * evaluation saved on two different weeks must not collide, and the same evaluation
 * saved twice in one week must.
 */
export function saveWorkflowAnswers(
  athleteId: string,
  workflow: Pick<Workflow, 'id' | 'cadence'>,
  answers: Record<string, string | boolean | number>,
  now: Date
) {
  const cadence = workflow.cadence ?? 'once';
  const sid = submissionId(workflow.id, cadence, now);
  return setDoc(doc(db, 'athletes', athleteId, 'savedWorkflows', sid), {
    // The rule caps this at 200 keys; truncating here turns a would-be permission
    // error into a save that works, on a document nobody will ever fill that far.
    answers: Object.fromEntries(Object.entries(answers).slice(0, 200)),
    updatedAt: serverTimestamp(),
    // Both are required together: the rule pins the id to these, so a client cannot
    // file this week's evaluation under a different week.
    workflowId: workflow.id,
    periodKey: periodKey(cadence, now),
  });
}

// --- notification preferences ----------------------------------------------

export function subscribePrefs(uid: string, cb: (p: UserPrefs) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => cb((snap.data() as UserPrefs) ?? { mutedThreads: [] }),
    err('prefs')
  );
}

/**
 * Stored under the muter's own uid, so a player cannot clear a mute his guardian set —
 * it is not in a document he is allowed to write.
 */
export function setMuted(uid: string, prefs: UserPrefs, threadId: string, muted: boolean) {
  const next = muted
    ? Array.from(new Set([...(prefs.mutedThreads ?? []), threadId]))
    : (prefs.mutedThreads ?? []).filter((t) => t !== threadId);
  return setDoc(doc(db, 'users', uid), { ...prefs, mutedThreads: next }, { merge: true });
}

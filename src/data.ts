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

export function subscribeMessages(threadId: string, cb: (m: Message[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'threads', threadId, 'messages'), orderBy('createdAt', 'asc'), limit(500)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message)),
    err('messages')
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

export function subscribeSavedWorkflows(
  athleteId: string,
  cb: (s: Record<string, SavedWorkflow>) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'athletes', athleteId, 'savedWorkflows'),
    (snap) => {
      const out: Record<string, SavedWorkflow> = {};
      snap.docs.forEach((d) => (out[d.id] = d.data() as SavedWorkflow));
      cb(out);
    },
    err('savedWorkflows')
  );
}

/** The athlete's answers, never a second copy of the coach's HTML. */
export function saveWorkflowAnswers(
  athleteId: string,
  workflowId: string,
  answers: Record<string, string | boolean | number>
) {
  return setDoc(doc(db, 'athletes', athleteId, 'savedWorkflows', workflowId), {
    // The rule caps this at 200 keys; truncating here turns a would-be permission
    // error into a save that works, on a document nobody will ever fill that far.
    answers: Object.fromEntries(Object.entries(answers).slice(0, 200)),
    updatedAt: serverTimestamp(),
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

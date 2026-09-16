import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';
import {
  resolveRole,
  subscribeAthlete,
  subscribeAthletes,
  subscribePrefs,
  readPrefsOnce,
  savePrefs,
  hasConsent,
  findInvite,
  claimInvite,
} from './data';
import { readState, visit } from './rewards';
import { syncReminders } from './notify';
import { resetOutcome, type ResetOutcome } from './authMessages';
import type { Athlete, Role, UserPrefs } from './types';

interface Session {
  user: User | null;
  role: Role;
  /** The athlete this account is attached to. For the coach, whoever is first on the
   *  roster — use `athletesById` when the athlete a screen means is a specific one. */
  athlete: Athlete | null;
  /** Every athlete this account can see. One entry for a family, the roster for the coach. */
  athletesById: Record<string, Athlete>;
  prefs: UserPrefs;
  /** False until auth has reported in and the role lookup has finished. */
  ready: boolean;
  consent: boolean;
  /** Signed in, but the address has not been confirmed yet — nothing will resolve. */
  needsVerification: boolean;
  /** Signed in and verified, but no athlete record names this address. */
  notInvited: boolean;
  resendVerification: () => Promise<void>;
  /** Ask Firebase to email a reset link. Resolves with the outcome to show rather than
   *  throwing, because the one case that must NOT be distinguishable from success is
   *  an error code, and a caller that catches is a caller that can leak it. */
  resetPassword: (email: string) => Promise<ResetOutcome>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>('player');
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [athletesById, setAthletesById] = useState<Record<string, Athlete>>({});
  const [prefs, setPrefs] = useState<UserPrefs>({ mutedThreads: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  // Resolve the role once per sign-in. `cancelled` matters because a fast
  // sign-out during the lookup would otherwise write a stale role back in.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setRole('player');
      setAthlete(null);
      setAthletesById({});
      setPrefs({ mutedThreads: [] });
      setReady(true);
      return;
    }
    setReady(false);
    resolveRole(user.uid)
      .then(async ({ role: r, athlete: a }) => {
        if (cancelled) return;
        // A freshly verified account still holds a token minted before verification,
        // and the rules read email_verified off that token — so without refreshing it
        // the claim is denied for a user who has genuinely just clicked the link.
        if (!a && r !== 'coach' && user.emailVerified) {
          await user.getIdToken(true).catch(() => {});
          const invite = await findInvite(user.email ?? '');
          if (invite && !cancelled) {
            await claimInvite(invite.athleteId, invite.field, user.uid).catch((e) =>
              console.warn('[fastbb] claim failed:', e)
            );
            const again = await resolveRole(user.uid);
            if (cancelled) return;
            setRole(again.role);
            setAthlete(again.athlete);
            return;
          }
        }
        setRole(r);
        setAthlete(a);
      })
      .catch((e) => console.warn('[fastbb] role lookup failed:', e))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Consent has to be live, not fetched once: when a parent revokes it on her phone,
  // the player's composer should lock on his without either of them relaunching.
  useEffect(() => {
    if (!athlete?.id) return;
    return subscribeAthlete(athlete.id, (a) => a && setAthlete(a));
  }, [athlete?.id]);

  useEffect(() => {
    if (!user) return;
    return subscribeAthletes(role, user.uid, setAthletesById);
  }, [user?.uid, role]);

  useEffect(() => {
    if (!user) return;
    return subscribePrefs(user.uid, setPrefs);
  }, [user?.uid]);

  /**
   * The daily streak, counted ONCE per sign-in.
   *
   * It used to run on every prefs snapshot, and that was the bug: Firestore answers a
   * cold listener from cache first, and for a document it has never cached the answer
   * is "does not exist". As a UserPrefs that is an account with no lastDay, which
   * `visit()` reads as a first-ever open and writes `streak: 1` — clobbering the real
   * streak arriving from the server a moment later. Every launch was a coin flip.
   *
   * So: one read, at sign-in, and nothing at all unless Firestore actually confirmed
   * what it found. The ref keeps it to once per account even if this effect is torn
   * down and rebuilt, and `visit()` still returns null on a day already counted, so
   * signing in twice in an evening writes nothing.
   */
  const streakChecked = useRef<string | null>(null);
  useEffect(() => {
    const uid = user?.uid;
    // Cleared on sign-out so signing back in is a fresh login and checks again.
    if (!uid) {
      streakChecked.current = null;
      return;
    }
    if (streakChecked.current === uid) return;
    streakChecked.current = uid;
    let cancelled = false;

    (async () => {
      const { prefs: saved, confirmed } = await readPrefsOnce(uid);
      if (cancelled || !confirmed) return;

      const before = readState(saved);
      const patch = visit(before, new Date());
      // NOT an empty catch. A permission-denied here is silent and fatal to the whole
      // feature: the streak simply never persists, and the only visible symptom turns up
      // later and somewhere else. That is exactly how a stale deployed ruleset hid for a
      // day. If this ever logs, check that firestore.rules is DEPLOYED, not just correct.
      if (patch)
        await savePrefs(uid, saved, patch).catch((e) =>
          console.warn('[fastbb] streak write refused:', (e as { code?: string })?.code ?? e)
        );

      // Re-planned here rather than on every snapshot, for the same reason: the streak
      // this is warning about has just been settled, and nothing later in the session
      // changes it. The You tab re-plans when the switch is toggled.
      await syncReminders({ ...before, ...patch }, saved.remind !== false);
    })().catch((e) => console.warn('[fastbb] streak check failed:', e));

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const value = useMemo<Session>(
    () => ({
      user,
      role,
      athlete,
      athletesById,
      prefs,
      ready,
      consent: hasConsent(athlete),
      // The coach is exempt. His identity is the uid constant inside firestore.rules,
      // not his address, so verification proves nothing about him — and an account the
      // owner created in the Firebase console is unverified by default, which would
      // have locked Blake out of his own app on first sign-in.
      needsVerification: Boolean(user && !user.emailVerified && role !== 'coach'),
      notInvited: Boolean(user && user.emailVerified && role !== 'coach' && !athlete),
      resendVerification: async () => {
        if (auth.currentUser) await sendEmailVerification(auth.currentUser);
      },
      resetPassword: async (email) => {
        const addr = email.trim().toLowerCase();
        if (!addr) return resetOutcome('auth/missing-email');
        try {
          // Firebase sends the mail and hosts the reset page itself. There is no
          // endpoint to write, no token to store, and no expiry to get wrong.
          await sendPasswordResetEmail(auth, addr);
          return resetOutcome('');
        } catch (e) {
          return resetOutcome((e as { code?: string })?.code ?? 'unknown');
        }
      },
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },
      signOut: () => fbSignOut(auth),
    }),
    [user, role, athlete, athletesById, prefs, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}

/**
 * Display names for the three people on a given athlete's threads. Pass the athleteId
 * the screen is actually about — a coach with two athletes must not label both threads
 * with whichever athlete happened to load first.
 */
export function useNames(athleteId?: string) {
  const { athlete, athletesById } = useSession();
  const a = (athleteId ? athletesById[athleteId] : null) ?? athlete;
  return {
    coach: 'Coach Kingsley',
    parent: a?.guardianName ?? 'Parent',
    player: a?.playerName ?? 'Athlete',
  };
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

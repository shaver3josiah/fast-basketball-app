import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  sendEmailVerification,
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
  hasConsent,
  findInvite,
  claimInvite,
} from './data';
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

  const value = useMemo<Session>(
    () => ({
      user,
      role,
      athlete,
      athletesById,
      prefs,
      ready,
      consent: hasConsent(athlete),
      needsVerification: Boolean(user && !user.emailVerified),
      notInvited: Boolean(user && user.emailVerified && role !== 'coach' && !athlete),
      resendVerification: async () => {
        if (auth.currentUser) await sendEmailVerification(auth.currentUser);
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

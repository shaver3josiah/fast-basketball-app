import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';
import { resolveRole, subscribeAthlete, subscribePrefs, hasConsent } from './data';
import type { Athlete, Role, UserPrefs } from './types';

interface Session {
  user: User | null;
  role: Role;
  athlete: Athlete | null;
  prefs: UserPrefs;
  /** False until auth has reported in and the role lookup has finished. */
  ready: boolean;
  consent: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>('player');
  const [athlete, setAthlete] = useState<Athlete | null>(null);
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
      setPrefs({ mutedThreads: [] });
      setReady(true);
      return;
    }
    setReady(false);
    resolveRole(user.uid)
      .then(({ role: r, athlete: a }) => {
        if (cancelled) return;
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
    return subscribePrefs(user.uid, setPrefs);
  }, [user?.uid]);

  const value = useMemo<Session>(
    () => ({
      user,
      role,
      athlete,
      prefs,
      ready,
      consent: hasConsent(athlete),
      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },
      signOut: () => fbSignOut(auth),
    }),
    [user, role, athlete, prefs, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside <SessionProvider>');
  return s;
}

/** Display names for the three people, drawn from the athlete record the coach owns. */
export function useNames() {
  const { athlete } = useSession();
  return {
    coach: 'Coach Kingsley',
    parent: athlete?.guardianName ?? 'Parent',
    player: athlete?.playerName ?? 'Athlete',
  };
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

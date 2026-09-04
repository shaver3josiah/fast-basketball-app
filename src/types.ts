import type { Timestamp } from 'firebase/firestore';

export type Role = 'coach' | 'parent' | 'player';

/**
 * Field names here are load-bearing: firebase/firestore.rules validates them by
 * name. Renaming a field on this side without renaming it in the rules turns a
 * security control into a no-op. Change both or neither.
 */

export interface Athlete {
  id: string;
  guardianUid: string;
  playerUid: string;
  /** Absent OR null both mean "no consent". Only the guardian can write it. */
  consentGrantedAt?: Timestamp | null;
  playerName: string;
  guardianName: string;
  age?: number;
  joinedAt?: Timestamp;
}

export interface Thread {
  id: string;
  athleteId: string;
  /** Who may post. */
  participants: string[];
  /** Who may read. Superset of participants — the guardian sits here on the
   *  coach<->player thread, which is the monitoring guarantee. */
  readers: string[];
  kind: 'coach-player' | 'coach-parent';
  title: string;
}

export interface Message {
  id: string;
  senderUid: string;
  text: string;
  /** serverTimestamp() on write; the rule requires createdAt == request.time. */
  createdAt: Timestamp | null;
}

export interface SessionEvent {
  id: string;
  athleteId: string;
  type: import('./theme').SessionType;
  name: string;
  location: string;
  startsAt: Timestamp;
  /** Rendered struck-through at 40% opacity, plus the word "Canceled". */
  canceled?: boolean;
  /** Empty for rest/film days, which have no clock time. */
  timeLabel?: string;
}

export interface Workflow {
  id: string;
  name: string;
  html: string;
  publishedBy: string;
  publishedAt: Timestamp | null;
  sizeBytes: number;
}

/** The athlete's answers — never a second copy of the coach's HTML. */
export interface SavedWorkflow {
  answers: Record<string, string | boolean | number>;
  updatedAt: Timestamp | null;
}

/**
 * Private per-user preferences. Lives under the owner's own uid so the mute list
 * is structurally unreachable by anyone else — a player cannot clear a mute his
 * guardian set, because it is not in a document he can write.
 */
export interface UserPrefs {
  mutedThreads: string[];
  displayName?: string;
}

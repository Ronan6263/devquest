import type { SessionRecord } from '../types';
import { dayKey, weekKey } from './time';

/**
 * Weekly streak: a week qualifies when it has sessions on 3+ distinct days.
 * Missed weeks PAUSE the streak (never reset) — so the streak is simply the
 * total number of qualifying weeks ever.
 */
export function streakWeeks(sessions: SessionRecord[]): number {
  const daysPerWeek = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.voided) continue;
    const wk = weekKey(s.startedAt);
    if (!daysPerWeek.has(wk)) daysPerWeek.set(wk, new Set());
    daysPerWeek.get(wk)!.add(dayKey(s.startedAt));
  }
  let count = 0;
  for (const days of daysPerWeek.values()) if (days.size >= 3) count++;
  return count;
}

/** Distinct session-days in the week containing `now`. */
export function sessionDaysThisWeek(sessions: SessionRecord[], now: number): number {
  const wk = weekKey(now);
  const days = new Set<string>();
  for (const s of sessions) {
    if (!s.voided && weekKey(s.startedAt) === wk) days.add(dayKey(s.startedAt));
  }
  return days.size;
}

/** Max distinct session-days in any single week (for Cold Start progress). */
export function maxSessionDaysInAWeek(sessions: SessionRecord[]): number {
  const daysPerWeek = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.voided) continue;
    const wk = weekKey(s.startedAt);
    if (!daysPerWeek.has(wk)) daysPerWeek.set(wk, new Set());
    daysPerWeek.get(wk)!.add(dayKey(s.startedAt));
  }
  let max = 0;
  for (const days of daysPerWeek.values()) max = Math.max(max, days.size);
  return max;
}

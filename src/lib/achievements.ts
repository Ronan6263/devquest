import type { AchievementState, PersistedState } from '../types';
import { maxSessionDaysInAWeek } from './streak';

export interface AchievementDef {
  id: string;
  cls: 'auto' | 'proof';
  icon: string;
  name: string;
  desc: string;
  xp: number; // auto achievements grant 0 (they're bookkeeping); proof grants XP
  repeatable?: boolean; // proof only — repeatable weekly
  /** auto only: returns [current, target] progress */
  progress?: (s: PersistedState) => [number, number];
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: 'first-blood', cls: 'auto', icon: '🩸', name: 'First Blood',
    desc: 'Complete your first task.', xp: 0,
    progress: (s) => [Math.min(1, doneTasks(s).length), 1]
  },
  {
    id: 'ship-of-theseus', cls: 'auto', icon: '♻', name: 'Ship of Theseus',
    desc: 'Complete 10 tasks on one quest.', xp: 0,
    progress: (s) => {
      const per = new Map<string, number>();
      for (const t of doneTasks(s)) per.set(t.questId, (per.get(t.questId) ?? 0) + 1);
      return [Math.max(0, ...per.values()), 10];
    }
  },
  {
    id: 'cold-start', cls: 'auto', icon: '❄', name: 'Cold Start',
    desc: 'Start sessions on 5 different days in one week.', xp: 0,
    progress: (s) => [maxSessionDaysInAWeek(s.sessions), 5]
  },
  {
    id: 'closer', cls: 'auto', icon: '🏁', name: 'Closer',
    desc: 'Complete a whole quest.', xp: 0,
    progress: (s) => [Math.min(1, s.quests.filter((q) => q.status === 'done').length), 1]
  },
  {
    id: 'necromancer', cls: 'auto', icon: '☠', name: 'Necromancer',
    desc: 'Complete a task on a project untouched 30+ days.', xp: 0
    // no derivable progress — granted explicitly when the condition fires
  },
  {
    id: 'invisible-middle', cls: 'auto', icon: '◈', name: 'The Invisible Middle',
    desc: 'Complete 5 tasks tagged design.', xp: 0,
    progress: (s) => [doneTasks(s).filter((t) => t.tags.includes('design')).length, 5]
  },
  {
    id: 'witnessed', cls: 'proof', icon: '👁', name: 'Witnessed',
    desc: 'Post a gif/clip of your game anywhere public.', xp: 40, repeatable: true
  },
  {
    id: 'shipped-it', cls: 'proof', icon: '🚀', name: 'Shipped It',
    desc: 'Push a playable build to itch.', xp: 80
  },
  {
    id: 'the-mentor', cls: 'proof', icon: '🧭', name: 'The Mentor',
    desc: 'Log a check-in with your mentor.', xp: 60
  },
  {
    id: 'stranger-danger', cls: 'proof', icon: '👾', name: 'Stranger Danger',
    desc: 'A stranger plays your game.', xp: 100
  }
];

export const defById = (id: string) => ACHIEVEMENT_DEFS.find((d) => d.id === id)!;

function doneTasks(s: PersistedState) {
  return s.tasks.filter((t) => t.status === 'done');
}

/**
 * Re-evaluate all auto achievements against the current state.
 * Returns the updated achievement list plus the names of newly unlocked ones.
 * `extraUnlocks` lets action-time conditions (Necromancer) force an unlock.
 */
export function evaluateAuto(
  state: PersistedState,
  now: number,
  extraUnlocks: string[] = []
): { achievements: AchievementState[]; newlyUnlocked: string[] } {
  const newlyUnlocked: string[] = [];
  const achievements = state.achievements.map((a) => {
    const def = defById(a.id);
    if (def.cls !== 'auto' || a.unlockedAt) return a;
    let unlocked = extraUnlocks.includes(a.id);
    if (!unlocked && def.progress) {
      const [cur, target] = def.progress(state);
      unlocked = cur >= target;
    }
    if (unlocked) {
      newlyUnlocked.push(def.name);
      return { ...a, unlockedAt: now, timesEarned: 1 };
    }
    return a;
  });
  return { achievements, newlyUnlocked };
}

export function initialAchievementStates(): AchievementState[] {
  return ACHIEVEMENT_DEFS.map((d) => ({ id: d.id, timesEarned: 0, proofUrls: [] }));
}

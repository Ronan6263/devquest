import type { PersistedState } from '../types';
import { initialAchievementStates } from './achievements';

/**
 * A blank slate — no projects, quests, tasks, sessions, or XP. Used for
 * first launch and for the Fresh Start reset in Config.
 */
export function emptyState(): PersistedState {
  return {
    version: 1,
    player: { handle: 'SOLO_DEV', xp: 0, soundOn: true, unlockedThemes: ['Terminal'] },
    projects: [],
    quests: [],
    tasks: [],
    sessions: [],
    achievements: initialAchievementStates()
  };
}

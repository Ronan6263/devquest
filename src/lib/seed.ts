import type { PersistedState } from '../types';
import { initialAchievementStates } from './achievements';
import { evaluateAuto } from './achievements';
import { SIZE_XP } from './levels';

/**
 * Day-one content (design doc §7). Honest start: only "Write design doc v0.1"
 * is claimed (the meter must move on day one) — everything else is todo.
 */
export function seedState(now: number): PersistedState {
  const state: PersistedState = {
    version: 1,
    player: { handle: 'SOLO_DEV', xp: SIZE_XP.S, soundOn: true, unlockedThemes: ['Terminal'] },
    projects: [
      { id: 'p-cursed', name: 'CURSED APPLIANCES', colorTag: '#D4622B', status: 'active', createdAt: now },
      { id: 'p-devquest', name: 'DEVQUEST', colorTag: '#7FB069', status: 'active', createdAt: now },
      { id: 'p-doodle', name: 'DOODLE DEFENSE', colorTag: '#5B8AC7', status: 'parked', createdAt: now }
    ],
    quests: [
      {
        id: 'q-toaster', projectId: 'p-cursed', title: 'Toaster #1',
        definitionOfDone: 'One appliance, workbench to CLEANSED stamp, playable start to finish.',
        status: 'active', createdAt: now
      },
      {
        id: 'q-build', projectId: 'p-devquest', title: 'Build DevQuest',
        definitionOfDone: 'The app tracks its own construction, then deploys to GitHub Pages.',
        status: 'active', createdAt: now + 1
      },
      {
        id: 'q-wave', projectId: 'p-doodle', title: 'Wave system prototype',
        definitionOfDone: 'Enemies spawn, follow a path, and can be defeated.',
        status: 'parked', createdAt: now + 2
      }
    ],
    tasks: [
      { id: 't-casing', questId: 'q-toaster', title: 'Blockout toaster casing', size: 'S', tags: ['art'], status: 'todo', createdAt: now },
      { id: 't-panel', questId: 'q-toaster', title: 'Side panel + 2 screw interactables', size: 'M', tags: ['systems'], status: 'todo', createdAt: now + 1 },
      { id: 't-teeth', questId: 'q-toaster', title: 'Teeth mesh + tweezer pickup', size: 'M', tags: ['systems'], status: 'todo', createdAt: now + 2 },
      { id: 't-note', questId: 'q-toaster', title: 'Work-order note UI', size: 'S', tags: ['design'], status: 'todo', createdAt: now + 3 },
      { id: 't-stamp', questId: 'q-toaster', title: 'CLEANSED stamp + reset', size: 'S', tags: ['systems'], status: 'todo', createdAt: now + 4 },
      { id: 't-loop', questId: 'q-toaster', title: 'Full toaster loop playable', size: 'L', tags: ['design'], status: 'todo', createdAt: now + 5 },
      { id: 't-doc', questId: 'q-build', title: 'Write design doc v0.1', size: 'S', tags: ['design'], status: 'done', createdAt: now + 6, completedAt: now + 6 },
      { id: 't-mockup', questId: 'q-build', title: 'UI mockup — all screens', size: 'M', tags: ['design'], status: 'todo', createdAt: now + 7 },
      { id: 't-core', questId: 'q-build', title: 'Core loop functional', size: 'L', tags: ['systems'], status: 'todo', createdAt: now + 8 },
      { id: 't-pwa', questId: 'q-build', title: 'PWA installable', size: 'M', tags: ['systems'], status: 'todo', createdAt: now + 9 },
      { id: 't-deploy', questId: 'q-build', title: 'Deploy to GitHub Pages', size: 'S', tags: ['biz'], status: 'todo', createdAt: now + 10 }
    ],
    sessions: [],
    achievements: initialAchievementStates()
  };
  // design doc task is pre-claimed → First Blood should be lit on day one
  const { achievements } = evaluateAuto(state, now);
  state.achievements = achievements;
  return state;
}

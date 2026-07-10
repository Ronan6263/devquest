import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  LiveSession, OverlayData, PersistedState, Screen, Task, TaskSize, TaskTag
} from './types';
import { SIZE_XP, levelInfo } from './lib/levels';
import { evaluateAuto, defById } from './lib/achievements';
import { loadState, saveState } from './lib/db';
import { seedState } from './lib/seed';
import { weekKey } from './lib/time';
import { playLevelUp, playXpGain } from './lib/sound';

export interface AppState {
  data: PersistedState;
  screen: Screen;
  session: LiveSession | null;
  overlay: OverlayData | null;
  toast: string | null;
  hydrated: boolean;
}

type Action =
  | { type: 'hydrate'; data: PersistedState }
  | { type: 'go'; screen: Screen }
  | { type: 'start-session' }
  | { type: 'toggle-check'; taskId: string }
  | { type: 'end-session'; now: number }
  | { type: 'continue-overlay' }
  | { type: 'log-proof'; achievementId: string; proof: string; now: number }
  | { type: 'add-task'; questId: string; title: string; size: TaskSize; tag: TaskTag }
  | { type: 'toggle-sound' }
  | { type: 'set-handle'; handle: string }
  | { type: 'import'; data: PersistedState }
  | { type: 'toast'; message: string }
  | { type: 'dismiss-toast' };

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Next-ignition queue: first todo task, active quests first (in creation
 * order), tasks in creation order within a quest. Pre-loaded before the
 * current session ends.
 */
export function nextQueuedTask(data: PersistedState): Task | null {
  const questRank = new Map(
    [...data.quests]
      .sort((a, b) => {
        const pa = a.status === 'active' ? 0 : 1;
        const pb = b.status === 'active' ? 0 : 1;
        return pa - pb || a.createdAt - b.createdAt;
      })
      .map((q, i) => [q.id, i])
  );
  const todo = data.tasks
    .filter((t) => t.status === 'todo' && questRank.has(t.questId) &&
      data.quests.find((q) => q.id === t.questId)!.status === 'active')
    .sort((a, b) => (questRank.get(a.questId)! - questRank.get(b.questId)!) || a.createdAt - b.createdAt);
  return todo[0] ?? null;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, data: action.data, hydrated: true };

    case 'go':
      return { ...state, screen: action.screen };

    case 'start-session': {
      const task = nextQueuedTask(state.data);
      if (!task) return { ...state, toast: 'No task queued — define one on the Quests screen first.' };
      return {
        ...state,
        screen: 'session',
        session: { id: uid(), taskId: task.id, startedAt: Date.now(), checked: {} }
      };
    }

    case 'toggle-check': {
      if (!state.session) return state;
      const checked = { ...state.session.checked, [action.taskId]: !state.session.checked[action.taskId] };
      return { ...state, session: { ...state.session, checked } };
    }

    case 'end-session': {
      const s = state.session;
      if (!s) return state;
      const now = action.now;
      const elapsed = Math.floor((now - s.startedAt) / 1000);

      // The 90-Second Rule: nothing persisted, nothing logged.
      if (elapsed < 90) {
        return {
          ...state, session: null, screen: 'home',
          toast: 'Under 90s — nothing logged. Starting is always free to abandon.'
        };
      }

      const doneIds = Object.keys(s.checked).filter((k) => s.checked[k]);
      const sessionRecord = {
        id: s.id, startedAt: s.startedAt, endedAt: now, taskIdsCompleted: doneIds, voided: false
      };

      if (doneIds.length === 0) {
        const data: PersistedState = { ...state.data, sessions: [...state.data.sessions, sessionRecord] };
        const { achievements, newlyUnlocked } = evaluateAuto(data, now);
        return {
          ...state, data: { ...data, achievements }, session: null, screen: 'home',
          toast: newlyUnlocked.length
            ? `Session logged · 0 XP · Achievement unlocked: ${newlyUnlocked.join(', ')}`
            : 'Session logged · 0 XP · no task checked off.'
        };
      }

      // Necromancer check BEFORE marking done: last touch on the task's project
      const necroIds: string[] = [];
      for (const id of doneIds) {
        const task = state.data.tasks.find((t) => t.id === id);
        if (!task) continue;
        const quest = state.data.quests.find((q) => q.id === task.questId);
        if (!quest) continue;
        const projQuests = state.data.quests.filter((q) => q.projectId === quest.projectId).map((q) => q.id);
        const touches = state.data.tasks
          .filter((t) => projQuests.includes(t.questId) && t.completedAt !== undefined)
          .map((t) => t.completedAt!) ;
        const project = state.data.projects.find((p) => p.id === quest.projectId);
        const lastTouch = touches.length ? Math.max(...touches) : project?.createdAt ?? now;
        if (now - lastTouch >= 30 * 24 * 3600 * 1000) necroIds.push('necromancer');
      }

      const tasks = state.data.tasks.map((t) =>
        doneIds.includes(t.id) ? { ...t, status: 'done' as const, completedAt: now, sessionId: s.id } : t
      );

      const lines = doneIds
        .map((id) => state.data.tasks.find((t) => t.id === id))
        .filter((t): t is Task => !!t)
        .map((t) => ({ title: t.title, xp: SIZE_XP[t.size] }));
      let earned = lines.reduce((a, l) => a + l.xp, 0);

      // Quest completion bonus: Σ(task XP) × 0.5 when the quest's last task lands
      const quests = state.data.quests.map((q) => {
        if (q.status !== 'active') return q;
        const qTasks = tasks.filter((t) => t.questId === q.id);
        if (qTasks.length > 0 && qTasks.every((t) => t.status === 'done')) {
          const bonus = Math.round(qTasks.reduce((a, t) => a + SIZE_XP[t.size], 0) * 0.5);
          earned += bonus;
          lines.push({ title: `QUEST COMPLETE · ${q.title}`, xp: bonus });
          return { ...q, status: 'done' as const, completedAt: now };
        }
        return q;
      });

      const oldXp = state.data.player.xp;
      const newXp = oldXp + earned;
      const data: PersistedState = {
        ...state.data, tasks, quests,
        sessions: [...state.data.sessions, sessionRecord]
      };
      const { achievements, newlyUnlocked } = evaluateAuto(data, now, necroIds);
      data.achievements = achievements;

      const overlay: OverlayData = {
        headline: 'TASK COMPLETE',
        earned, oldXp, newXp,
        levelUp: levelInfo(newXp).level > levelInfo(oldXp).level,
        lines
      };
      return {
        ...state, data, session: null, overlay,
        toast: newlyUnlocked.length ? `Achievement unlocked: ${newlyUnlocked.join(' · ')}` : state.toast
      };
    }

    case 'continue-overlay': {
      if (!state.overlay) return state;
      const data = { ...state.data, player: { ...state.data.player, xp: state.overlay.newXp } };
      return { ...state, data, overlay: null, screen: 'home' };
    }

    case 'log-proof': {
      const a = state.data.achievements.find((x) => x.id === action.achievementId);
      if (!a) return state;
      const def = defById(a.id);
      if (def.cls !== 'proof') return state;
      if (a.unlockedAt && !def.repeatable) return state;
      if (def.repeatable && a.lastEarnedAt && weekKey(a.lastEarnedAt) === weekKey(action.now)) {
        return { ...state, toast: `${def.name} is weekly — already logged this week. Honest meters only.` };
      }
      const achievements = state.data.achievements.map((x) =>
        x.id === a.id
          ? {
              ...x,
              unlockedAt: x.unlockedAt ?? action.now,
              timesEarned: x.timesEarned + 1,
              lastEarnedAt: action.now,
              proofUrls: action.proof ? [...x.proofUrls, action.proof] : x.proofUrls
            }
          : x
      );
      const oldXp = state.data.player.xp;
      const newXp = oldXp + def.xp;
      const overlay: OverlayData = {
        headline: `PROOF LOGGED · ${def.name.toUpperCase()}`,
        earned: def.xp, oldXp, newXp,
        levelUp: levelInfo(newXp).level > levelInfo(oldXp).level,
        lines: [{ title: `${def.name} — proof attached`, xp: def.xp }]
      };
      return { ...state, data: { ...state.data, achievements }, overlay };
    }

    case 'add-task': {
      const title = action.title.trim();
      if (!title) return state;
      const task: Task = {
        id: uid(), questId: action.questId, title, size: action.size,
        tags: [action.tag], status: 'todo', createdAt: Date.now()
      };
      return { ...state, data: { ...state.data, tasks: [...state.data.tasks, task] } };
    }

    case 'toggle-sound':
      return {
        ...state,
        data: { ...state.data, player: { ...state.data.player, soundOn: !state.data.player.soundOn } }
      };

    case 'set-handle': {
      const handle = action.handle.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 20) || 'SOLO_DEV';
      return { ...state, data: { ...state.data, player: { ...state.data.player, handle } } };
    }

    case 'import':
      return { ...state, data: action.data, toast: 'Import complete — state replaced.' };

    case 'toast':
      return { ...state, toast: action.message };

    case 'dismiss-toast':
      return { ...state, toast: null };

    default:
      return state;
  }
}

interface Store {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    data: seedState(Date.now()),
    screen: 'home' as Screen,
    session: null,
    overlay: null,
    toast: null,
    hydrated: false
  }));

  // hydrate from IndexedDB once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadState();
      if (!cancelled) dispatch({ type: 'hydrate', data: stored ?? seedState(Date.now()) });
    })();
    return () => { cancelled = true; };
  }, []);

  // persist on every data mutation (after hydration)
  const lastData = useRef<PersistedState | null>(null);
  useEffect(() => {
    if (!state.hydrated) return;
    if (lastData.current === state.data) return;
    lastData.current = state.data;
    saveState(state.data);
  }, [state.hydrated, state.data]);

  // reward-moment sound
  const prevOverlay = useRef<OverlayData | null>(null);
  useEffect(() => {
    if (state.overlay && !prevOverlay.current && state.data.player.soundOn) {
      if (state.overlay.levelUp) playLevelUp();
      else playXpGain();
    }
    prevOverlay.current = state.overlay;
  }, [state.overlay, state.data.player.soundOn]);

  // auto-dismiss toast
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'dismiss-toast' }), 3600);
    return () => clearTimeout(t);
  }, [state.toast]);

  const store = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

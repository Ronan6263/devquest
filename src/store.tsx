import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  LiveSession, OverlayData, PersistedState, Project, Quest, Screen, Task, TaskSize, TaskTag
} from './types';
import { SIZE_XP, levelInfo } from './lib/levels';
import { evaluateAuto, defById } from './lib/achievements';
import { loadState, saveState, loadLiveSession, saveLiveSession } from './lib/db';
import { emptyState } from './lib/seed';
import { syncManager } from './lib/sync';
import { weekKey } from './lib/time';
import { playLevelUp, playXpGain } from './lib/sound';

export interface AppState {
  data: PersistedState;
  screen: Screen;
  session: LiveSession | null;
  overlay: OverlayData | null;
  toast: string | null;
  hydrated: boolean;
  /** Pre-delete snapshot; non-null while the delete toast offers UNDO. */
  undo: PersistedState | null;
  /** Quest collapse state; missing ids fall back to a status-based default. */
  collapsedQuests: Record<string, boolean>;
}

type Action =
  | { type: 'hydrate'; data: PersistedState; session?: LiveSession | null }
  | { type: 'go'; screen: Screen }
  | { type: 'start-session'; taskId?: string }
  | { type: 'toggle-check'; taskId: string }
  | { type: 'end-session'; now: number }
  | { type: 'continue-overlay' }
  | { type: 'log-proof'; achievementId: string; proof: string; now: number }
  | { type: 'add-task'; questId: string; title: string; size: TaskSize; tag: TaskTag }
  | { type: 'reorder-task'; taskId: string; toIndex: number }
  | { type: 'set-task-description'; taskId: string; description: string }
  | { type: 'delete-task'; taskId: string }
  | { type: 'edit-task'; taskId: string; title: string; size: TaskSize; tag: TaskTag }
  | { type: 'edit-project'; projectId: string; name: string; color: string; description: string; icon: string }
  | { type: 'edit-quest'; questId: string; title: string; dod: string; projectId?: string }
  | { type: 'add-project'; name: string; color: string; description: string; icon: string }
  | { type: 'toggle-project'; projectId: string }
  | { type: 'delete-project'; projectId: string }
  | { type: 'add-quest'; projectId: string; title: string; dod: string }
  | { type: 'toggle-quest'; questId: string }
  | { type: 'delete-quest'; questId: string }
  | { type: 'toggle-sound' }
  | { type: 'set-theme'; theme: string }
  | { type: 'set-handle'; handle: string }
  | { type: 'import'; data: PersistedState }
  | { type: 'reset' }
  | { type: 'sync-adopt'; data: PersistedState }
  | { type: 'undo-delete' }
  | { type: 'toggle-quest-collapse'; questId: string; collapsed: boolean }
  | { type: 'toast'; message: string }
  | { type: 'dismiss-toast' };

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Scarcity is a feature: 2 active projects, a 3rd slot at level 5 (design doc §4.6). */
export function activeProjectCap(data: PersistedState): number {
  return levelInfo(data.player.xp).level >= 5 ? 3 : 2;
}

const activeProjects = (data: PersistedState) => data.projects.filter((p) => p.status === 'active');
const activeQuestOf = (data: PersistedState, projectId: string) =>
  data.quests.find((q) => q.projectId === projectId && q.status === 'active');

/** Effective ordering position: manual override first, creation time otherwise. */
export const taskOrder = (t: Task) => t.sortKey ?? t.createdAt;

/**
 * Next-ignition queue: first todo task, active quests first (in creation
 * order), tasks in queue order within a quest. Pre-loaded before the
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
    .sort((a, b) => (questRank.get(a.questId)! - questRank.get(b.questId)!) || taskOrder(a) - taskOrder(b));
  return todo[0] ?? null;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate': {
      // A live session only survives if its task still exists and is still todo
      const task = action.session && action.data.tasks.find((t) => t.id === action.session!.taskId);
      const session = task && task.status === 'todo' ? action.session! : null;
      return {
        ...state, data: action.data, hydrated: true, session,
        screen: session ? 'session' : state.screen,
        toast: session ? 'Session resumed — the clock never stopped.' : state.toast
      };
    }

    case 'go':
      return { ...state, screen: action.screen };

    case 'start-session': {
      const task = action.taskId
        ? state.data.tasks.find((t) => t.id === action.taskId && t.status === 'todo') ?? null
        : nextQueuedTask(state.data);
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

    case 'reorder-task': {
      const task = state.data.tasks.find((t) => t.id === action.taskId);
      if (!task) return state;
      const siblings = state.data.tasks
        .filter((t) => t.questId === task.questId)
        .sort((a, b) => taskOrder(a) - taskOrder(b));
      const from = siblings.findIndex((t) => t.id === task.id);
      const to = Math.max(0, Math.min(siblings.length - 1, action.toIndex));
      if (from === to) return state;
      // land between the new neighbors: midpoint keys keep every other task untouched
      const without = siblings.filter((t) => t.id !== task.id);
      const prev = without[to - 1];
      const next = without[to];
      const sortKey =
        prev && next ? (taskOrder(prev) + taskOrder(next)) / 2
        : prev ? taskOrder(prev) + 1000
        : next ? taskOrder(next) - 1000
        : task.createdAt;
      const tasks = state.data.tasks.map((t) => (t.id === task.id ? { ...t, sortKey } : t));
      return { ...state, data: { ...state.data, tasks } };
    }

    case 'set-task-description': {
      const task = state.data.tasks.find((t) => t.id === action.taskId);
      if (!task) return state;
      if (task.status === 'done') {
        return { ...state, toast: 'Done tasks are history — their notes are locked with them.' };
      }
      const description = action.description.trim().slice(0, 2000) || undefined;
      const tasks = state.data.tasks.map((t) => (t.id === task.id ? { ...t, description } : t));
      return { ...state, data: { ...state.data, tasks } };
    }

    case 'delete-task': {
      const task = state.data.tasks.find((t) => t.id === action.taskId);
      if (!task) return state;
      if (task.status === 'done') {
        return { ...state, toast: 'Done tasks are history — their XP is banked. Only todo tasks can be removed.' };
      }
      return {
        ...state,
        undo: state.data,
        toast: `Task "${task.title}" deleted.`,
        data: {
          ...state.data,
          tasks: state.data.tasks.filter((t) => t.id !== action.taskId),
          deletedIds: [...(state.data.deletedIds ?? []), task.id]
        }
      };
    }

    case 'edit-task': {
      const task = state.data.tasks.find((t) => t.id === action.taskId);
      if (!task) return state;
      if (task.status === 'done') {
        return { ...state, toast: 'Done tasks are history — their XP is banked and can’t be re-sized.' };
      }
      const title = action.title.trim().slice(0, 80);
      if (!title) return state;
      const tasks = state.data.tasks.map((t) =>
        t.id === task.id ? { ...t, title, size: action.size, tags: [action.tag] } : t
      );
      return { ...state, data: { ...state.data, tasks } };
    }

    case 'edit-project': {
      const p = state.data.projects.find((x) => x.id === action.projectId);
      if (!p) return state;
      const name = action.name.trim().toUpperCase().slice(0, 32);
      if (!name) return state;
      if (state.data.projects.some((x) => x.id !== p.id && x.name === name)) {
        return { ...state, toast: `A project named ${name} already exists.` };
      }
      const projects = state.data.projects.map((x) =>
        x.id === p.id
          ? {
              ...x, name, colorTag: action.color,
              description: action.description.trim().slice(0, 140) || undefined,
              icon: action.icon.trim().slice(0, 4) || undefined
            }
          : x
      );
      return { ...state, data: { ...state.data, projects } };
    }

    case 'edit-quest': {
      const q = state.data.quests.find((x) => x.id === action.questId);
      if (!q) return state;
      const title = action.title.trim().slice(0, 60);
      if (!title) return state;
      let projectId = q.projectId;
      let status = q.status;
      let toast = state.toast;
      if (action.projectId && action.projectId !== q.projectId) {
        const target = state.data.projects.find((p) => p.id === action.projectId);
        if (!target) return state;
        projectId = target.id;
        // moving an active quest still honors the 1-active-quest-per-project rule
        if (q.status === 'active' && target.status === 'parked') {
          status = 'parked';
          toast = `Quest moved to ${target.name} — parked, since that project is parked.`;
        } else if (q.status === 'active' && activeQuestOf(state.data, target.id)) {
          status = 'parked';
          toast = `Quest moved to ${target.name} — parked (1 active quest per project).`;
        } else {
          toast = `Quest moved to ${target.name}.`;
        }
      }
      const quests = state.data.quests.map((x) =>
        x.id === q.id
          ? { ...x, title, definitionOfDone: action.dod.trim().slice(0, 200) || '—', projectId, status }
          : x
      );
      return { ...state, data: { ...state.data, quests }, toast };
    }

    case 'add-project': {
      const name = action.name.trim().toUpperCase().slice(0, 32);
      if (!name) return state;
      if (state.data.projects.some((p) => p.name === name)) {
        return { ...state, toast: `A project named ${name} already exists.` };
      }
      const cap = activeProjectCap(state.data);
      const hasSlot = activeProjects(state.data).length < cap;
      const project: Project = {
        id: uid(), name, colorTag: action.color, status: hasSlot ? 'active' : 'parked', createdAt: Date.now(),
        description: action.description.trim().slice(0, 140) || undefined,
        icon: action.icon.trim().slice(0, 4) || undefined
      };
      return {
        ...state,
        data: { ...state.data, projects: [...state.data.projects, project] },
        toast: hasSlot
          ? `Project ${name} created.`
          : `Project ${name} created PARKED — all ${cap} active slots are in use. Scarcity is a feature.`
      };
    }

    case 'toggle-project': {
      const p = state.data.projects.find((x) => x.id === action.projectId);
      if (!p) return state;
      if (p.status === 'parked') {
        const cap = activeProjectCap(state.data);
        if (activeProjects(state.data).length >= cap) {
          const hint = cap === 2 ? ' Level 5 unlocks a third slot.' : '';
          return { ...state, toast: `Max ${cap} active projects — park one first.${hint}` };
        }
      }
      const projects = state.data.projects.map((x) =>
        x.id === p.id ? { ...x, status: p.status === 'active' ? ('parked' as const) : ('active' as const) } : x
      );
      return { ...state, data: { ...state.data, projects } };
    }

    case 'delete-project': {
      const p = state.data.projects.find((x) => x.id === action.projectId);
      if (!p) return state;
      const questIds = state.data.quests.filter((q) => q.projectId === p.id).map((q) => q.id);
      const removedTaskIds = state.data.tasks.filter((t) => questIds.includes(t.questId)).map((t) => t.id);
      return {
        ...state,
        undo: state.data,
        data: {
          ...state.data,
          projects: state.data.projects.filter((x) => x.id !== p.id),
          quests: state.data.quests.filter((q) => q.projectId !== p.id),
          tasks: state.data.tasks.filter((t) => !questIds.includes(t.questId)),
          deletedIds: [...(state.data.deletedIds ?? []), p.id, ...questIds, ...removedTaskIds]
        },
        toast: `Project ${p.name} deleted. Your level and XP are untouched — projects die, the player's level doesn't.`
      };
    }

    case 'add-quest': {
      const title = action.title.trim().slice(0, 60);
      if (!title) return state;
      const project = state.data.projects.find((p) => p.id === action.projectId);
      if (!project) return state;
      const slotTaken = !!activeQuestOf(state.data, project.id);
      const quest: Quest = {
        id: uid(), projectId: project.id, title,
        definitionOfDone: action.dod.trim().slice(0, 200) || '—',
        status: slotTaken || project.status === 'parked' ? 'parked' : 'active',
        createdAt: Date.now()
      };
      return {
        ...state,
        data: { ...state.data, quests: [...state.data.quests, quest] },
        toast: quest.status === 'parked'
          ? slotTaken
            ? `Quest parked — ${project.name} already has an active quest (1 per project).`
            : `Quest parked — ${project.name} is a parked project.`
          : `Quest "${title}" is live.`
      };
    }

    case 'toggle-quest': {
      const q = state.data.quests.find((x) => x.id === action.questId);
      if (!q || q.status === 'done') return state;
      if (q.status === 'parked') {
        const project = state.data.projects.find((p) => p.id === q.projectId);
        if (!project || project.status === 'parked') {
          return { ...state, toast: 'Activate the project first — this quest belongs to a parked project.' };
        }
        const current = activeQuestOf(state.data, q.projectId);
        if (current) {
          return { ...state, toast: `1 active quest per project — park "${current.title}" first.` };
        }
      }
      const quests = state.data.quests.map((x) =>
        x.id === q.id ? { ...x, status: q.status === 'active' ? ('parked' as const) : ('active' as const) } : x
      );
      return { ...state, data: { ...state.data, quests } };
    }

    case 'delete-quest': {
      const q = state.data.quests.find((x) => x.id === action.questId);
      if (!q) return state;
      const removedTaskIds = state.data.tasks.filter((t) => t.questId === q.id).map((t) => t.id);
      return {
        ...state,
        undo: state.data,
        data: {
          ...state.data,
          quests: state.data.quests.filter((x) => x.id !== q.id),
          tasks: state.data.tasks.filter((t) => t.questId !== q.id),
          deletedIds: [...(state.data.deletedIds ?? []), q.id, ...removedTaskIds]
        },
        toast: `Quest "${q.title}" deleted. Banked XP stays banked.`
      };
    }

    case 'toggle-sound':
      return {
        ...state,
        data: { ...state.data, player: { ...state.data.player, soundOn: !state.data.player.soundOn } }
      };

    case 'set-theme':
      return {
        ...state,
        data: { ...state.data, player: { ...state.data.player, theme: action.theme } }
      };

    case 'set-handle': {
      const handle = action.handle.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 20) || 'SOLO_DEV';
      return { ...state, data: { ...state.data, player: { ...state.data.player, handle } } };
    }

    case 'import':
      // resetAt makes an import authoritative: it wins a sync merge wholesale
      return {
        ...state,
        data: { ...action.data, resetAt: Date.now() },
        toast: 'Import complete — state replaced.'
      };

    case 'reset':
      return {
        ...state,
        data: { ...emptyState(), resetAt: Date.now() },
        session: null,
        overlay: null,
        screen: 'home',
        toast: 'Fresh start — everything wiped. Blank slate.'
      };

    case 'sync-adopt':
      return { ...state, data: action.data };

    case 'undo-delete':
      if (!state.undo) return state;
      return { ...state, data: state.undo, undo: null, toast: 'Restored — nothing was lost.' };

    case 'toggle-quest-collapse':
      return {
        ...state,
        collapsedQuests: { ...state.collapsedQuests, [action.questId]: action.collapsed }
      };

    case 'toast':
      return { ...state, toast: action.message };

    case 'dismiss-toast':
      return { ...state, toast: null, undo: null };

    default:
      return state;
  }
}

/**
 * The UNDO offer only survives until the next data mutation — restoring an
 * old snapshot after unrelated edits would silently revert them.
 */
export function rootReducer(state: AppState, action: Action): AppState {
  const next = reducer(state, action);
  const keepsUndo =
    action.type === 'undo-delete' ||
    action.type === 'delete-task' || action.type === 'delete-quest' || action.type === 'delete-project' ||
    next.data === state.data;
  return keepsUndo || !next.undo ? next : { ...next, undo: null };
}

interface Store {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(rootReducer, undefined, () => ({
    data: emptyState(),
    screen: 'home' as Screen,
    session: null,
    overlay: null,
    toast: null,
    hydrated: false,
    undo: null,
    collapsedQuests: {}
  }));

  // hydrate from IndexedDB once (resuming any in-flight session), then bring the sync engine up
  const dataRef = useRef(state.data);
  dataRef.current = state.data;
  const adoptingRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stored, live] = await Promise.all([loadState(), loadLiveSession()]);
      if (cancelled) return;
      adoptingRef.current = true; // hydration is not a local mutation — don't mark sync dirty
      dispatch({ type: 'hydrate', data: stored ?? emptyState(), session: live });
      syncManager.init(
        () => dataRef.current,
        (data) => {
          adoptingRef.current = true;
          dispatch({ type: 'sync-adopt', data });
        },
        (message) => dispatch({ type: 'toast', message })
      );
    })();
    return () => { cancelled = true; };
  }, []);

  // persist on every data mutation (after hydration); adopted remote states don't re-trigger a push
  const lastData = useRef<PersistedState | null>(null);
  useEffect(() => {
    if (!state.hydrated) return;
    if (lastData.current === state.data) return;
    lastData.current = state.data;
    saveState(state.data);
    if (adoptingRef.current) {
      adoptingRef.current = false;
    } else {
      syncManager.localChanged();
    }
  }, [state.hydrated, state.data]);

  // persist the live session so a killed PWA can resume mid-session
  const lastSession = useRef<LiveSession | null>(null);
  useEffect(() => {
    if (!state.hydrated) return;
    if (lastSession.current === state.session) return;
    lastSession.current = state.session;
    saveLiveSession(state.session);
  }, [state.hydrated, state.session]);

  // reward-moment sound
  const prevOverlay = useRef<OverlayData | null>(null);
  useEffect(() => {
    if (state.overlay && !prevOverlay.current && state.data.player.soundOn) {
      if (state.overlay.levelUp) playLevelUp();
      else playXpGain();
    }
    prevOverlay.current = state.overlay;
  }, [state.overlay, state.data.player.soundOn]);

  // auto-dismiss toast (undo-able toasts linger a little longer)
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'dismiss-toast' }), state.undo ? 6000 : 3600);
    return () => clearTimeout(t);
  }, [state.toast, state.undo]);

  const store = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

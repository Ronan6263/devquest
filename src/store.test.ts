import { describe, expect, it } from 'vitest';
import { reducer, rootReducer, nextQueuedTask, taskOrder, type AppState } from './store';
import { emptyState } from './lib/seed';
import { SIZE_XP } from './lib/levels';
import type { PersistedState, Project, Quest, Task } from './types';

const base = (data?: Partial<PersistedState>): AppState => ({
  data: { ...emptyState(), ...data },
  screen: 'home',
  session: null,
  overlay: null,
  toast: null,
  hydrated: true,
  undo: null,
  collapsedQuests: {}
});

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', name: 'PROJ', colorTag: '#fff', status: 'active', createdAt: 1, ...over
});
const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'q1', projectId: 'p1', title: 'Quest', definitionOfDone: '—', status: 'active', createdAt: 1, ...over
});
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', questId: 'q1', title: 'Task', size: 'S', tags: ['systems'], status: 'todo', createdAt: 1, ...over
});

describe('add-project', () => {
  it('creates active while slots are free, parked once the cap is hit', () => {
    let s = base();
    s = reducer(s, { type: 'add-project', name: 'one', color: '#111' });
    s = reducer(s, { type: 'add-project', name: 'two', color: '#222' });
    s = reducer(s, { type: 'add-project', name: 'three', color: '#333' });
    expect(s.data.projects.map((p) => p.status)).toEqual(['active', 'active', 'parked']);
  });

  it('rejects duplicate names', () => {
    let s = base();
    s = reducer(s, { type: 'add-project', name: 'same', color: '#111' });
    s = reducer(s, { type: 'add-project', name: 'SAME', color: '#222' });
    expect(s.data.projects).toHaveLength(1);
  });
});

describe('add-quest', () => {
  it('parks a second quest on the same project (1 active per project)', () => {
    let s = base({ projects: [project()] });
    s = reducer(s, { type: 'add-quest', projectId: 'p1', title: 'A', dod: '' });
    s = reducer(s, { type: 'add-quest', projectId: 'p1', title: 'B', dod: '' });
    expect(s.data.quests.map((q) => q.status)).toEqual(['active', 'parked']);
  });
});

describe('sessions', () => {
  const populated = () => base({ projects: [project()], quests: [quest()], tasks: [task()] });

  it('start-session picks the queued task by default', () => {
    const s = reducer(populated(), { type: 'start-session' });
    expect(s.session?.taskId).toBe('t1');
    expect(s.screen).toBe('session');
  });

  it('start-session honors an explicit taskId', () => {
    const st = populated();
    st.data.tasks.push(task({ id: 't2', createdAt: 2 }));
    const s = reducer(st, { type: 'start-session', taskId: 't2' });
    expect(s.session?.taskId).toBe('t2');
  });

  it('refuses to start on a done task', () => {
    const st = populated();
    st.data.tasks[0].status = 'done';
    const s = reducer(st, { type: 'start-session', taskId: 't1' });
    expect(s.session).toBeNull();
  });

  it('the 90-second rule: nothing is logged for a short session', () => {
    let s = reducer(populated(), { type: 'start-session' });
    s = reducer(s, { type: 'end-session', now: s.session!.startedAt + 30_000 });
    expect(s.data.sessions).toHaveLength(0);
    expect(s.session).toBeNull();
  });

  it('a checked task banks XP and completes the quest with a 50% bonus', () => {
    let s = reducer(populated(), { type: 'start-session' });
    s = reducer(s, { type: 'toggle-check', taskId: 't1' });
    s = reducer(s, { type: 'end-session', now: s.session!.startedAt + 120_000 });
    expect(s.data.tasks[0].status).toBe('done');
    expect(s.data.quests[0].status).toBe('done');
    const taskXp = SIZE_XP.S;
    expect(s.overlay?.earned).toBe(taskXp + Math.round(taskXp * 0.5));
    // XP lands on continue, not before
    expect(s.data.player.xp).toBe(0);
    s = reducer(s, { type: 'continue-overlay' });
    expect(s.data.player.xp).toBe(taskXp + Math.round(taskXp * 0.5));
  });

  it('hydrate resumes a live session only when its task is still todo', () => {
    const live = { id: 's1', taskId: 't1', startedAt: 123, checked: {} };
    const good = reducer(base(), { type: 'hydrate', data: populated().data, session: live });
    expect(good.session).toEqual(live);
    expect(good.screen).toBe('session');

    const doneData = populated().data;
    doneData.tasks[0].status = 'done';
    const dropped = reducer(base(), { type: 'hydrate', data: doneData, session: live });
    expect(dropped.session).toBeNull();
  });
});

describe('delete + undo', () => {
  it('delete-task snapshots for undo and writes a tombstone', () => {
    const st = base({ projects: [project()], quests: [quest()], tasks: [task()] });
    let s = rootReducer(st, { type: 'delete-task', taskId: 't1' });
    expect(s.data.tasks).toHaveLength(0);
    expect(s.data.deletedIds).toContain('t1');
    expect(s.undo).not.toBeNull();
    s = rootReducer(s, { type: 'undo-delete' });
    expect(s.data.tasks).toHaveLength(1);
    expect(s.data.deletedIds ?? []).not.toContain('t1');
  });

  it('a later mutation forfeits the undo snapshot', () => {
    const st = base({ projects: [project()], quests: [quest()], tasks: [task()] });
    let s = rootReducer(st, { type: 'delete-task', taskId: 't1' });
    s = rootReducer(s, { type: 'add-task', questId: 'q1', title: 'new', size: 'S', tag: 'art' });
    expect(s.undo).toBeNull();
    expect(rootReducer(s, { type: 'undo-delete' }).data).toBe(s.data);
  });

  it('delete-project removes its quests and tasks and tombstones them all', () => {
    const st = base({ projects: [project()], quests: [quest()], tasks: [task()] });
    const s = rootReducer(st, { type: 'delete-project', projectId: 'p1' });
    expect(s.data.projects).toHaveLength(0);
    expect(s.data.quests).toHaveLength(0);
    expect(s.data.tasks).toHaveLength(0);
    expect(s.data.deletedIds).toEqual(expect.arrayContaining(['p1', 'q1', 't1']));
  });
});

describe('move-task', () => {
  it('swaps queue order with the neighbor and clamps at the edges', () => {
    const st = base({
      projects: [project()], quests: [quest()],
      tasks: [task({ id: 'a', createdAt: 1 }), task({ id: 'b', createdAt: 2 })]
    });
    const order = (s: AppState) =>
      [...s.data.tasks].sort((x, y) => taskOrder(x) - taskOrder(y)).map((t) => t.id);

    let s = reducer(st, { type: 'move-task', taskId: 'b', dir: -1 });
    expect(order(s)).toEqual(['b', 'a']);
    expect(nextQueuedTask(s.data)?.id).toBe('b');
    // already first: no-op
    expect(order(reducer(s, { type: 'move-task', taskId: 'b', dir: -1 }))).toEqual(['b', 'a']);
  });
});

describe('reset', () => {
  it('wipes to a blank slate and stamps resetAt', () => {
    const st = base({ projects: [project()], quests: [quest()], tasks: [task()] });
    st.data.player.xp = 500;
    const s = reducer(st, { type: 'reset' });
    expect(s.data.projects).toHaveLength(0);
    expect(s.data.tasks).toHaveLength(0);
    expect(s.data.player.xp).toBe(0);
    expect(s.data.resetAt).toBeGreaterThan(0);
  });
});

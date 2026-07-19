import { describe, expect, it } from 'vitest';
import { reducer, rootReducer, nextQueuedTask, taskOrder, type AppState } from './store';
import { emptyState } from './lib/seed';
import { parseBulkTasks } from './lib/bulk';
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
    s = reducer(s, { type: 'add-project', name: 'one', color: '#111', description: '', icon: '' });
    s = reducer(s, { type: 'add-project', name: 'two', color: '#222', description: '', icon: '' });
    s = reducer(s, { type: 'add-project', name: 'three', color: '#333', description: '', icon: '' });
    expect(s.data.projects.map((p) => p.status)).toEqual(['active', 'active', 'parked']);
  });

  it('rejects duplicate names', () => {
    let s = base();
    s = reducer(s, { type: 'add-project', name: 'same', color: '#111', description: '', icon: '' });
    s = reducer(s, { type: 'add-project', name: 'SAME', color: '#222', description: '', icon: '' });
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

  it('rolling never crosses into another project, but does cross into the same project\'s next quest', () => {
    const st = base({
      projects: [project(), project({ id: 'p2', name: 'OTHER' })],
      quests: [
        quest(), // p1 active
        quest({ id: 'q-parked', projectId: 'p1', title: 'Parked quest', status: 'parked', createdAt: 2 }),
        quest({ id: 'q-p2', projectId: 'p2', title: 'Other project quest', createdAt: 0 })
      ],
      tasks: [
        task(), // q1
        task({ id: 't-parked', questId: 'q-parked', title: 'Parked quest task', createdAt: 2 }),
        task({ id: 't-p2', questId: 'q-p2', title: 'Other project task', createdAt: 0 })
      ]
    });
    let s = reducer(st, { type: 'start-session', taskId: 't1' });
    s = reducer(s, { type: 'toggle-check', taskId: 't1' });
    // p2's task was created earlier and its quest is active — but it's another project
    expect(s.session?.taskId).toBe('t-parked');
    s = reducer(s, { type: 'toggle-check', taskId: 't-parked' });
    // p1 exhausted: the roll stops rather than jumping projects
    expect(s.session?.taskId).toBe('t-parked');
  });

  it('a parked quest finished by a rolling session goes done and pays its bonus', () => {
    const st = base({
      projects: [project()],
      quests: [quest(), quest({ id: 'q2', projectId: 'p1', title: 'Second quest', status: 'parked', createdAt: 2 })],
      tasks: [task(), task({ id: 't2', questId: 'q2', createdAt: 2 })]
    });
    let s = reducer(st, { type: 'start-session' });
    s = reducer(s, { type: 'toggle-check', taskId: 't1' });
    expect(s.session?.taskId).toBe('t2'); // rolled into the parked quest
    s = reducer(s, { type: 'toggle-check', taskId: 't2' });
    s = reducer(s, { type: 'end-session', now: s.session!.startedAt + 120_000 });
    expect(s.data.quests.every((q) => q.status === 'done')).toBe(true);
    const perQuestBonus = Math.round(SIZE_XP.S * 0.5);
    expect(s.overlay?.earned).toBe(SIZE_XP.S * 2 + perQuestBonus * 2);
  });

  it('an untouched parked quest with pre-done tasks gets no retroactive completion', () => {
    const st = base({
      projects: [project()],
      quests: [quest(), quest({ id: 'q2', projectId: 'p1', status: 'parked', createdAt: 2 })],
      tasks: [
        task(),
        task({ id: 't2', questId: 'q2', status: 'done', completedAt: 1, createdAt: 2 })
      ]
    });
    let s = reducer(st, { type: 'start-session' });
    s = reducer(s, { type: 'toggle-check', taskId: 't1' });
    s = reducer(s, { type: 'end-session', now: s.session!.startedAt + 120_000 });
    expect(s.data.quests.find((q) => q.id === 'q2')?.status).toBe('parked');
  });

  it('checking the current task auto-pulls the next queued task into the session', () => {
    const st = populated();
    st.data.tasks.push(task({ id: 't2', title: 'Second', createdAt: 2 }), task({ id: 't3', title: 'Third', createdAt: 3 }));
    let s = reducer(st, { type: 'start-session' });
    expect(s.session?.taskId).toBe('t1');
    s = reducer(s, { type: 'toggle-check', taskId: 't1' });
    expect(s.session?.taskId).toBe('t2');
    expect(s.toast).toContain('Second');
    s = reducer(s, { type: 'toggle-check', taskId: 't2' });
    expect(s.session?.taskId).toBe('t3');
    // queue exhausted: current stays put
    s = reducer(s, { type: 'toggle-check', taskId: 't3' });
    expect(s.session?.taskId).toBe('t3');
    // un-checking an earlier task doesn't yank the current one away
    s = reducer(s, { type: 'toggle-check', taskId: 't1' });
    expect(s.session?.taskId).toBe('t3');
  });

  it('ending a rolling session banks every checked task', () => {
    const st = populated();
    st.data.tasks.push(task({ id: 't2', title: 'Second', size: 'M', createdAt: 2 }));
    let s = reducer(st, { type: 'start-session' });
    s = reducer(s, { type: 'toggle-check', taskId: 't1' });
    s = reducer(s, { type: 'toggle-check', taskId: 't2' });
    s = reducer(s, { type: 'end-session', now: s.session!.startedAt + 120_000 });
    expect(s.data.tasks.every((t) => t.status === 'done')).toBe(true);
    const taskXp = SIZE_XP.S + SIZE_XP.M;
    expect(s.overlay?.earned).toBe(taskXp + Math.round(taskXp * 0.5)); // + quest-complete bonus
    expect(s.overlay?.lines.filter((l) => !l.title.startsWith('QUEST'))).toHaveLength(2);
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

describe('reorder-task', () => {
  const three = () => base({
    projects: [project()], quests: [quest()],
    tasks: [task({ id: 'a', createdAt: 1 }), task({ id: 'b', createdAt: 2 }), task({ id: 'c', createdAt: 3 })]
  });
  const order = (s: AppState) =>
    [...s.data.tasks].sort((x, y) => taskOrder(x) - taskOrder(y)).map((t) => t.id);

  it('drops a task at the target index, only touching the moved task', () => {
    const s = reducer(three(), { type: 'reorder-task', taskId: 'c', toIndex: 0 });
    expect(order(s)).toEqual(['c', 'a', 'b']);
    expect(nextQueuedTask(s.data)?.id).toBe('c');
    expect(s.data.tasks.filter((t) => t.sortKey !== undefined)).toHaveLength(1);
  });

  it('places between neighbors and clamps out-of-range targets', () => {
    let s = reducer(three(), { type: 'reorder-task', taskId: 'a', toIndex: 1 });
    expect(order(s)).toEqual(['b', 'a', 'c']);
    s = reducer(s, { type: 'reorder-task', taskId: 'b', toIndex: 99 });
    expect(order(s)).toEqual(['a', 'c', 'b']);
    // same position: no-op
    expect(reducer(s, { type: 'reorder-task', taskId: 'b', toIndex: 2 }).data).toBe(s.data);
  });
});

describe('bulk add', () => {
  it('parses 3-field and 4-field lines, case-insensitively, skipping blanks', () => {
    const { tasks, errors } = parseBulkTasks(
      'Blockout casing | s | ART\n' +
      '\n' +
      'Wire the read | Fires TriggerID on fix | m | Systems\n'
    );
    expect(errors).toEqual([]);
    expect(tasks).toEqual([
      { title: 'Blockout casing', description: undefined, size: 'S', tag: 'art' },
      { title: 'Wire the read', description: 'Fires TriggerID on fix', size: 'M', tag: 'systems' }
    ]);
  });

  it('keeps extra pipes inside the descriptor', () => {
    const { tasks, errors } = parseBulkTasks('Task | step 1 | step 2 | L | design');
    expect(errors).toEqual([]);
    expect(tasks[0].description).toBe('step 1 | step 2');
    expect(tasks[0].size).toBe('L');
  });

  it('reports bad size, bad category, and short lines with line numbers', () => {
    const { tasks, errors } = parseBulkTasks('Good | S | biz\nBad size | X | art\nBad tag | M | cooking\nJust a title');
    expect(tasks).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it('bulk-add-tasks preserves pasted order in the queue', () => {
    const st = base({ projects: [project()], quests: [quest()] });
    const { tasks } = parseBulkTasks('First | S | art\nSecond | why it matters | M | systems\nThird | L | biz');
    const s = reducer(st, { type: 'bulk-add-tasks', questId: 'q1', tasks });
    const order = [...s.data.tasks].sort((a, b) => taskOrder(a) - taskOrder(b)).map((t) => t.title);
    expect(order).toEqual(['First', 'Second', 'Third']);
    expect(s.data.tasks.find((t) => t.title === 'Second')?.description).toBe('why it matters');
    expect(s.toast).toContain('3 tasks');
  });
});

describe('set-task-description', () => {
  it('saves trimmed notes and clears them when emptied', () => {
    const st = base({ projects: [project()], quests: [quest()], tasks: [task()] });
    let s = reducer(st, { type: 'set-task-description', taskId: 't1', description: '  step 1\nstep 2  ' });
    expect(s.data.tasks[0].description).toBe('step 1\nstep 2');
    s = reducer(s, { type: 'set-task-description', taskId: 't1', description: '   ' });
    expect(s.data.tasks[0].description).toBeUndefined();
  });

  it('refuses to touch notes on a done task', () => {
    const st = base({ projects: [project()], quests: [quest()], tasks: [task({ status: 'done', description: 'kept' })] });
    const s = reducer(st, { type: 'set-task-description', taskId: 't1', description: 'overwrite' });
    expect(s.data.tasks[0].description).toBe('kept');
  });
});

describe('reorder-quest', () => {
  it('reorders parked quests and the session roll follows the new order', () => {
    const st = base({
      projects: [project()],
      quests: [
        quest(), // active
        quest({ id: 'qA', title: 'Parked A', status: 'parked', createdAt: 2 }),
        quest({ id: 'qB', title: 'Parked B', status: 'parked', createdAt: 3 })
      ],
      tasks: [
        task(),
        task({ id: 'tA', questId: 'qA', createdAt: 2 }),
        task({ id: 'tB', questId: 'qB', createdAt: 3 })
      ]
    });
    // drag Parked B above Parked A
    let s = reducer(st, { type: 'reorder-quest', questId: 'qB', toIndex: 0 });
    expect(s.data.quests.filter((q) => q.sortKey !== undefined)).toHaveLength(1); // only qB touched
    // rolling out of the active quest now hits B first
    s = reducer(s, { type: 'start-session' });
    s = reducer(s, { type: 'toggle-check', taskId: 't1' });
    expect(s.session?.taskId).toBe('tB');
    s = reducer(s, { type: 'toggle-check', taskId: 'tB' });
    expect(s.session?.taskId).toBe('tA');
  });

  it('stays within the status group and clamps out-of-range targets', () => {
    const st = base({
      projects: [project()],
      quests: [
        quest(), // active — alone in its group
        quest({ id: 'qA', status: 'parked', createdAt: 2 }),
        quest({ id: 'qB', status: 'parked', createdAt: 3 })
      ]
    });
    // active quest has no siblings: no-op
    expect(reducer(st, { type: 'reorder-quest', questId: 'q1', toIndex: 5 }).data).toBe(st.data);
    // clamped move inside the parked group
    const s = reducer(st, { type: 'reorder-quest', questId: 'qA', toIndex: 99 });
    const parked = s.data.quests
      .filter((q) => q.status === 'parked')
      .sort((a, b) => (a.sortKey ?? a.createdAt) - (b.sortKey ?? b.createdAt))
      .map((q) => q.id);
    expect(parked).toEqual(['qB', 'qA']);
  });
});

describe('edit-quest project move', () => {
  it('moves a quest to another project, parking it if that project already has an active quest', () => {
    const st = base({
      projects: [project(), project({ id: 'p2', name: 'OTHER' })],
      quests: [quest(), quest({ id: 'q2', projectId: 'p2', title: 'Other quest' })]
    });
    const s = reducer(st, { type: 'edit-quest', questId: 'q1', title: 'Quest', dod: '—', projectId: 'p2' });
    const moved = s.data.quests.find((q) => q.id === 'q1')!;
    expect(moved.projectId).toBe('p2');
    expect(moved.status).toBe('parked'); // p2 already has an active quest
  });

  it('keeps the quest active when the target project has a free quest slot', () => {
    const st = base({
      projects: [project(), project({ id: 'p2', name: 'OTHER' })],
      quests: [quest()]
    });
    const s = reducer(st, { type: 'edit-quest', questId: 'q1', title: 'Quest', dod: '—', projectId: 'p2' });
    const moved = s.data.quests.find((q) => q.id === 'q1')!;
    expect(moved.projectId).toBe('p2');
    expect(moved.status).toBe('active');
  });

  it('parks an active quest moved into a parked project', () => {
    const st = base({
      projects: [project(), project({ id: 'p2', name: 'OTHER', status: 'parked' })],
      quests: [quest()]
    });
    const s = reducer(st, { type: 'edit-quest', questId: 'q1', title: 'Quest', dod: '—', projectId: 'p2' });
    expect(s.data.quests[0].status).toBe('parked');
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

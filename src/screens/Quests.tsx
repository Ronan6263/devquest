import { useEffect, useState } from 'react';
import { useStore, activeProjectCap } from '../store';
import { SIZE_XP, TAG_COLORS } from '../lib/levels';
import { TagBadge, taskTag, label } from '../components/bits';
import type { Project, Quest, Task, TaskSize, TaskTag } from '../types';

const TAGS: TaskTag[] = ['systems', 'art', 'design', 'polish', 'biz'];
const SIZES: TaskSize[] = ['S', 'M', 'L'];
const PROJECT_COLORS = ['#D4622B', '#7FB069', '#5B8AC7', '#C77DB5', '#D4A72B', '#FF7A3D', '#4d9fff', '#25f07a', '#B0A59A'];

/** Arm-then-confirm for destructive taps; disarms itself after 4s. */
function useArmed(): [boolean, () => boolean] {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const fire = () => {
    if (!armed) {
      setArmed(true);
      return false;
    }
    setArmed(false);
    return true;
  };
  return [armed, fire];
}

function DeleteButton({ armed, onTap, thing }: { armed: boolean; onTap: () => void; thing: string }) {
  return (
    <button
      onClick={onTap}
      title={`delete ${thing}`}
      style={{
        border: `1px solid ${armed ? 'var(--accent)' : 'var(--border-light)'}`,
        background: armed ? 'rgba(212,98,43,.15)' : 'transparent',
        color: armed ? 'var(--accent)' : 'var(--text-dim2)',
        fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
        padding: '4px 9px', borderRadius: 3, cursor: 'pointer', flex: 'none'
      }}
    >
      {armed ? 'SURE? ✕' : '✕'}
    </button>
  );
}

function EditButton({ onClick, thing }: { onClick: () => void; thing: string }) {
  return (
    <button
      onClick={onClick}
      title={`edit ${thing}`}
      style={{
        border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-dim2)',
        fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 3, cursor: 'pointer', flex: 'none'
      }}
    >
      ✎
    </button>
  );
}

function SmallToggle({ active, onClick, labels }: { active: boolean; onClick: () => void; labels: [string, string] }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: '1px solid var(--border-light)', background: 'transparent',
        color: active ? 'var(--text-dim)' : 'var(--success)',
        fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
        padding: '4px 9px', borderRadius: 3, cursor: 'pointer', flex: 'none'
      }}
    >
      {active ? labels[0] : labels[1]}
    </button>
  );
}

/** Shared task form: 10-second capture for new tasks, same form prefilled for edits. */
function TaskForm({
  initial, submitLabel, onSubmit, onCancel
}: {
  initial?: { title: string; size: TaskSize; tag: TaskTag };
  submitLabel: string;
  onSubmit: (v: { title: string; size: TaskSize; tag: TaskTag }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [size, setSize] = useState<TaskSize>(initial?.size ?? 'S');
  const [tag, setTag] = useState<TaskTag>(initial?.tag ?? 'systems');

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({ title, size, tag });
  };

  return (
    <div style={{ margin: '4px 6px 10px', padding: 10, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        className="dq-input"
        autoFocus
        placeholder="task title — smallest checkable unit"
        value={title}
        maxLength={80}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {SIZES.map((s) => (
          <button
            key={s}
            onClick={() => setSize(s)}
            style={{
              fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 3, cursor: 'pointer',
              border: `1px solid ${size === s ? 'var(--accent)' : 'var(--border-light)'}`,
              background: size === s ? 'rgba(212,98,43,.15)' : 'transparent',
              color: size === s ? 'var(--accent)' : 'var(--text-dim)'
            }}
          >
            {s} · {SIZE_XP[s]}xp
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />
        {TAGS.map((t) => (
          <button
            key={t}
            onClick={() => setTag(t)}
            style={{
              fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 3, cursor: 'pointer',
              border: `1px solid ${tag === t ? TAG_COLORS[t] : 'var(--border-light)'}`,
              background: tag === t ? TAG_COLORS[t] : 'transparent',
              color: tag === t ? '#0d0d0c' : 'var(--text-dim)'
            }}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="dq-btn-solid" style={{ fontSize: 11, padding: '7px 14px' }} onClick={submit}>{submitLabel}</button>
        <button className="dq-btn-ghost muted" onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  );
}

function AddTask({ quest }: { quest: Quest }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          margin: '4px 6px 8px', padding: '8px 10px', background: 'transparent', color: 'var(--text-dim2)',
          border: '1px dashed var(--border-light)', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          letterSpacing: '.1em', textAlign: 'left'
        }}
      >
        + DEFINE NEXT TASK
      </button>
    );
  }
  return (
    <TaskForm
      submitLabel="ADD"
      onCancel={() => setOpen(false)}
      onSubmit={(v) => { dispatch({ type: 'add-task', questId: quest.id, ...v }); setOpen(false); }}
    />
  );
}

function TaskRow({ task }: { task: Task }) {
  const { dispatch } = useStore();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <TaskForm
        initial={{ title: task.title, size: task.size, tag: taskTag(task) }}
        submitLabel="SAVE"
        onCancel={() => setEditing(false)}
        onSubmit={(v) => { dispatch({ type: 'edit-task', taskId: task.id, ...v }); setEditing(false); }}
      />
    );
  }

  const done = task.status === 'done';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px', borderBottom: '1px solid #1e1e1c' }}>
      <span style={{ fontSize: 16, flex: 'none', width: 16, color: done ? 'var(--success)' : 'var(--text-faint)' }}>
        {done ? '◉' : '○'}
      </span>
      <span style={{
        flex: 1, fontSize: 13,
        textDecoration: done ? 'line-through' : 'none',
        color: done ? 'var(--text-dim)' : 'var(--text)'
      }}>
        {task.title}
      </span>
      <TagBadge tag={taskTag(task)} small />
      <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 64, textAlign: 'right', flex: 'none' }}>
        {task.size} · {SIZE_XP[task.size]}xp
      </span>
      {!done && (
        <>
          <button
            onClick={() => setEditing(true)}
            title="edit task"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer', padding: '0 2px', flex: 'none' }}
          >
            ✎
          </button>
          <button
            onClick={() => dispatch({ type: 'delete-task', taskId: task.id })}
            title="remove task"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer', padding: '0 2px', flex: 'none' }}
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}

function NewQuest() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [dod, setDod] = useState('');
  const [projectId, setProjectId] = useState('');
  const projects = state.data.projects;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setProjectId(projects.find((p) => p.status === 'active')?.id ?? projects[0]?.id ?? ''); }}
        style={{
          padding: '12px 14px', background: 'transparent', color: 'var(--text-dim)',
          border: '1px dashed var(--border-light)', borderRadius: 5, cursor: 'pointer', fontSize: 12,
          letterSpacing: '.12em', textAlign: 'left', fontWeight: 700
        }}
      >
        + NEW QUEST — a milestone with a definition of done
      </button>
    );
  }

  const submit = () => {
    if (!title.trim() || !projectId) return;
    dispatch({ type: 'add-quest', projectId, title, dod });
    setTitle(''); setDod(''); setOpen(false);
  };

  return (
    <div className="dq-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'var(--border-light)' }}>
      <div style={{ ...label, letterSpacing: '.16em' }}>NEW QUEST</div>
      {projects.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-dim2)', lineHeight: 1.6 }}>
          Quests live inside projects — create your first one in the PROJECTS card above, then come back here.
        </div>
      ) : (
        <select
          className="dq-input"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          style={{ appearance: 'none' }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.status === 'parked' ? ' (parked)' : ''}
            </option>
          ))}
        </select>
      )}
      <input
        className="dq-input"
        autoFocus
        placeholder='quest title — e.g. "Toaster #2"'
        value={title}
        maxLength={60}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
      />
      <input
        className="dq-input"
        placeholder="definition of done — how you'll know it's finished"
        value={dod}
        maxLength={200}
        onChange={(e) => setDod(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="dq-btn-solid" style={{ fontSize: 11, padding: '7px 14px' }} onClick={submit}>CREATE</button>
        <button className="dq-btn-ghost muted" onClick={() => setOpen(false)}>CANCEL</button>
      </div>
    </div>
  );
}

/** Shared project form for create + edit. */
function ProjectForm({
  initial, submitLabel, onSubmit, onCancel
}: {
  initial?: { name: string; color: string };
  submitLabel: string;
  onSubmit: (v: { name: string; color: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? PROJECT_COLORS[0]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({ name, color });
  };

  return (
    <div style={{ padding: 10, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        className="dq-input"
        autoFocus
        placeholder="project name"
        value={name}
        maxLength={32}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {PROJECT_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            title={c}
            style={{
              width: 22, height: 22, borderRadius: 3, background: c, cursor: 'pointer',
              border: color === c ? '2px solid var(--text)' : '2px solid transparent'
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="dq-btn-solid" style={{ fontSize: 11, padding: '7px 14px' }} onClick={submit}>{submitLabel}</button>
        <button className="dq-btn-ghost muted" onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  );
}

function NewProject() {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '9px 12px', background: 'transparent', color: 'var(--text-dim2)',
          border: '1px dashed var(--border-light)', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          letterSpacing: '.1em', textAlign: 'left'
        }}
      >
        + NEW PROJECT
      </button>
    );
  }
  return (
    <ProjectForm
      submitLabel="CREATE"
      onCancel={() => setOpen(false)}
      onSubmit={(v) => { dispatch({ type: 'add-project', ...v }); setOpen(false); }}
    />
  );
}

function ProjectRow({ project }: { project: Project }) {
  const { state, dispatch } = useStore();
  const [armed, fire] = useArmed();
  const [editing, setEditing] = useState(false);
  const quests = state.data.quests.filter((q) => q.projectId === project.id);
  const taskCount = state.data.tasks.filter((t) => quests.some((q) => q.id === t.questId)).length;

  if (editing) {
    return (
      <div style={{ padding: '6px 0', borderBottom: '1px solid #1e1e1c' }}>
        <ProjectForm
          initial={{ name: project.name, color: project.colorTag }}
          submitLabel="SAVE"
          onCancel={() => setEditing(false)}
          onSubmit={(v) => { dispatch({ type: 'edit-project', projectId: project.id, ...v }); setEditing(false); }}
        />
      </div>
    );
  }

  const parked = project.status === 'parked';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', borderBottom: '1px solid #1e1e1c' }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: project.colorTag, flex: 'none', opacity: parked ? 0.4 : 1 }} />
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.4, overflowWrap: 'anywhere',
        color: parked ? 'var(--text-dim2)' : 'var(--text)'
      }}>
        {project.name}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-faint)', flex: 'none' }}>
        {quests.length}q · {taskCount}t
      </span>
      <EditButton thing={`project ${project.name}`} onClick={() => setEditing(true)} />
      <SmallToggle
        active={project.status === 'active'}
        labels={['PARK', 'ACTIVATE']}
        onClick={() => dispatch({ type: 'toggle-project', projectId: project.id })}
      />
      <DeleteButton
        armed={armed}
        thing={`project ${project.name}`}
        onTap={() => { if (fire()) dispatch({ type: 'delete-project', projectId: project.id }); }}
      />
    </div>
  );
}

function QuestCard({ quest }: { quest: Quest }) {
  const { state, dispatch } = useStore();
  const [armed, fire] = useArmed();
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(quest.status !== 'active');
  const [title, setTitle] = useState(quest.title);
  const [dod, setDod] = useState(quest.definitionOfDone);
  const { data } = state;
  const project = data.projects.find((p) => p.id === quest.projectId);
  const tasks = data.tasks.filter((t) => t.questId === quest.id).sort((a, b) => a.createdAt - b.createdAt);
  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const color = project?.colorTag ?? 'var(--text-dim2)';
  const parked = quest.status === 'parked';

  const saveEdit = () => {
    dispatch({ type: 'edit-quest', questId: quest.id, title, dod });
    setEditing(false);
  };

  return (
    <div className="dq-card" style={{ borderRadius: 6, overflow: 'hidden', opacity: parked ? 0.6 : 1 }}>
      <div style={{ padding: '14px 16px', borderBottom: collapsed ? 'none' : '1px solid var(--border-dim)', borderLeft: `3px solid ${color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'expand quest' : 'collapse quest'}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
              fontSize: 11, letterSpacing: '.14em', color, textAlign: 'left',
              flex: 1, minWidth: 0, lineHeight: 1.5, overflowWrap: 'anywhere'
            }}
          >
            <span style={{ color: 'var(--text-faint)', display: 'inline-block', width: 14 }}>{collapsed ? '▸' : '▾'}</span>
            {project?.name}
            {quest.status === 'done' && <span style={{ color: 'var(--text-faint)' }}> · DONE</span>}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EditButton thing={`quest ${quest.title}`} onClick={() => { setTitle(quest.title); setDod(quest.definitionOfDone); setEditing(!editing); setCollapsed(false); }} />
            {quest.status !== 'done' && (
              <SmallToggle
                active={quest.status === 'active'}
                labels={['PARK', 'ACTIVATE']}
                onClick={() => dispatch({ type: 'toggle-quest', questId: quest.id })}
              />
            )}
            <DeleteButton
              armed={armed}
              thing={`quest ${quest.title}`}
              onTap={() => { if (fire()) dispatch({ type: 'delete-quest', questId: quest.id }); }}
            />
          </div>
        </div>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <input
              className="dq-input"
              autoFocus
              value={title}
              maxLength={60}
              placeholder="quest title"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
            />
            <input
              className="dq-input"
              value={dod}
              maxLength={200}
              placeholder="definition of done"
              onChange={(e) => setDod(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false); }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="dq-btn-solid" style={{ fontSize: 11, padding: '7px 14px' }} onClick={saveEdit}>SAVE</button>
              <button className="dq-btn-ghost muted" onClick={() => setEditing(false)}>CANCEL</button>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{ fontSize: 16, fontWeight: 700, marginTop: 6, cursor: 'pointer' }}
              onClick={() => setCollapsed(!collapsed)}
            >
              {quest.title}
            </div>
            {!collapsed && (
              <div style={{ fontSize: 11, color: 'var(--text-dim2)', marginTop: 6, lineHeight: 1.6 }}>
                DoD: {quest.definitionOfDone}
              </div>
            )}
          </>
        )}
        <div style={{ height: 6, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color }} />
        </div>
      </div>
      {!collapsed && (
        <div style={{ padding: '6px 10px' }}>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
          {quest.status !== 'done' && <AddTask quest={quest} />}
        </div>
      )}
    </div>
  );
}

function SectionDivider({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <span style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--text-faint)' }}>{text}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
    </div>
  );
}

const questRank = (q: Quest) => (q.status === 'active' ? 0 : q.status === 'done' ? 1 : 2);
const QUEST_SECTION: Record<number, string> = { 1: 'COMPLETED', 2: 'PARKED' };

export function Quests() {
  const { state } = useStore();
  const { data } = state;
  const cap = activeProjectCap(data);

  const quests = [...data.quests].sort(
    (a, b) => questRank(a) - questRank(b) || a.createdAt - b.createdAt
  );
  const projects = [...data.projects].sort(
    (a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || a.createdAt - b.createdAt
  );

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '.06em', fontWeight: 800 }}>QUESTS &amp; TASKS</h2>
        <span style={{ fontSize: 11, color: 'var(--text-dim2)' }}>1 quest / project · max {cap} active</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6, marginTop: -8 }}>
        Tasks are checked off in session, not here — define → do, in that order.
      </div>

      <div className="dq-card" style={{ borderRadius: 6, padding: '14px 16px' }}>
        <div style={{ ...label, letterSpacing: '.16em', marginBottom: 4 }}>
          PROJECTS · {data.projects.filter((p) => p.status === 'active').length}/{cap} ACTIVE SLOTS
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.6, marginBottom: 8 }}>
          Scarcity is a feature — it forces focus. {cap === 2 ? 'Level 5 unlocks a third slot.' : 'Third slot unlocked.'}
          {' '}Deleting a project removes its quests and tasks; your XP and level stay.
        </div>
        {projects.map((p) => (
          <ProjectRow key={p.id} project={p} />
        ))}
        <div style={{ marginTop: 10 }}>
          <NewProject />
        </div>
      </div>

      <NewQuest />

      {quests.map((q, i) => {
        const startsSection = questRank(q) > 0 && (i === 0 || questRank(quests[i - 1]) !== questRank(q));
        return (
          <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {startsSection && <SectionDivider text={QUEST_SECTION[questRank(q)]} />}
            <QuestCard quest={q} />
          </div>
        );
      })}
    </div>
  );
}

import { useState } from 'react';
import { useStore } from '../store';
import { SIZE_XP, TAG_COLORS } from '../lib/levels';
import { TagBadge, taskTag } from '../components/bits';
import type { Quest, TaskSize, TaskTag } from '../types';

const TAGS: TaskTag[] = ['systems', 'art', 'design', 'polish', 'biz'];
const SIZES: TaskSize[] = ['S', 'M', 'L'];

/** 10-second task capture: title + one of three size buttons + a tag. Define → do, in that order. */
function AddTask({ quest }: { quest: Quest }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [size, setSize] = useState<TaskSize>('S');
  const [tag, setTag] = useState<TaskTag>('systems');

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

  const submit = () => {
    if (!title.trim()) return;
    dispatch({ type: 'add-task', questId: quest.id, title, size, tag });
    setTitle('');
    setOpen(false);
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
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
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
        <button className="dq-btn-solid" style={{ fontSize: 11, padding: '7px 14px' }} onClick={submit}>ADD</button>
        <button className="dq-btn-ghost muted" onClick={() => setOpen(false)}>CANCEL</button>
      </div>
    </div>
  );
}

export function Quests() {
  const { state } = useStore();
  const { data } = state;

  const quests = [...data.quests].sort((a, b) => {
    const rank = (q: Quest) => (q.status === 'active' ? 0 : q.status === 'done' ? 1 : 2);
    return rank(a) - rank(b) || a.createdAt - b.createdAt;
  });

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '.06em', fontWeight: 800 }}>QUESTS &amp; TASKS</h2>
        <span style={{ fontSize: 11, color: 'var(--text-dim2)' }}>1 quest / project · max 2 active</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6, marginTop: -8 }}>
        Tasks are checked off in session, not here — define → do, in that order.
      </div>

      {quests.map((q) => {
        const project = data.projects.find((p) => p.id === q.projectId);
        const tasks = data.tasks.filter((t) => t.questId === q.id).sort((a, b) => a.createdAt - b.createdAt);
        const done = tasks.filter((t) => t.status === 'done').length;
        const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
        const color = project?.colorTag ?? 'var(--text-dim2)';
        const parked = q.status === 'parked';
        return (
          <div key={q.id} className="dq-card" style={{ borderRadius: 6, overflow: 'hidden', opacity: parked ? 0.6 : 1 }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-dim)', borderLeft: `3px solid ${color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 11, letterSpacing: '.14em', color }}>
                  {project?.name}
                  <span style={{ color: 'var(--text-faint)' }}> · {q.status.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{done}/{tasks.length} · {pct}%</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>{q.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim2)', marginTop: 6, lineHeight: 1.6 }}>
                DoD: {q.definitionOfDone}
              </div>
              <div style={{ height: 6, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color }} />
              </div>
            </div>
            <div style={{ padding: '6px 10px' }}>
              {tasks.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 6px', borderBottom: '1px solid #1e1e1c' }}>
                  <span style={{ fontSize: 16, flex: 'none', width: 16, color: t.status === 'done' ? 'var(--success)' : 'var(--text-faint)' }}>
                    {t.status === 'done' ? '◉' : '○'}
                  </span>
                  <span style={{
                    flex: 1, fontSize: 13,
                    textDecoration: t.status === 'done' ? 'line-through' : 'none',
                    color: t.status === 'done' ? 'var(--text-dim)' : 'var(--text)'
                  }}>
                    {t.title}
                  </span>
                  <TagBadge tag={taskTag(t)} small />
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 64, textAlign: 'right', flex: 'none' }}>
                    {t.size} · {SIZE_XP[t.size]}xp
                  </span>
                </div>
              ))}
              {q.status === 'active' && <AddTask quest={q} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

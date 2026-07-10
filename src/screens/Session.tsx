import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { SIZE_XP } from '../lib/levels';
import { formatClock } from '../lib/time';
import { TagBadge, SizeChip, taskTag } from '../components/bits';

export function Session() {
  const { state, dispatch } = useStore();
  const session = state.session!;
  const task = state.data.tasks.find((t) => t.id === session.taskId)!;
  const quest = state.data.quests.find((q) => q.id === task.questId);
  const project = state.data.projects.find((p) => p.id === quest?.projectId);
  const checked = !!session.checked[task.id];

  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - session.startedAt) / 1000));
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - session.startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [session.startedAt]);

  const counts = elapsed >= 90;
  const xp = SIZE_XP[task.size];

  return (
    <div style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column', padding: 22,
      background: 'radial-gradient(circle at 50% 20%, #201a12 0%, #161513 55%)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 11, letterSpacing: '.24em', color: 'var(--accent)', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)',
            animation: 'dq-blink 1.2s step-end infinite'
          }} />
          SESSION LIVE
        </span>
        <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '.06em', fontVariantNumeric: 'tabular-nums' }}>
          {formatClock(elapsed)}
        </span>
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 22, textAlign: 'center', padding: '20px 0'
      }}>
        <div style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--text-dim2)' }}>
          {project?.name} · {quest?.title}
        </div>
        <div style={{ fontSize: 12, letterSpacing: '.24em', color: 'var(--text-dim)' }}>— THIS SESSION'S ONE TASK —</div>
        <button
          onClick={() => dispatch({ type: 'toggle-check', taskId: task.id })}
          style={{
            width: '100%', maxWidth: 420, display: 'flex', alignItems: 'center', gap: 18, padding: 24,
            borderRadius: 6, cursor: 'pointer', color: 'var(--text)',
            background: checked ? '#16211a' : 'var(--bg-panel)',
            border: `1px solid ${checked ? 'var(--success)' : 'var(--border-light)'}`,
            transition: 'all .15s'
          }}
        >
          <span style={{ fontSize: 34, lineHeight: 1, flex: 'none', color: checked ? 'var(--success)' : 'var(--text-dim2)' }}>
            {checked ? '◉' : '○'}
          </span>
          <span style={{ textAlign: 'left' }}>
            <span style={{
              display: 'block', fontSize: 22, fontWeight: 700, lineHeight: 1.35,
              textDecoration: checked ? 'line-through' : 'none',
              color: checked ? 'var(--text-dim)' : 'var(--text)'
            }}>
              {task.title}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <TagBadge tag={taskTag(task)} small />
              <SizeChip task={task} />
            </span>
          </span>
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-dim2)', maxWidth: 340, lineHeight: 1.7 }}>
          Tap the task when it's done. XP is only awarded for this pre-defined task — you can't retroactively invent XP.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          fontSize: 11, textAlign: 'center', letterSpacing: '.1em',
          color: counts ? 'var(--success)' : 'var(--text-dim)'
        }}>
          {counts
            ? '✓ SESSION COUNTS · XP will be awarded on END'
            : '⚠ UNDER 90s · free to abandon, nothing logged'}
        </div>
        <button
          onClick={() => dispatch({ type: 'end-session', now: Date.now() })}
          style={{
            width: '100%', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 15,
            letterSpacing: '.08em', padding: 16, borderRadius: 6,
            background: checked ? 'var(--accent)' : '#2a2a27',
            color: checked ? 'var(--on-accent)' : 'var(--text-dim)'
          }}
        >
          {checked ? `END SESSION · CLAIM +${xp} XP` : 'END SESSION'}
        </button>
      </div>
    </div>
  );
}

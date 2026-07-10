import { useStore, nextQueuedTask } from '../store';
import { levelInfo, SIZE_XP } from '../lib/levels';
import { streakWeeks } from '../lib/streak';
import { formatToday } from '../lib/time';
import { Bar, TagBadge, SizeChip, label, taskColor, taskTag } from '../components/bits';
import type { Task } from '../types';

function CornerBrackets() {
  const s = { position: 'absolute' as const, color: 'var(--on-accent)', opacity: 0.5, fontSize: 20 };
  return (
    <>
      <span style={{ ...s, top: 12, left: 14 }}>⌜</span>
      <span style={{ ...s, top: 12, right: 14 }}>⌝</span>
      <span style={{ ...s, bottom: 12, left: 14 }}>⌞</span>
      <span style={{ ...s, bottom: 12, right: 14 }}>⌟</span>
    </>
  );
}

function QueuedCard({ task, wide }: { task: Task | null; wide: boolean }) {
  const { state } = useStore();
  if (!task) {
    return (
      <div className="dq-card" style={{ padding: wide ? 18 : 15, borderLeft: '3px solid var(--text-dim2)' }}>
        <div style={{ fontSize: wide ? 20 : 17, fontWeight: 700, color: 'var(--text-dim)' }}>— all clear —</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim2)', marginTop: 8, lineHeight: 1.6 }}>
          No todo tasks left. Define the next one on the Quests screen — tasks are defined before they're done.
        </div>
      </div>
    );
  }
  const quest = state.data.quests.find((q) => q.id === task.questId);
  const project = state.data.projects.find((p) => p.id === quest?.projectId);
  return (
    <div
      className="dq-card"
      style={{
        borderLeft: `3px solid ${taskColor(task)}`, padding: wide ? 18 : 15,
        display: 'flex', flexDirection: 'column', gap: wide ? 12 : 10
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: '.14em', color: project?.colorTag ?? 'var(--text-dim2)' }}>
        {project?.name} · {quest?.title}
      </div>
      <div style={{ fontSize: wide ? 20 : 17, fontWeight: 700, lineHeight: 1.3 }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TagBadge tag={taskTag(task)} small={!wide} />
        <SizeChip task={task} small={!wide} />
      </div>
      {wide && (
        <div style={{
          fontSize: 11, color: 'var(--text-dim2)', lineHeight: 1.6,
          borderTop: '1px dashed var(--border)', paddingTop: 10
        }}>
          Starting shows exactly this one task. No list. Lists invite triage; triage is friction.
        </div>
      )}
    </div>
  );
}

export function Home({ wide }: { wide: boolean }) {
  const { state, dispatch } = useStore();
  const { data } = state;
  const li = levelInfo(data.player.xp);
  const queued = nextQueuedTask(data);
  const sessionNo = data.sessions.length + 1;
  const streak = streakWeeks(data.sessions);
  const start = () => dispatch({ type: 'start-session' });

  const onDeck = data.tasks
    .filter((t) => t.status === 'todo' && t.id !== queued?.id &&
      data.quests.find((q) => q.id === t.questId)?.status === 'active')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, 3);

  const header = (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <div style={label}>
        TODAY · <span style={{ color: 'var(--text-dim)' }}>{formatToday(Date.now())}</span>
      </div>
      <div style={{ ...label, letterSpacing: '.16em' }}>
        SESSION #<span style={{ color: 'var(--text-dim)' }}>{sessionNo}</span>
      </div>
    </div>
  );

  if (wide) {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%' }}>
        {header}
        <div style={{ display: 'flex', gap: 18, flex: 1, minHeight: 0 }}>
          <button className="dq-start-btn" style={{ flex: 1.35, minHeight: 360, gap: 14 }} onClick={start}>
            <CornerBrackets />
            <span style={{ fontSize: 56, lineHeight: 1, fontWeight: 800 }}>▶</span>
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '.06em' }}>START SESSION</span>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.14em', opacity: 0.72 }}>
              ONE TAP · FREE TO ABANDON &lt;90s
            </span>
          </button>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div style={label}>NEXT TASK · PRE-QUEUED</div>
            <QueuedCard task={queued} wide />
            <div className="dq-card" style={{ padding: 16 }}>
              <div style={{ ...label, marginBottom: 10 }}>ON DECK AFTER</div>
              {onDeck.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-dim2)' }}>— nothing on deck —</div>
              )}
              {onDeck.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 13, color: 'var(--text-dim)' }}>
                  <span style={{ width: 7, height: 7, background: taskColor(t), flex: 'none' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-dim2)' }}>{t.size}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%' }}>
      {header}
      <button className="dq-start-btn" style={{ minHeight: 340, flex: 'none', gap: 12, width: '100%' }} onClick={start}>
        <CornerBrackets />
        <span style={{ fontSize: 64, lineHeight: 1, fontWeight: 800 }}>▶</span>
        <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '.05em', textAlign: 'center' }}>START SESSION</span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', opacity: 0.72, textAlign: 'center' }}>
          ONE TAP · FREE TO ABANDON &lt;90s
        </span>
      </button>

      <div style={{ display: 'flex', gap: 10 }}>
        <div className="dq-card" style={{ flex: 1, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 11, letterSpacing: '.16em', color: 'var(--text-dim2)' }}>
              LEVEL <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: 15 }}>{li.level}</span>
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{li.into} / {li.span} XP</span>
          </div>
          <Bar pct={li.pct} height={12} glow />
        </div>
        <div className="dq-card" style={{
          flex: 'none', width: 96, padding: 12, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 4
        }}>
          <span style={{ fontSize: 22 }}>🜂</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim2)', letterSpacing: '.1em' }}>
            <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: 15 }}>{streak}</span>wk
          </span>
        </div>
      </div>

      <div style={{ ...label, marginTop: 2 }}>NEXT TASK · PRE-QUEUED</div>
      <QueuedCard task={queued} wide={false} />
      {queued && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', letterSpacing: '.06em' }}>
          worth {SIZE_XP[queued.size]} XP · pre-loaded before your last session ended
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { HEAT_RAMP, TAG_COLORS, levelInfo } from '../lib/levels';
import { streakWeeks } from '../lib/streak';
import { weeklyReport } from '../lib/report';
import { dayKey, weekStart } from '../lib/time';
import { label } from '../components/bits';
import type { TaskTag } from '../types';

const TAG_ORDER: TaskTag[] = ['systems', 'design', 'art', 'biz', 'polish'];

function Heatmap() {
  const { state } = useStore();
  const cells = useMemo(() => {
    // 7 rows (Mon..Sun) × 17 cols (weeks), current week = last column
    const perDay = new Map<string, number>();
    for (const s of state.data.sessions) {
      if (s.voided) continue;
      const k = dayKey(s.startedAt);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    const thisMonday = weekStart(Date.now());
    const out: { color: string }[] = [];
    for (let d = 0; d < 7; d++) {
      for (let w = 0; w < 17; w++) {
        const ts = thisMonday - (16 - w) * 7 * 86400000 + d * 86400000;
        const n = perDay.get(dayKey(ts)) ?? 0;
        out.push({ color: HEAT_RAMP[Math.min(n, HEAT_RAMP.length - 1)] });
      }
    }
    return out;
  }, [state.data.sessions]);

  return (
    <div className="dq-card" style={{ borderRadius: 6, padding: 16 }}>
      <div style={{ ...label, letterSpacing: '.16em', marginBottom: 12 }}>SESSION-DAY HEATMAP · 17 WEEKS</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(17, 1fr)', gap: 3 }}>
        {cells.map((c, i) => (
          <span key={i} style={{ aspectRatio: '1', borderRadius: 2, background: c.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 10, fontSize: 10, color: 'var(--text-dim2)' }}>
        less
        {HEAT_RAMP.map((c) => (
          <span key={c} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
        ))}
        more
      </div>
    </div>
  );
}

function Donut() {
  const { state } = useStore();
  const counts = new Map<TaskTag, number>();
  for (const t of state.data.tasks) {
    const tag = t.tags[0] ?? 'systems';
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const total = state.data.tasks.length || 1;
  let acc = 0;
  const segs: string[] = [];
  const legend: { tag: TaskTag; count: number }[] = [];
  for (const tag of TAG_ORDER) {
    const c = counts.get(tag) ?? 0;
    if (!c) continue;
    segs.push(`${TAG_COLORS[tag]} ${(acc / total) * 360}deg ${((acc + c) / total) * 360}deg`);
    acc += c;
    legend.push({ tag, count: c });
  }
  const bg = segs.length ? `conic-gradient(${segs.join(',')})` : 'var(--bg-inset)';

  return (
    <div className="dq-card" style={{ flex: 1, minWidth: 220, borderRadius: 6, padding: 16 }}>
      <div style={{ ...label, letterSpacing: '.16em', marginBottom: 14 }}>WORK RATIO · SYSTEMS vs THE INVISIBLE MIDDLE</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{
          width: 104, height: 104, borderRadius: '50%', flex: 'none', background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-panel)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
          {legend.map((l) => (
            <div key={l.tag} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: TAG_COLORS[l.tag] }} />
              <span>{l.tag[0].toUpperCase() + l.tag.slice(1)}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>{l.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Ledger() {
  const { state } = useStore();
  const { data } = state;
  const [copied, setCopied] = useState(false);
  const report = weeklyReport(data, Date.now());
  const doneTotal = data.tasks.filter((t) => t.status === 'done').length;
  const streak = streakWeeks(data.sessions);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
    } catch { /* clipboard can be unavailable — the confirm still reassures */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '.06em', fontWeight: 800 }}>THE LEDGER</h2>

      <Heatmap />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Donut />
        <div className="dq-card" style={{ flex: 1, minWidth: 220, borderRadius: 6, padding: 16 }}>
          <div style={{ ...label, letterSpacing: '.16em', marginBottom: 14 }}>QUEST PROGRESS</div>
          {data.quests.filter((q) => q.status !== 'parked').map((q) => {
            const tasks = data.tasks.filter((t) => t.questId === q.id);
            const done = tasks.filter((t) => t.status === 'done').length;
            const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
            const color = data.projects.find((p) => p.id === q.projectId)?.colorTag ?? 'var(--accent)';
            return (
              <div key={q.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>{q.title}</span>
                  <span style={{ color: 'var(--text-dim)' }}>{done}/{tasks.length}</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{data.player.xp}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim2)', letterSpacing: '.1em' }}>TOTAL XP</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{doneTotal}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim2)', letterSpacing: '.1em' }}>TASKS DONE</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{streak}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim2)', letterSpacing: '.1em' }}>STREAK WK</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 12, letterSpacing: '.06em' }}>
            LVL {levelInfo(data.player.xp).level} · levels are permanent and survive project hops
          </div>
        </div>
      </div>

      <div className="dq-card" style={{ border: '1px solid var(--accent)', borderRadius: 6, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: '.16em', color: 'var(--accent)', fontWeight: 700 }}>
            WEEKLY REPORT · MENTOR-READY
          </span>
          <button className={`dq-btn-ghost${copied ? ' success' : ''}`} onClick={copy}>
            {copied ? '✓ COPIED' : 'COPY ⧉'}
          </button>
        </div>
        <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 12, lineHeight: 1.7, color: '#B7B2A9', whiteSpace: 'pre-wrap' }}>
          {report}
        </pre>
      </div>
    </div>
  );
}

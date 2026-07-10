import { useEffect, useRef, useState } from 'react';
import { useStore, nextQueuedTask } from '../store';
import { levelInfo } from '../lib/levels';

/** The juice. Counts XP from old total to new over ~1100ms while the level bar fills live. */
export function RewardOverlay() {
  const { state, dispatch } = useStore();
  const overlay = state.overlay!;
  const [display, setDisplay] = useState(overlay.oldXp);
  const raf = useRef<number>();

  useEffect(() => {
    const dur = 1100;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setDisplay(Math.round(overlay.oldXp + (overlay.newXp - overlay.oldXp) * p));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [overlay.oldXp, overlay.newXp]);

  const li = levelInfo(display);
  const next = nextQueuedTask(state.data);

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(10,9,7,.92)',
        backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 20, padding: 26, textAlign: 'center',
        animation: 'dq-rise .25s ease both', overflowY: 'auto'
      }}
    >
      {overlay.levelUp && (
        <div style={{
          fontSize: 26, fontWeight: 800, letterSpacing: '.24em', color: 'var(--accent-bright)',
          textShadow: '0 0 24px rgba(212,98,43,.8)', animation: 'dq-flash .6s ease both'
        }}>
          ★ LEVEL UP ★
        </div>
      )}
      <div style={{ fontSize: 12, letterSpacing: '.24em', color: 'var(--text-dim)' }}>{overlay.headline}</div>
      <div style={{
        fontSize: 72, fontWeight: 800, color: 'var(--accent-bright)', lineHeight: 1,
        textShadow: '0 0 40px rgba(212,98,43,.6)', fontVariantNumeric: 'tabular-nums'
      }}>
        +{overlay.earned}
      </div>
      <div style={{ fontSize: 13, letterSpacing: '.2em', color: 'var(--text-dim2)' }}>XP</div>

      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
          <span>LVL {li.level}</span>
          <span style={{ color: 'var(--text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{display} XP</span>
          <span>LVL {li.level + 1}</span>
        </div>
        <div style={{ height: 16, background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${li.pct}%`, background: 'linear-gradient(90deg,#a8461c,#FF7A3D)',
            boxShadow: '0 0 16px rgba(255,122,61,.7)', transition: 'width .06s linear'
          }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 360 }}>
        {overlay.lines.map((l, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 4,
            padding: '9px 12px', fontSize: 12
          }}>
            <span style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
              <span style={{ color: 'var(--success)' }}>✓</span>{l.title}
            </span>
            <span style={{ color: 'var(--accent)', fontWeight: 700, flex: 'none', marginLeft: 10 }}>+{l.xp}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        Next task queued: <span style={{ color: 'var(--text)' }}>{next ? next.title : '— all clear —'}</span>
      </div>
      <button
        className="dq-btn-solid"
        style={{ marginTop: 4, fontSize: 14, padding: '14px 40px' }}
        onClick={() => dispatch({ type: 'continue-overlay' })}
      >
        CONTINUE ▶
      </button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useStore, nextQueuedTask } from './store';
import { levelInfo, SIZE_XP } from './lib/levels';
import { streakWeeks } from './lib/streak';
import { taskColor, taskTag } from './components/bits';
import { Home } from './screens/Home';
import { Session } from './screens/Session';
import { Quests } from './screens/Quests';
import { Awards } from './screens/Awards';
import { Ledger } from './screens/Ledger';
import { Config } from './screens/Config';
import { RewardOverlay } from './components/RewardOverlay';
import { Toast } from './components/Toast';
import { onUpdateReady, applyUpdate } from './lib/updater';
import type { Screen } from './types';

const NAV: { key: Screen; label: string; glyph: string }[] = [
  { key: 'home', label: 'HOME', glyph: '▸' },
  { key: 'quests', label: 'QUESTS', glyph: '◆' },
  { key: 'achievements', label: 'AWARDS', glyph: '✦' },
  { key: 'ledger', label: 'LEDGER', glyph: '▦' },
  { key: 'settings', label: 'CONFIG', glyph: '◉' }
];

function useWide() {
  const [wide, setWide] = useState(() => window.innerWidth >= 900);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const on = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

function RightRail() {
  const { state, dispatch } = useStore();
  const { data } = state;
  const li = levelInfo(data.player.xp);
  const queued = nextQueuedTask(data);
  const doneTotal = data.tasks.filter((t) => t.status === 'done').length;

  return (
    <div style={{
      width: 246, flex: 'none', background: 'var(--bg-panel)', borderLeft: '1px solid var(--border-dim)',
      padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto'
    }}>
      <div style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--text-faint)' }}>METERS</div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 12, letterSpacing: '.12em', color: 'var(--text-dim2)' }}>
            LEVEL <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: 20 }}>{li.level}</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{li.into}/{li.span}</span>
        </div>
        <div style={{ height: 14, background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${li.pct}%`, background: 'linear-gradient(90deg,#a8461c,#FF7A3D)',
            boxShadow: '0 0 12px rgba(212,98,43,.6)'
          }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim2)', marginTop: 6 }}>{data.player.xp} XP total</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 5, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 20 }}>🜂</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{streakWeeks(data.sessions)}</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim2)', letterSpacing: '.1em' }}>STREAK WK</div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 5, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 20, color: 'var(--accent)' }}>◆</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{doneTotal}</div>
          <div style={{ fontSize: 9, color: 'var(--text-dim2)', letterSpacing: '.1em' }}>TASKS DONE</div>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--text-faint)', marginBottom: 10 }}>NEXT IGNITION</div>
        <div style={{
          background: 'var(--bg-inset)', border: '1px solid var(--border)',
          borderLeft: `3px solid ${queued ? taskColor(queued) : 'var(--text-dim2)'}`, borderRadius: 5, padding: 12
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{queued ? queued.title : '— all clear —'}</div>
          {queued && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8 }}>
              {queued.size} · {SIZE_XP[queued.size]} XP · {taskTag(queued).toUpperCase()}
            </div>
          )}
        </div>
        <button
          className="dq-btn-solid"
          style={{ width: '100%', marginTop: 12, fontSize: 13, letterSpacing: '.08em', padding: 12 }}
          onClick={() => dispatch({ type: 'start-session' })}
        >
          ▶ START SESSION
        </button>
      </div>
    </div>
  );
}

function UpdateBanner() {
  return (
    <button
      onClick={applyUpdate}
      style={{
        position: 'absolute', top: 12, right: 12, zIndex: 70,
        background: 'var(--bg-panel)', border: '1px solid var(--accent)', color: 'var(--accent)',
        fontSize: 10, fontWeight: 700, letterSpacing: '.12em', padding: '7px 12px',
        borderRadius: 4, cursor: 'pointer', animation: 'dq-shift .3s ease both',
        boxShadow: '0 4px 20px rgba(0,0,0,.5)'
      }}
    >
      ⟳ UPDATE READY · TAP TO INSTALL
    </button>
  );
}

export default function App() {
  const { state, dispatch } = useStore();
  const wide = useWide();
  const inSession = state.screen === 'session' && !!state.session;
  const li = levelInfo(state.data.player.xp);
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => onUpdateReady(setUpdateReady), []);

  if (!state.hydrated) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim2)', fontSize: 12, letterSpacing: '.24em' }}>
        LOADING FOREMAN'S TERMINAL…
      </div>
    );
  }

  return (
    <div className="dq-app">
      <div className="dq-scanlines" />

      {wide && (
        <div style={{
          height: 42, flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px',
          background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-dim)'
        }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-light)' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-light)' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 12, letterSpacing: '.16em', color: 'var(--text-dim)', fontWeight: 600 }}>
            DEVQUEST <span style={{ color: 'var(--text-faint)' }}>//</span>{' '}
            <span style={{ color: 'var(--accent)' }}>foreman's terminal</span>{' '}
            <span style={{ color: 'var(--text-faint)' }}>·</span>{' '}
            <span style={{ color: 'var(--text)' }}>{state.data.player.handle}</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{ color: 'var(--text-dim2)' }}>LVL</span>
            <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{li.level}</span>
            <span style={{ color: 'var(--text-dim2)' }}>·</span>
            <span style={{ color: 'var(--text-dim2)' }}>🜂</span>
            <span style={{ fontWeight: 700 }}>{streakWeeks(state.data.sessions)}w</span>
          </div>
        </div>
      )}

      <div className="dq-body">
        {wide && !inSession && (
          <div style={{
            width: 176, flex: 'none', background: 'var(--bg-panel)', borderRight: '1px solid var(--border-dim)',
            padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 4
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '.2em', padding: '4px 10px 10px' }}>
              NAVIGATION
            </div>
            {NAV.map((n) => (
              <button
                key={n.key}
                className={`dq-nav-desk${state.screen === n.key ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'go', screen: n.key })}
              >
                <span style={{ width: 14, display: 'inline-block' }}>{n.glyph}</span>
                {n.label}
              </button>
            ))}
            <div style={{ marginTop: 'auto', padding: '12px 10px 4px', borderTop: '1px solid var(--border-dim)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '.16em' }}>v0.1 · TERMINAL THEME</div>
            </div>
          </div>
        )}

        <div className="dq-main">
          {inSession ? (
            <Session />
          ) : (
            <>
              {state.screen === 'home' && <Home wide={wide} />}
              {state.screen === 'quests' && <Quests />}
              {state.screen === 'achievements' && <Awards wide={wide} />}
              {state.screen === 'ledger' && <Ledger />}
              {state.screen === 'settings' && <Config wide={wide} />}
            </>
          )}
          {state.overlay && <RewardOverlay />}
          {state.toast && <Toast message={state.toast} />}
          {updateReady && <UpdateBanner />}
        </div>

        {wide && !inSession && <RightRail />}
      </div>

      {!wide && !inSession && (
        <div style={{ height: 62, flex: 'none', background: 'var(--bg-panel)', borderTop: '1px solid var(--border-dim)', display: 'flex' }}>
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`dq-nav-mob${state.screen === n.key ? ' active' : ''}`}
              onClick={() => dispatch({ type: 'go', screen: n.key })}
            >
              <span style={{ fontSize: 17, lineHeight: 1 }}>{n.glyph}</span>
              <span style={{ fontSize: 9, letterSpacing: '.08em' }}>{n.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

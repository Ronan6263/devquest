import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { levelInfo } from '../lib/levels';
import { exportJson, validateImport } from '../lib/db';
import { syncManager, type SyncStatus } from '../lib/sync';
import { label } from '../components/bits';

const THEMES = [
  { name: 'Terminal', level: 1, desc: 'Foreman’s workstation. Burnt orange on gunmetal.', swatch: 'linear-gradient(135deg,#1a1a1a,#D4622B)' },
  { name: 'Notebook', level: 3, desc: 'Doodle Defense’s paper + graphite look.', swatch: 'linear-gradient(135deg,#efe9dc,#b9b2a2)' },
  { name: 'CRT', level: 6, desc: 'Green phosphor scanlines. Pure dopamine.', swatch: 'linear-gradient(135deg,#03170a,#25f07a)' },
  { name: 'Blueprint', level: 9, desc: 'Cyan grid on navy. Drafting-table mode.', swatch: 'linear-gradient(135deg,#0a1c3a,#4d9fff)' }
];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function SyncCard() {
  const [status, setStatus] = useState<SyncStatus>({ state: 'disabled' });
  const [passcode, setPasscode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => syncManager.subscribe(setStatus), []);
  // refresh the "last synced Xs ago" line
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const enable = async () => {
    if (passcode.trim().length < 8) return;
    setBusy(true);
    try {
      await syncManager.enable(passcode.trim());
      setPasscode('');
    } finally {
      setBusy(false);
    }
  };

  const dot =
    status.state === 'idle' ? 'var(--success)'
    : status.state === 'syncing' ? 'var(--accent)'
    : status.state === 'disabled' ? 'var(--text-faint)'
    : '#D4A72B';
  const statusLine =
    status.state === 'idle' ? `SYNCED${status.lastSyncAt ? ` · ${timeAgo(status.lastSyncAt)}` : ''}`
    : status.state === 'syncing' ? 'SYNCING…'
    : status.state === 'offline' ? 'OFFLINE · will retry when back online'
    : status.state === 'error' ? `SYNC PAUSED · ${status.detail ?? 'error'}`
    : 'DISABLED';

  return (
    <div className="dq-card" style={{ borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...label, letterSpacing: '.16em' }}>AUTO-SYNC · DESKTOP ⇄ PHONE</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, letterSpacing: '.1em', color: 'var(--text-dim)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
          {statusLine}
        </span>
      </div>

      {!syncManager.enabled ? (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-dim2)', lineHeight: 1.6 }}>
            No account — just a passcode. It becomes both the address and the encryption key: enter the
            same one on your other device and they meet in the middle. Everything is encrypted on-device
            before upload; the relay only ever sees ciphertext. Pick a long, unique phrase (8+ chars) —
            anyone who guesses it could read or overwrite your sync data.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="dq-input"
              type={show ? 'text' : 'password'}
              placeholder="sync passcode — e.g. cursed-toaster-teeth-9931"
              value={passcode}
              maxLength={64}
              style={{ flex: 1 }}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void enable(); }}
            />
            <button className="dq-btn-ghost muted" onClick={() => setShow(!show)}>{show ? '🙈' : '👁'}</button>
          </div>
          <button
            className="dq-btn-solid"
            disabled={busy || passcode.trim().length < 8}
            style={{ fontSize: 12, padding: '10px 18px', opacity: busy || passcode.trim().length < 8 ? 0.5 : 1 }}
            onClick={() => void enable()}
          >
            {busy ? 'CONNECTING…' : 'ENABLE AUTO-SYNC'}
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-dim2)', lineHeight: 1.6 }}>
            Syncs on launch, every minute while open, when the app returns to foreground, and a moment
            after every change. Work done offline on both devices merges — XP adds up, done is done,
            deletions stay deleted. Enter the same passcode on your other device to link it.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="dq-btn-ghost" onClick={() => void syncManager.syncNow()}>SYNC NOW ⟳</button>
            <button className="dq-btn-ghost muted" onClick={() => syncManager.disable()}>DISABLE</button>
          </div>
        </>
      )}
    </div>
  );
}

export function Config({ wide }: { wide: boolean }) {
  const { state, dispatch } = useStore();
  const { data } = state;
  const level = levelInfo(data.player.xp).level;
  const fileInput = useRef<HTMLInputElement>(null);
  const [editingHandle, setEditingHandle] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // arm-then-confirm: the armed state disarms itself after 4s
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);
  const grid = { display: 'grid', gridTemplateColumns: `repeat(${wide ? 3 : 2}, 1fr)`, gap: 10 } as const;

  const onImportFile = async (file: File) => {
    try {
      const parsed = validateImport(JSON.parse(await file.text()));
      if (!parsed) {
        dispatch({ type: 'toast', message: 'Import failed — not a valid DevQuest export.' });
        return;
      }
      dispatch({ type: 'import', data: parsed });
    } catch {
      dispatch({ type: 'toast', message: 'Import failed — could not read that file.' });
    }
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '.06em', fontWeight: 800 }}>SETTINGS</h2>

      <div className="dq-card" style={{ borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...label, letterSpacing: '.16em' }}>PLAYER</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, gap: 10 }}>
          <span style={{ color: 'var(--text-dim)' }}>Handle</span>
          {editingHandle === null ? (
            <button
              style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0 }}
              title="tap to edit"
              onClick={() => setEditingHandle(data.player.handle)}
            >
              {data.player.handle} ✎
            </button>
          ) : (
            <input
              className="dq-input"
              autoFocus
              value={editingHandle}
              maxLength={20}
              style={{ width: 180, textAlign: 'right' }}
              onChange={(e) => setEditingHandle(e.target.value)}
              onBlur={() => { dispatch({ type: 'set-handle', handle: editingHandle }); setEditingHandle(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { dispatch({ type: 'set-handle', handle: editingHandle }); setEditingHandle(null); }
                if (e.key === 'Escape') setEditingHandle(null);
              }}
            />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: 'var(--text-dim)' }}>XP gain sound</span>
          <button
            onClick={() => dispatch({ type: 'toggle-sound' })}
            style={{
              border: `1px solid ${data.player.soundOn ? 'var(--accent)' : 'var(--border-light)'}`,
              background: 'transparent', color: data.player.soundOn ? 'var(--accent)' : 'var(--text-dim)',
              fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 4, cursor: 'pointer'
            }}
          >
            {data.player.soundOn ? 'ON ◉' : 'OFF ○'}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text-dim)' }}>Storage</span>
          <span style={{ color: 'var(--text-dim)' }}>IndexedDB · local · JSON export</span>
        </div>
      </div>

      <SyncCard />

      <div className="dq-card" style={{ borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...label, letterSpacing: '.16em' }}>BACKUP · JSON FILE</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim2)', lineHeight: 1.6 }}>
          Manual export/import — a local backup, or one-off transfer without sync. Importing replaces
          this device's state and wins the next sync merge.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="dq-btn-ghost" onClick={() => exportJson(data)}>EXPORT JSON ⭳</button>
          <button className="dq-btn-ghost" onClick={() => fileInput.current?.click()}>IMPORT JSON ⭱</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div>
        <div style={{ ...label, letterSpacing: '.16em', marginBottom: 10 }}>WORKBENCH THEMES · UNLOCK BY LEVEL</div>
        <div style={grid}>
          {THEMES.map((t) => {
            const active = t.name === 'Terminal';
            const locked = !active; // v1 ships Terminal only — others stubbed even past their level
            const levelMet = level >= t.level;
            return (
              <div key={t.name} className="dq-card" style={{
                borderRadius: 6, padding: 12, opacity: locked ? 0.8 : 1,
                borderColor: active ? 'var(--accent)' : 'var(--border-dim)'
              }}>
                <div style={{ height: 44, borderRadius: 4, background: t.swatch, marginBottom: 10, position: 'relative', overflow: 'hidden' }}>
                  {locked && (
                    <span style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, background: 'rgba(0,0,0,.45)'
                    }}>
                      🔒
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</span>
                  <span style={{ fontSize: 10, letterSpacing: '.08em', color: active || levelMet ? 'var(--success)' : 'var(--text-dim2)' }}>
                    {active ? 'ACTIVE' : `LVL ${t.level}`}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim2)', marginTop: 5, lineHeight: 1.5 }}>{t.desc}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim2)', marginTop: 12, lineHeight: 1.6 }}>
          v1 ships Terminal only — the rest are stubbed as locked. Each skin is one of your own projects' aesthetics.
          The tool slowly becomes a museum of the things you shipped.
        </div>
      </div>

      <div className="dq-card" style={{ borderRadius: 6, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...label, letterSpacing: '.16em' }}>FRESH START</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim2)', lineHeight: 1.6 }}>
          Wipes everything — XP, level, sessions, streak, achievements, proofs, and any tasks you added — and
          restores the day-one seed (Toaster #1 + Build DevQuest). Export a JSON backup first if you might want
          this history back. This cannot be undone.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className={confirmReset ? 'dq-btn-solid' : 'dq-btn-ghost muted'}
            style={confirmReset ? { fontSize: 11, letterSpacing: '.1em', padding: '7px 12px' } : undefined}
            onClick={() => {
              if (!confirmReset) { setConfirmReset(true); return; }
              setConfirmReset(false);
              dispatch({ type: 'reset' });
            }}
          >
            {confirmReset ? 'TAP AGAIN TO WIPE · SURE?' : 'RESET TO DAY ONE'}
          </button>
          {confirmReset && (
            <button className="dq-btn-ghost muted" onClick={() => setConfirmReset(false)}>KEEP MY DATA</button>
          )}
        </div>
      </div>

      <div className="dq-card" style={{ borderRadius: 6, padding: 16 }}>
        <div style={{ ...label, letterSpacing: '.16em', marginBottom: 10 }}>NO-PUNISHMENT GUARANTEE</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          No XP decay. No broken-streak shaming. No red warnings. Missing days is a scheduling fact, not a moral event.
          Streaks are weekly and pause — they never reset.
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useStore } from '../store';
import { ACHIEVEMENT_DEFS, type AchievementDef } from '../lib/achievements';
import { weekKey } from '../lib/time';
import { label, Bar } from '../components/bits';

function ProofModal({ def, onLog, onClose }: { def: AchievementDef; onLog: (proof: string) => void; onClose: () => void }) {
  const [proof, setProof] = useState('');
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 58, background: 'rgba(10,9,7,.88)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
      }}
      onClick={onClose}
    >
      <div
        className="dq-card"
        style={{ width: '100%', maxWidth: 380, padding: 18, border: '1px solid var(--accent)', display: 'flex', flexDirection: 'column', gap: 12, animation: 'dq-rise .2s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18 }}>{def.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>+{def.xp} XP</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{def.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>{def.desc}</div>
        <input
          className="dq-input"
          autoFocus
          placeholder="proof URL or note (the friction IS the verification)"
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onLog(proof); if (e.key === 'Escape') onClose(); }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="dq-btn-solid" style={{ fontSize: 12, padding: '10px 18px', flex: 1 }} onClick={() => onLog(proof)}>
            LOG PROOF · +{def.xp} XP
          </button>
          <button className="dq-btn-ghost muted" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

export function Awards({ wide }: { wide: boolean }) {
  const { state, dispatch } = useStore();
  const { data } = state;
  const [logging, setLogging] = useState<AchievementDef | null>(null);
  const grid = { display: 'grid', gridTemplateColumns: `repeat(${wide ? 3 : 2}, 1fr)`, gap: 10 } as const;

  const stateOf = (id: string) => data.achievements.find((a) => a.id === id);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h2 style={{ margin: 0, fontSize: 18, letterSpacing: '.06em', fontWeight: 800 }}>ACHIEVEMENTS</h2>

      <div>
        <div style={{ ...label, marginBottom: 10 }}>AUTO · APP-GRANTED FROM YOUR DATA</div>
        <div style={grid}>
          {ACHIEVEMENT_DEFS.filter((d) => d.cls === 'auto').map((d) => {
            const a = stateOf(d.id);
            const unlocked = !!a?.unlockedAt;
            const prog = !unlocked && d.progress ? d.progress(data) : null;
            return (
              <div key={d.id} className="dq-card" style={{
                borderRadius: 6, padding: 14, opacity: unlocked ? 1 : 0.72,
                borderColor: unlocked ? 'var(--border-light)' : 'var(--border-dim)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 18 }}>{d.icon}</span>
                  <span style={{ fontSize: 10, letterSpacing: '.12em', color: unlocked ? 'var(--success)' : 'var(--text-faint)' }}>
                    {unlocked ? 'UNLOCKED' : 'LOCKED'}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8, color: unlocked ? 'var(--text)' : 'var(--text-dim)' }}>
                  {d.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5, lineHeight: 1.5 }}>{d.desc}</div>
                {prog && prog[1] > 1 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '.08em', marginBottom: 4 }}>
                      {Math.min(prog[0], prog[1])} / {prog[1]}
                    </div>
                    <Bar pct={Math.min(100, Math.round((prog[0] / prog[1]) * 100))} height={5} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ ...label, marginBottom: 6 }}>PROOF · MUST TOUCH GRASS</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim2)', marginBottom: 10, lineHeight: 1.6 }}>
          2–4× the XP. Attaching proof <em>is</em> the verification. Tap to log one.
        </div>
        <div style={grid}>
          {ACHIEVEMENT_DEFS.filter((d) => d.cls === 'proof').map((d) => {
            const a = stateOf(d.id);
            const earned = (a?.timesEarned ?? 0) > 0;
            const doneForever = earned && !d.repeatable;
            const doneThisWeek = !!(d.repeatable && a?.lastEarnedAt && weekKey(a.lastEarnedAt) === weekKey(Date.now()));
            const foot = d.repeatable
              ? `WEEKLY · EARNED ${a?.timesEarned ?? 0}× · ${doneThisWeek ? '✓ LOGGED THIS WEEK' : 'TAP TO LOG'}`
              : doneForever ? '✓ LOGGED' : 'TAP TO ATTACH PROOF';
            return (
              <button
                key={d.id}
                onClick={() => { if (!doneForever) setLogging(d); }}
                style={{
                  background: 'var(--bg-panel)', borderRadius: 6, padding: 14,
                  border: `1px solid ${earned ? 'var(--accent)' : 'var(--border-light)'}`,
                  cursor: doneForever ? 'default' : 'pointer', color: 'var(--text)',
                  display: 'flex', flexDirection: 'column', textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ fontSize: 18 }}>{d.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>+{d.xp} XP</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5, lineHeight: 1.5 }}>{d.desc}</div>
                <div style={{
                  fontSize: 10, marginTop: 8, letterSpacing: '.08em',
                  color: doneForever || doneThisWeek ? 'var(--success)' : 'var(--accent)'
                }}>
                  {foot}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {logging && (
        <ProofModal
          def={logging}
          onClose={() => setLogging(null)}
          onLog={(proof) => {
            dispatch({ type: 'log-proof', achievementId: logging.id, proof: proof.trim(), now: Date.now() });
            setLogging(null);
          }}
        />
      )}
    </div>
  );
}

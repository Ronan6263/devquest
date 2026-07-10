import type { TaskSize, TaskTag } from '../types';

export const SIZE_XP: Record<TaskSize, number> = { S: 10, M: 25, L: 60 };

export const TAG_COLORS: Record<TaskTag, string> = {
  systems: '#5B8AC7',
  art: '#C77DB5',
  design: '#D4A72B',
  polish: '#7FB069',
  biz: '#B0A59A'
};

export const SIZE_COLORS: Record<TaskSize, string> = { S: '#7FB069', M: '#D4A72B', L: '#D4622B' };

export const HEAT_RAMP = ['#20211f', '#3a2a1e', '#6e3c1f', '#a8501f', '#D4622B'];

// Level 2 at 100 XP, then ×1.35 per increment (rounded) — thresholds [0, 100, 235, 417, 663, 995, ...]
const THRESHOLDS: number[] = (() => {
  const t = [0];
  let inc = 100;
  for (let i = 0; i < 30; i++) {
    t.push(t[t.length - 1] + Math.round(inc));
    inc *= 1.35;
  }
  return t;
})();

export interface LevelInfo {
  level: number;
  base: number;
  next: number;
  into: number;
  span: number;
  pct: number; // 0–100
}

export function levelInfo(xp: number): LevelInfo {
  let lv = 1;
  for (let i = 1; i < THRESHOLDS.length; i++) {
    if (xp >= THRESHOLDS[i]) lv = i + 1;
  }
  const base = THRESHOLDS[lv - 1];
  const next = THRESHOLDS[lv] ?? base;
  const into = xp - base;
  const span = next - base || 1;
  return { level: lv, base, next, into, span, pct: Math.min(100, Math.round((into / span) * 100)) };
}

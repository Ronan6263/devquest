import type { CSSProperties } from 'react';
import type { Task, TaskTag } from '../types';
import { SIZE_XP, TAG_COLORS } from '../lib/levels';

export const label: CSSProperties = { fontSize: 11, letterSpacing: '.2em', color: 'var(--text-dim2)' };

export function taskTag(t: Task): TaskTag {
  return t.tags[0] ?? 'systems';
}
export function taskColor(t: Task): string {
  return TAG_COLORS[taskTag(t)];
}

export function TagBadge({ tag, small }: { tag: TaskTag; small?: boolean }) {
  return (
    <span
      style={{
        fontSize: small ? 10 : 11, fontWeight: 700, padding: small ? '2px 7px' : '3px 8px',
        borderRadius: 3, background: TAG_COLORS[tag], color: '#0d0d0c'
      }}
    >
      {tag.toUpperCase()}
    </span>
  );
}

export function SizeChip({ task, small }: { task: Task; small?: boolean }) {
  return (
    <span
      style={{
        fontSize: small ? 10 : 11, color: 'var(--text-dim)', border: '1px solid var(--border-light)',
        padding: small ? '2px 7px' : '3px 8px', borderRadius: 3
      }}
    >
      {task.size} · {SIZE_XP[task.size]} XP
    </span>
  );
}

export function Bar({ pct, color, height = 8, glow }: { pct: number; color?: string; height?: number; glow?: boolean }) {
  return (
    <div style={{
      height, background: 'var(--bg-sunken)', border: height >= 12 ? '1px solid var(--border)' : 'none',
      borderRadius: 3, overflow: 'hidden'
    }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: color ?? 'linear-gradient(90deg,#a8461c,#FF7A3D)',
        boxShadow: glow ? '0 0 12px rgba(212,98,43,.6)' : 'none',
        transition: 'width .06s linear'
      }} />
    </div>
  );
}

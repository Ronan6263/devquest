import { openDB, type IDBPDatabase } from 'idb';
import type { PersistedState } from '../types';

const DB_NAME = 'devquest';
const STORE = 'state';
const KEY = 'root';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore(STORE);
      }
    });
  }
  return dbPromise;
}

export async function loadState(): Promise<PersistedState | null> {
  try {
    const d = await db();
    const raw = await d.get(STORE, KEY);
    return raw ?? null;
  } catch (e) {
    console.error('DevQuest: failed to load state from IndexedDB', e);
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: PersistedState | null = null;

/** Debounced persist — mutations arrive in bursts (end session → xp → achievements). */
export function saveState(state: PersistedState): void {
  pending = state;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const s = pending;
    pending = null;
    if (!s) return;
    try {
      const d = await db();
      await d.put(STORE, s, KEY);
    } catch (e) {
      console.error('DevQuest: failed to save state', e);
    }
  }, 150);
}

export function exportJson(state: PersistedState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `devquest-export-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function validateImport(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as PersistedState;
  if (s.version !== 1) return null;
  if (!s.player || typeof s.player.xp !== 'number') return null;
  for (const k of ['projects', 'quests', 'tasks', 'sessions', 'achievements'] as const) {
    if (!Array.isArray(s[k])) return null;
  }
  return s;
}

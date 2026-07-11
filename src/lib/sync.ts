import type { AchievementState, PersistedState } from '../types';
import { SIZE_XP } from './levels';

/**
 * Passcode-only auto-sync. The passcode deterministically derives BOTH the
 * storage slot (SHA-256 hash — unguessable) and the AES-GCM encryption key
 * (PBKDF2), so the same passcode on two devices meets at the same slot and
 * can decrypt the same blob. The relay (textdb.dev) only ever sees ciphertext.
 *
 * The relay is a disposable pipe, not a source of truth — every device keeps
 * its full state in IndexedDB. A vanished or vandalized slot just means the
 * next push re-establishes it (a decrypt failure is ignored, never adopted).
 *
 * Merge model: last-writer-wins per entity with union semantics, tombstones
 * for deletions, wholesale-wins for resets/imports (resetAt), and a three-way
 * counter merge for XP (localXp + remoteXp − lastCommonXp) so work done on
 * both devices while offline adds up instead of clobbering.
 */

const RELAY = 'https://textdb.dev/api/data/';
const CONFIG_KEY = 'devquest-sync-config';
const META_KEY = 'devquest-sync-meta';
const PBKDF2_ITERATIONS = 200_000;
const PULL_INTERVAL = 60_000;
const PUSH_DEBOUNCE = 2_500;

export interface SyncStatus {
  state: 'disabled' | 'idle' | 'syncing' | 'offline' | 'error';
  detail?: string;
  lastSyncAt?: number;
}

interface SyncConfig {
  passcode: string;
  deviceId: string;
}

interface SyncMeta {
  lastRemoteStamp: number; // updatedAt of the last remote envelope we integrated
  lastSyncedXp: number;    // xp at the last common point (three-way merge base)
  dirty: boolean;          // local changes not yet pushed
}

interface Envelope {
  v: 1;
  updatedAt: number;
  deviceId: string;
  state: PersistedState;
}

// ---------- small utils ----------

const te = new TextEncoder();
const td = new TextDecoder();

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', te.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function gzip(data: Uint8Array<ArrayBuffer>): Promise<{ bytes: Uint8Array<ArrayBuffer>; gz: boolean }> {
  if (typeof CompressionStream === 'undefined') return { bytes: data, gz: false };
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), gz: true };
}

async function gunzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------- crypto ----------

async function deriveKey(passcode: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', te.encode(passcode), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: te.encode('devquest-sync-v1'), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function deriveSlot(passcode: string): Promise<string> {
  return `dq1-${(await sha256hex(`devquest-slot-v1|${passcode}`)).slice(0, 40)}`;
}

async function encrypt(key: CryptoKey, envelope: Envelope): Promise<string> {
  const { bytes, gz } = await gzip(te.encode(JSON.stringify(envelope)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return `${gz ? 'dq1g' : 'dq1'}.${b64encode(iv)}.${b64encode(cipher)}`;
}

async function decrypt(key: CryptoKey, payload: string): Promise<Envelope> {
  const [tag, ivB64, dataB64] = payload.split('.');
  if ((tag !== 'dq1' && tag !== 'dq1g') || !ivB64 || !dataB64) throw new Error('not-devquest-data');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(ivB64) },
    key,
    b64decode(dataB64)
  );
  const bytes = tag === 'dq1g' ? await gunzip(new Uint8Array(plain)) : new Uint8Array(plain);
  return JSON.parse(td.decode(bytes)) as Envelope;
}

// ---------- merge ----------

function mergeById<T extends { id: string }>(
  newer: T[],
  older: T[],
  tombstones: Set<string>,
  pick: (n: T, o: T) => T
): T[] {
  const out = new Map<string, T>();
  for (const item of older) out.set(item.id, item);
  for (const item of newer) {
    const other = out.get(item.id);
    out.set(item.id, other ? pick(item, other) : item);
  }
  return [...out.values()].filter((x) => !tombstones.has(x.id)).sort((a, b) => {
    const ac = (a as { createdAt?: number }).createdAt ?? 0;
    const bc = (b as { createdAt?: number }).createdAt ?? 0;
    return ac - bc;
  });
}

function mergeAchievements(a: AchievementState[], b: AchievementState[]): AchievementState[] {
  const byId = new Map<string, AchievementState>();
  for (const x of [...a, ...b]) {
    const prev = byId.get(x.id);
    if (!prev) {
      byId.set(x.id, x);
      continue;
    }
    const unlockedAts = [prev.unlockedAt, x.unlockedAt].filter((t): t is number => t !== undefined);
    byId.set(x.id, {
      id: x.id,
      unlockedAt: unlockedAts.length ? Math.min(...unlockedAts) : undefined,
      timesEarned: Math.max(prev.timesEarned, x.timesEarned),
      lastEarnedAt: Math.max(prev.lastEarnedAt ?? 0, x.lastEarnedAt ?? 0) || undefined,
      proofUrls: [...new Set([...prev.proofUrls, ...x.proofUrls])]
    });
  }
  return [...byId.values()];
}

export function mergeStates(local: Envelope, remote: Envelope, lastSyncedXp: number): PersistedState {
  const lReset = local.state.resetAt ?? 0;
  const rReset = remote.state.resetAt ?? 0;
  if (lReset !== rReset) return lReset > rReset ? local.state : remote.state;

  const [nw, old] = local.updatedAt >= remote.updatedAt
    ? [local.state, remote.state]
    : [remote.state, local.state];
  const tombstones = new Set([...(local.state.deletedIds ?? []), ...(remote.state.deletedIds ?? [])]);

  const preferDone = <T extends { status: string; completedAt?: number }>(n: T, o: T): T => {
    if (n.status === 'done' && o.status !== 'done') return n;
    if (o.status === 'done' && n.status !== 'done') return o;
    return n;
  };

  // XP is additive — three-way counter merge so parallel offline work adds up.
  // Before the first sync there is no common stamp, but both devices grew from
  // the same seed (10 XP) — use that as the base so the seed isn't double-counted.
  const fallbackBase = Math.min(SIZE_XP.S, local.state.player.xp, remote.state.player.xp);
  const base = lastSyncedXp > 0
    ? Math.min(lastSyncedXp, local.state.player.xp, remote.state.player.xp)
    : fallbackBase;
  const xp = local.state.player.xp + remote.state.player.xp - base;

  return {
    version: 1,
    player: { ...nw.player, xp },
    projects: mergeById(nw.projects, old.projects, tombstones, (n) => n),
    quests: mergeById(nw.quests, old.quests, tombstones, preferDone),
    tasks: mergeById(nw.tasks, old.tasks, tombstones, preferDone),
    sessions: mergeById(nw.sessions, old.sessions, tombstones, (n) => n),
    achievements: mergeAchievements(nw.achievements, old.achievements),
    deletedIds: [...tombstones],
    resetAt: lReset || undefined
  };
}

/**
 * An untouched fresh install: no sessions, no XP, no deletions, nothing
 * created yet. Linking a pristine device should adopt the remote wholesale
 * instead of "merging" a blank slate into real work.
 */
export function isPristineSeed(state: PersistedState): boolean {
  return (
    state.sessions.length === 0 &&
    state.player.xp === 0 &&
    !(state.deletedIds ?? []).length &&
    state.projects.length === 0 &&
    state.quests.length === 0 &&
    state.tasks.length === 0
  );
}

// ---------- manager ----------

type StatusListener = (s: SyncStatus) => void;

class SyncManager {
  private getData: (() => PersistedState) | null = null;
  private adopt: ((data: PersistedState) => void) | null = null;
  private toast: ((msg: string) => void) | null = null;

  private key: CryptoKey | null = null;
  private slot: string | null = null;
  private config: SyncConfig | null = null;
  private status: SyncStatus = { state: 'disabled' };
  private listeners = new Set<StatusListener>();
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private queued = false;

  init(getData: () => PersistedState, adopt: (data: PersistedState) => void, toast: (msg: string) => void): void {
    this.getData = getData;
    this.adopt = adopt;
    this.toast = toast;
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      try {
        this.config = JSON.parse(raw) as SyncConfig;
        void this.activate();
      } catch {
        localStorage.removeItem(CONFIG_KEY);
      }
    }
  }

  subscribe(fn: StatusListener): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  get enabled(): boolean {
    return !!this.config;
  }

  private setStatus(s: SyncStatus): void {
    this.status = { ...s, lastSyncAt: s.lastSyncAt ?? this.status.lastSyncAt };
    this.listeners.forEach((fn) => fn(this.status));
  }

  private meta(): SyncMeta {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) return JSON.parse(raw) as SyncMeta;
    } catch { /* fall through */ }
    return { lastRemoteStamp: 0, lastSyncedXp: 0, dirty: true };
  }

  private saveMeta(m: SyncMeta): void {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  }

  async enable(passcode: string): Promise<void> {
    const deviceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.config = { passcode, deviceId };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    this.saveMeta({ lastRemoteStamp: 0, lastSyncedXp: 0, dirty: true });
    await this.activate();
  }

  disable(): void {
    this.config = null;
    this.key = null;
    this.slot = null;
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(META_KEY);
    if (this.pullTimer) clearInterval(this.pullTimer);
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.setStatus({ state: 'disabled' });
  }

  private async activate(): Promise<void> {
    if (!this.config) return;
    this.setStatus({ state: 'syncing', detail: 'deriving key' });
    this.key = await deriveKey(this.config.passcode);
    this.slot = await deriveSlot(this.config.passcode);

    if (this.pullTimer) clearInterval(this.pullTimer);
    this.pullTimer = setInterval(() => void this.syncNow(), PULL_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.enabled) void this.syncNow();
    });
    window.addEventListener('online', () => {
      if (this.enabled) void this.syncNow();
    });
    await this.syncNow();
  }

  /** Called from the store's persist effect on every local mutation. */
  localChanged(): void {
    if (!this.enabled) return;
    this.saveMeta({ ...this.meta(), dirty: true });
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.syncNow(), PUSH_DEBOUNCE);
  }

  async syncNow(): Promise<void> {
    if (!this.enabled || !this.key || !this.slot || !this.getData || !this.adopt) return;
    if (this.running) {
      this.queued = true;
      return;
    }
    this.running = true;
    this.setStatus({ state: 'syncing' });
    try {
      const meta = this.meta();
      const localState = this.getData();
      const remoteRaw = await this.fetchRemote();

      let remote: Envelope | null = null;
      if (remoteRaw) {
        try {
          remote = await decrypt(this.key, remoteRaw);
        } catch {
          if (remoteRaw.startsWith('dq1')) {
            // slot exists but doesn't decrypt: wrong passcode (or vandalism) — never adopt
            this.setStatus({ state: 'error', detail: 'remote data won’t decrypt — passcode mismatch?' });
            this.running = false;
            return;
          }
          remote = null; // foreign junk in the slot — overwrite on next push
        }
      }

      if (!remote) {
        await this.push(localState, meta);
      } else if (remote.updatedAt === meta.lastRemoteStamp) {
        if (meta.dirty) await this.push(localState, meta);
      } else if (!meta.dirty || (meta.lastRemoteStamp === 0 && isPristineSeed(localState))) {
        // clean pull — or a fresh install linking up for the first time
        this.adopt(remote.state);
        this.saveMeta({ lastRemoteStamp: remote.updatedAt, lastSyncedXp: remote.state.player.xp, dirty: false });
        this.toast?.('Synced — picked up changes from your other device.');
      } else {
        const localEnv: Envelope = {
          v: 1, updatedAt: Date.now(), deviceId: this.config!.deviceId, state: localState
        };
        const merged = mergeStates(localEnv, remote, meta.lastSyncedXp);
        this.adopt(merged);
        await this.push(merged, meta);
        this.toast?.('Synced — merged work from both devices.');
      }
      this.setStatus({ state: 'idle', lastSyncAt: Date.now() });
    } catch (e) {
      this.setStatus({
        state: navigator.onLine === false ? 'offline' : 'error',
        detail: e instanceof Error ? e.message : 'sync failed'
      });
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        void this.syncNow();
      }
    }
  }

  private async fetchRemote(): Promise<string | null> {
    const res = await fetch(`${RELAY}${this.slot}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`relay responded ${res.status}`);
    const text = await res.text();
    return text.trim() ? text : null;
  }

  private async push(state: PersistedState, meta: SyncMeta): Promise<void> {
    const updatedAt = Date.now();
    const payload = await encrypt(this.key!, {
      v: 1, updatedAt, deviceId: this.config!.deviceId, state
    });
    const res = await fetch(`${RELAY}${this.slot}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
      keepalive: payload.length < 60_000 // keepalive caps body size; large pushes go without it
    });
    if (!res.ok) throw new Error(`relay rejected push (${res.status})`);
    this.saveMeta({ ...meta, lastRemoteStamp: updatedAt, lastSyncedXp: state.player.xp, dirty: false });
  }
}

export const syncManager = new SyncManager();

export type TaskSize = 'S' | 'M' | 'L';
export type TaskTag = 'systems' | 'art' | 'design' | 'polish' | 'biz';
export type TaskStatus = 'todo' | 'done';
export type QuestStatus = 'active' | 'parked' | 'done';
export type Screen = 'home' | 'session' | 'quests' | 'achievements' | 'ledger' | 'settings';

export interface Player {
  handle: string;
  xp: number;
  soundOn: boolean;
  unlockedThemes: string[];
}

export interface Project {
  id: string;
  name: string;
  colorTag: string;
  status: 'active' | 'parked';
  createdAt: number;
}

export interface Quest {
  id: string;
  projectId: string;
  title: string;
  definitionOfDone: string;
  status: QuestStatus;
  createdAt: number;
  completedAt?: number;
}

export interface Task {
  id: string;
  questId: string;
  title: string;
  size: TaskSize;
  tags: TaskTag[];
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
  sessionId?: string;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  taskIdsCompleted: string[];
  voided: boolean; // < 90s — never actually persisted, kept for schema parity
}

export interface AchievementState {
  id: string;
  unlockedAt?: number;
  timesEarned: number;
  proofUrls: string[];
  lastEarnedAt?: number;
}

/** Everything that goes to IndexedDB / export file. */
export interface PersistedState {
  version: 1;
  player: Player;
  projects: Project[];
  quests: Quest[];
  tasks: Task[];
  sessions: SessionRecord[];
  achievements: AchievementState[];
}

/** Live (un-persisted) session. */
export interface LiveSession {
  id: string;
  taskId: string;
  startedAt: number;
  checked: Record<string, boolean>;
}

export interface OverlayData {
  headline: string;
  earned: number;
  oldXp: number;
  newXp: number;
  levelUp: boolean;
  lines: { title: string; xp: number }[];
}

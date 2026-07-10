import type { PersistedState } from '../types';
import { defById } from './achievements';
import { levelInfo } from './levels';
import { streakWeeks } from './streak';
import { dayKey, formatRange, weekKey, weekStart } from './time';

export function weeklyReport(s: PersistedState, now: number): string {
  const wk = weekKey(now);
  const ws = weekStart(now);
  const li = levelInfo(s.player.xp);

  const weekSessions = s.sessions.filter((x) => !x.voided && weekKey(x.startedAt) === wk);
  const sessionDays = new Set(weekSessions.map((x) => dayKey(x.startedAt))).size;
  const weekTasks = s.tasks.filter(
    (t) => t.status === 'done' && t.completedAt !== undefined && weekKey(t.completedAt) === wk
  );

  const questLines = s.quests
    .filter((q) => q.status !== 'parked')
    .map((q) => {
      const all = s.tasks.filter((t) => t.questId === q.id);
      const done = all.filter((t) => t.status === 'done');
      const flag = q.status === 'done' ? ' ✓ COMPLETE' : '';
      return `${q.title}: ${done.length}/${all.length} tasks complete${flag}`;
    })
    .join('\n');

  const proofLines = s.achievements
    .filter((a) => a.timesEarned > 0 && defById(a.id).cls === 'proof' && a.lastEarnedAt !== undefined && weekKey(a.lastEarnedAt) === wk)
    .map((a) => {
      const note = a.proofUrls[a.proofUrls.length - 1];
      return `  ✓ ${defById(a.id).name}${note ? ` — ${note}` : ''}`;
    });

  return (
    `DEVQUEST // WEEKLY REPORT — ${s.player.handle}\n` +
    `Week of ${formatRange(ws, now)} · Level ${li.level} · ${s.player.xp} XP\n\n` +
    `Sessions: ${weekSessions.length} (${sessionDays} day${sessionDays === 1 ? '' : 's'})   ` +
    `Tasks done: ${weekTasks.length}   Streak: ${streakWeeks(s.sessions)} wk\n` +
    `${questLines}\n\n` +
    `Proof this week:\n` +
    `${proofLines.length ? proofLines.join('\n') : '  — none yet — post a gif, claim Witnessed'}\n\n` +
    `Blocked on: nothing. Just need ignition.`
  );
}

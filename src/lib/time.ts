/** Local-date helpers. Weeks are ISO-ish: Monday-start, keyed by the Monday's date. */

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday 00:00 (local) of the week containing ts. */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function weekKey(ts: number): string {
  return dayKey(weekStart(ts));
}

export function formatClock(totalSeconds: number): string {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatToday(ts: number): string {
  const d = new Date(ts);
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

export function formatRange(startTs: number, endTs: number): string {
  const a = new Date(startTs);
  const b = new Date(endTs);
  const mon = (d: Date) => MONTHS[d.getMonth()][0] + MONTHS[d.getMonth()].slice(1).toLowerCase();
  if (a.getMonth() === b.getMonth()) {
    return `${mon(a)} ${String(a.getDate()).padStart(2, '0')}–${String(b.getDate()).padStart(2, '0')}`;
  }
  return `${mon(a)} ${a.getDate()} – ${mon(b)} ${b.getDate()}`;
}

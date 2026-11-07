// Days on the phone's calendar (daily missions, the chest, streaks): a leaf of the engine.

/** The day of `now` on the phone's calendar: 2026-11-07. */
export function dateKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The calendar day before `now`'s, on the phone's calendar (right across a daylight-saving change). */
export function yesterdayKey(now: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return dateKey(d.getTime());
}

// Seasons decorate the factories and add a small income bonus while they last. Halloween and
// winter come with the calendar; spring and summer too (their festivals: engine/festival.ts),
// and the game's owner can also put spring or summer on at another time from the dashboard
// (supabase/migrations/0014; lib/live-events.ts brings them). Black Friday week comes with the
// calendar too: from the Monday before Black Friday through Cyber Monday (its deals: BLACK_FRIDAY).
export type Season = "halloween" | "winter" | "spring" | "summer" | "blackfriday";
/** The seasons the owner can schedule. */
export type FestivalSeason = "spring" | "summer";
export const FESTIVAL_SEASONS: FestivalSeason[] = ["spring", "summer"];

/** Income bonus while a season runs. */
export const SEASON_BONUS = 0.1;

/**
 * Black Friday week's deals: the dealers cut their prices (less markup on every car) and the
 * crowds come (customers arrive this much faster), and the shop's Star items cost less.
 */
export const BLACK_FRIDAY = {
  dealerCap: 1.6,
  markup: -0.05,
  /** Star items cost this share of their price (rounded, at least 1 ⭐). */
  starPrice: 0.6,
};

/** Black Friday of a year: the day after the fourth Thursday of November (local midnight). */
export function blackFriday(y: number): Date {
  const first = new Date(y, 10, 1).getDay();
  const thursday = 1 + ((4 - first + 7) % 7) + 21;
  return new Date(y, 10, thursday + 1);
}

/** A season's run: when it began and ends (ms), and a key naming this one run. */
export interface SeasonWindow {
  season: Season;
  start: number;
  end: number;
  key: string;
}

/** The calendar's spring and summer festivals (month 0-11, day; the last day included), local time like the other seasons. */
const CALENDAR: { season: FestivalSeason; from: [number, number]; to: [number, number] }[] = [
  { season: "spring", from: [2, 21], to: [3, 10] },
  { season: "summer", from: [6, 15], to: [7, 10] },
];

let scheduled: { season: FestivalSeason; start: number; end: number }[] = [];

/** The seasons the owner scheduled on the server (only spring and summer, at most 31 days each). */
export function setScheduledSeasons(list: { season: string; start: number; end: number }[]) {
  scheduled = list
    .filter((w) => (FESTIVAL_SEASONS as string[]).includes(w.season) && w.end > w.start && w.end - w.start <= 31 * 86_400_000)
    .map((w) => ({ season: w.season as FestivalSeason, start: w.start, end: w.end }))
    .sort((a, b) => a.start - b.start);
}

/** The season running at `now` with its window: a scheduled one first, then the calendar's. */
export function seasonWindow(now: number): SeasonWindow | null {
  const s = scheduled.find((w) => now >= w.start && now < w.end);
  if (s) return { ...s, key: `${s.season}@${s.start}` };
  const d = new Date(now);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  for (const c of CALENDAR) {
    const start = new Date(y, c.from[0], c.from[1]).getTime();
    const end = new Date(y, c.to[0], c.to[1] + 1).getTime();
    if (now >= start && now < end) return { season: c.season, start, end, key: `${c.season}-${y}` };
  }
  if (m === 10) {
    const bf = blackFriday(y);
    const start = new Date(y, 10, bf.getDate() - 4).getTime();
    // through Cyber Monday, and never into December (the winter festival's)
    const end = Math.min(new Date(y, 10, bf.getDate() + 4).getTime(), new Date(y, 11, 1).getTime());
    if (now >= start && now < end) return { season: "blackfriday", start, end, key: `blackfriday-${y}` };
  }
  if ((m === 9 && day >= 10) || (m === 10 && day <= 2)) return { season: "halloween", start: new Date(y, 9, 10).getTime(), end: new Date(y, 10, 3).getTime(), key: `halloween-${y}` };
  // all December and the first week of January: the winter festival's time (engine/winter.ts)
  if (m === 11) return { season: "winter", start: new Date(y, 11, 1).getTime(), end: new Date(y + 1, 0, 7).getTime(), key: `winter-${y}` };
  if (m === 0 && day <= 6) return { season: "winter", start: new Date(y - 1, 11, 1).getTime(), end: new Date(y, 0, 7).getTime(), key: `winter-${y - 1}` };
  return null;
}

export const seasonAt = (now: number): Season | null => seasonWindow(now)?.season ?? null;

export const SEASON_ICON: Record<Season, string> = { halloween: "🎃", winter: "❄️", spring: "🌸", summer: "☀️", blackfriday: "🛍️" };

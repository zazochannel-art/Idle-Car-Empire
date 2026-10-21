// The events and seasons the game's owner scheduled on the server (migrations 0010 and 0014, the
// dashboard on the site): asked for at the start, every half hour and when the app comes back,
// and handed to the event schedule (game/engine/events.ts) and the seasons
// (game/engine/season.ts). Kept in memory only; offline, the regular schedule and the
// calendar's seasons go on as always.
import { setScheduledEvents } from "@/game/engine/events";
import { setScheduledSeasons } from "@/game/engine/season";

/** At most this long: what the server accepts too. */
const MAX_HOURS = 72;

/** The server's rows, checked: known shape, a sane length, not long over. */
export function parseLiveEvents(rows: unknown, now: number): { id: string; start: number; end: number }[] {
  if (!Array.isArray(rows)) return [];
  const out: { id: string; start: number; end: number }[] = [];
  for (const r of rows.slice(0, 20)) {
    if (!r || typeof r !== "object") continue;
    const { event, starts_at, ends_at } = r as Record<string, unknown>;
    if (typeof event !== "string" || typeof starts_at !== "string" || typeof ends_at !== "string") continue;
    const start = Date.parse(starts_at);
    const end = Date.parse(ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_HOURS * 3600_000 || end <= now) continue;
    out.push({ id: event, start, end });
  }
  return out;
}

/** At most this long, a scheduled season: what the server accepts too. */
const MAX_SEASON_DAYS = 31;

/** The server's scheduled seasons, checked the same way (spring and summer only). */
export function parseLiveSeasons(rows: unknown, now: number): { season: string; start: number; end: number }[] {
  if (!Array.isArray(rows)) return [];
  const out: { season: string; start: number; end: number }[] = [];
  for (const r of rows.slice(0, 10)) {
    if (!r || typeof r !== "object") continue;
    const { season, starts_at, ends_at } = r as Record<string, unknown>;
    if ((season !== "spring" && season !== "summer") || typeof starts_at !== "string" || typeof ends_at !== "string") continue;
    const start = Date.parse(starts_at);
    const end = Date.parse(ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MAX_SEASON_DAYS * 86_400_000 || end <= now) continue;
    out.push({ season, start, end });
  }
  return out;
}

async function rpc(name: string): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || typeof fetch === "undefined") throw new Error("offline");
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Asks the server for the scheduled events and seasons; on any failure that list is left as it was. */
export async function refreshLiveEvents(now = Date.now()): Promise<boolean> {
  const [events, seasons] = await Promise.allSettled([rpc("live_events"), rpc("live_seasons")]);
  if (events.status === "fulfilled") setScheduledEvents(parseLiveEvents(events.value, now));
  if (seasons.status === "fulfilled") setScheduledSeasons(parseLiveSeasons(seasons.value, now));
  return events.status === "fulfilled";
}

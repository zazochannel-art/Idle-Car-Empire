// The events the game's owner scheduled on the server (migration 0010, the dashboard on the
// site): asked for at the start, every half hour and when the app comes back, and handed to
// the event schedule (game/engine/events.ts). Kept in memory only; offline, the regular
// schedule goes on as always.
import { setScheduledEvents } from "@/game/engine/events";

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

/** Asks the server for the scheduled events; on any failure the schedule is left as it was. */
export async function refreshLiveEvents(now = Date.now()): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || typeof fetch === "undefined") return false;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/live_events`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
    if (!r.ok) return false;
    setScheduledEvents(parseLiveEvents(await r.json(), now));
    return true;
  } catch {
    return false;
  }
}

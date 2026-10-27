// The events and seasons the game's owner scheduled on the server (migrations 0010 and 0014, the
// dashboard on the site): asked for at the start, every half hour and when the app comes back,
// and handed to the event schedule (game/engine/events.ts) and the seasons
// (game/engine/season.ts). Kept in memory only; offline, the regular schedule and the
// calendar's seasons go on as always. The owner's announcements (0020) come the same way.
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

/** An announcement from the game's team (migration 0020): a title and a text per language, shown once while it runs. */
export interface Announcement {
  id: number;
  icon: string;
  texts: Record<string, { title: string; body: string }>;
  end: number;
}

const ANNOUNCE_LANGS = ["en", "ro", "de", "es", "pt", "ru"];

/** The server's announcements, checked: a known shape, at least one text, not over. */
export function parseAnnouncements(rows: unknown, now: number): Announcement[] {
  if (!Array.isArray(rows)) return [];
  const out: Announcement[] = [];
  for (const r of rows.slice(0, 5)) {
    if (!r || typeof r !== "object") continue;
    const { id, icon, texts, ends_at } = r as Record<string, unknown>;
    const end = typeof ends_at === "string" ? Date.parse(ends_at) : NaN;
    if (typeof id !== "number" || !Number.isFinite(end) || end <= now || !texts || typeof texts !== "object") continue;
    const clean: Announcement["texts"] = {};
    for (const lang of ANNOUNCE_LANGS) {
      const t = (texts as Record<string, unknown>)[lang] as { title?: unknown; body?: unknown } | undefined;
      const title = typeof t?.title === "string" ? t.title.trim().slice(0, 60) : "";
      const body = typeof t?.body === "string" ? t.body.trim().slice(0, 300) : "";
      if (title) clean[lang] = { title, body };
    }
    if (!Object.keys(clean).length) continue;
    out.push({ id, icon: typeof icon === "string" && icon.trim() ? icon.trim().slice(0, 8) : "📣", texts: clean, end });
  }
  return out;
}

/** An announcement in the player's language, else English, else Romanian, else the first it has. */
export function announcementText(a: Announcement, lang: string): { title: string; body: string } {
  return a.texts[lang] ?? a.texts.en ?? a.texts.ro ?? Object.values(a.texts)[0];
}

let announcements: Announcement[] = [];
const SEEN_KEY = "idle-car-empire:news-seen";

/** Shows each running announcement once on this device (a toast that stays in the notification center). How many were new. */
export function showNewAnnouncements(lang: string, show: (icon: string, title: string, body: string) => void): number {
  let seen: number[] = [];
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as unknown;
    if (Array.isArray(raw)) seen = raw.filter((x): x is number => typeof x === "number");
  } catch {
    // storage off: each one shows again next time
  }
  const fresh = announcements.filter((a) => !seen.includes(a.id));
  for (const a of fresh) {
    const t = announcementText(a, lang);
    show(a.icon, t.title, t.body);
  }
  if (fresh.length) {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((a) => a.id)].slice(-50)));
    } catch {
      // as above
    }
  }
  return fresh.length;
}

async function rpc(name: string): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || typeof fetch === "undefined") throw new Error("offline");
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Asks the server for the scheduled events, seasons and announcements; on any failure that list is left as it was. */
export async function refreshLiveEvents(now = Date.now()): Promise<boolean> {
  const [events, seasons, news] = await Promise.allSettled([rpc("live_events"), rpc("live_seasons"), rpc("live_announcements")]);
  if (events.status === "fulfilled") setScheduledEvents(parseLiveEvents(events.value, now));
  if (seasons.status === "fulfilled") setScheduledSeasons(parseLiveSeasons(seasons.value, now));
  if (news.status === "fulfilled") announcements = parseAnnouncements(news.value, now);
  return events.status === "fulfilled";
}

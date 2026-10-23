import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { EVENTS, EVENT_BLOCK_MS, EVENT_OFFSET_MS } from "./config/events";
import { activeEvent, nextEvent, setScheduledEvents } from "./engine/events";
import { parseLiveEvents } from "@/lib/live-events";

const H = 3600_000;
// a quiet moment of the regular schedule: a block's start, before its event
const QUIET = 1000 * EVENT_BLOCK_MS;

afterEach(() => setScheduledEvents([]));

describe("events the owner schedules on the server", () => {
  it("run in place of the regular schedule, and only while scheduled", () => {
    expect(activeEvent(QUIET)).toBeNull();
    setScheduledEvents([{ id: "carShow", start: QUIET, end: QUIET + 2 * H }]);
    expect(activeEvent(QUIET)?.event.id).toBe("carShow");
    expect(activeEvent(QUIET + 2 * H - 1)?.event.id).toBe("carShow");
    // over the regular event's own window too
    const regular = QUIET + EVENT_OFFSET_MS;
    setScheduledEvents([{ id: "steelSale", start: regular - H, end: regular + H }]);
    expect(activeEvent(regular)?.event.id).toBe("steelSale");
    setScheduledEvents([]);
    expect(activeEvent(regular)?.start).toBe(regular);
  });

  it("are the game's own events only", () => {
    // an unknown event, and one that ends before it starts (the regular one only starts an hour in)
    setScheduledEvents([{ id: "freeMoney", start: QUIET, end: QUIET + H / 4 }, { id: "luxuryBoom", start: QUIET + H / 2, end: QUIET + H / 4 }]);
    expect(activeEvent(QUIET)).toBeNull();
    expect(activeEvent(QUIET + H / 3)).toBeNull();
  });

  it("count as the next event when they come first", () => {
    const regularNext = nextEvent(QUIET);
    setScheduledEvents([{ id: "exportDeal", start: QUIET + 10 * 60_000, end: QUIET + H }]);
    expect(nextEvent(QUIET).event.id).toBe("exportDeal");
    setScheduledEvents([{ id: "exportDeal", start: regularNext.start + H, end: regularNext.start + 2 * H }]);
    expect(nextEvent(QUIET).start).toBe(regularNext.start);
  });

  it("are read from the server's rows with care", () => {
    const now = Date.UTC(2026, 9, 19, 12);
    const iso = (t: number) => new Date(t).toISOString();
    const rows = [
      { event: "carShow", starts_at: iso(now), ends_at: iso(now + 2 * H) },
      { event: "carShow", starts_at: iso(now), ends_at: iso(now + 80 * H) },
      { event: "carShow", starts_at: iso(now - 3 * H), ends_at: iso(now - H) },
      { event: "carShow", starts_at: "soon", ends_at: iso(now + H) },
      { event: 7, starts_at: iso(now), ends_at: iso(now + H) },
      null,
    ];
    expect(parseLiveEvents(rows, now)).toEqual([{ id: "carShow", start: now, end: now + 2 * H }]);
    expect(parseLiveEvents({ error: "x" }, now)).toEqual([]);
  });

  it("use the same event ids as the server's list", () => {
    const sql = fs.readFileSync("supabase/migrations/0010_live_events_and_dashboard.sql", "utf8");
    const list = /function ops\.event_ids\(\)[\s\S]*?array\[([^\]]+)\]/.exec(sql)?.[1] ?? "";
    const ids = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual(EVENTS.map((e) => e.id).sort());
  });
});

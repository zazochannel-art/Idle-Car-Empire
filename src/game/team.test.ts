// What the game's team sends a player from the dashboard (engine/team.ts, migration 0020), and the
// team's announcements (lib/live-events.ts).
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { CITY_RULES } from "./config/cities";
import { BUYABLE_TERRITORIES } from "./config/city";
import * as Cy from "./engine/cities";
import { createInitialState } from "./engine/state";
import { TEAM_KINDS, applyTeamCommand, parseTeamCommands, teamWallet, type TeamCommand } from "./engine/team";
import { announcementText, parseAnnouncements, refreshLiveEvents, showNewAnnouncements } from "@/lib/live-events";

const T0 = Date.UTC(2026, 9, 27, 12);
const H = 3600_000;

const cash = (c: Partial<Extract<TeamCommand, { kind: "cash" }>>): TeamCommand => ({ id: 1, kind: "cash", mode: "add", amount: 0, city: "here", note: "", ...c });

describe("commands from the game's team", () => {
  it("knows the kinds the server queues (the latest migration's list)", () => {
    const sql = ["0020_dashboard_tools.sql", "0021_command_reputation.sql"].map((f) => fs.readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
    const list = [...sql.matchAll(/check \(kind in \(([^)]+)\)\)/g)].at(-1)?.[1] ?? "";
    expect(list.split(",").map((s) => s.trim().replace(/'/g, ""))).toEqual([...TEAM_KINDS]);
  });

  it("reads the server's rows, oldest first, and leaves out broken or unknown ones", () => {
    const rows = [
      { id: 7, kind: "stars", payload: { mode: "set", amount: 40 }, note: null },
      { id: 3, kind: "cash", payload: { mode: "add", amount: 1e6, city: "here" }, note: " Sorry for the bug " },
      { id: 4, kind: "cash", payload: { mode: "add", amount: "x" } },
      { id: 5, kind: "stars", payload: { mode: "add", amount: 1.5 } },
      { id: 6, kind: "teleport", payload: {} },
      { id: 8, kind: "message", payload: {}, note: "" },
      { id: 9, kind: "company", payload: { name: "  Fine Cars  " } },
      { id: 10, kind: "restore", payload: { backup: 12, made_at: "2026-10-26T10:00:00Z" } },
      { id: 11, kind: "cash", payload: { mode: "add", amount: 5, city: "mars" } },
    ];
    expect(parseTeamCommands(rows)).toEqual([
      { id: 3, kind: "cash", mode: "add", amount: 1e6, city: "here", note: "Sorry for the bug" },
      { id: 7, kind: "stars", mode: "set", amount: 40, note: "" },
      { id: 9, kind: "company", name: "Fine Cars", note: "" },
      { id: 10, kind: "restore", backup: 12, madeAt: Date.parse("2026-10-26T10:00:00Z"), note: "" },
    ]);
    expect(parseTeamCommands(null)).toEqual([]);
  });

  it("adds money (booked as a reward), takes it (never below 0) and sets it", () => {
    const s = createInitialState(T0);
    s.cash = 1000;
    applyTeamCommand(s, cash({ amount: 500 }));
    expect(s.cash).toBe(1500);
    applyTeamCommand(s, cash({ amount: -2000 }));
    expect(s.cash).toBe(0);
    applyTeamCommand(s, cash({ mode: "set", amount: 7e9 }));
    expect(s.cash).toBe(7e9);
  });

  it("pays into the city it names when the player has it, else into the one being played", () => {
    const s = createInitialState(T0);
    s.city.territories = BUYABLE_TERRITORIES.map((t) => t.id);
    s.cash = CITY_RULES.unlockCash + 5e6;
    // without Nordheim, a command for it goes to the first city
    expect(teamWallet(s, cash({ city: "north" }) as Extract<TeamCommand, { kind: "cash" }>)).toBe("home");
    expect(Cy.unlockCity(s, "north", T0)).toBe(true);
    const home = s.cash;
    const north = Cy.walletOf(s, "north");
    applyTeamCommand(s, cash({ amount: 1e6, city: "north" }));
    expect(s.cash).toBe(home);
    expect(Cy.walletOf(s, "north")).toBe(north + 1e6);
    applyTeamCommand(s, cash({ mode: "set", amount: 42, city: "here" }));
    expect(s.cash).toBe(42);
    expect(Cy.walletOf(s, "north")).toBe(north + 1e6);
  });

  it("sets or adds ⭐ Stars (never below 0), renames the company, shows a message, leaves a restore to the store", () => {
    const s = createInitialState(T0);
    s.stars = 10;
    applyTeamCommand(s, { id: 1, kind: "stars", mode: "add", amount: 5, note: "" });
    expect(s.stars).toBe(15);
    applyTeamCommand(s, { id: 2, kind: "stars", mode: "add", amount: -50, note: "" });
    expect(s.stars).toBe(0);
    applyTeamCommand(s, { id: 3, kind: "stars", mode: "set", amount: 40, note: "" });
    expect(s.stars).toBe(40);
    expect(applyTeamCommand(s, { id: 4, kind: "company", name: "Fine Cars", note: "" })).toBe(true);
    expect(s.brand.name).toBe("Fine Cars");
    expect(applyTeamCommand(s, { id: 5, kind: "message", note: "Hi" })).toBe(true);
    expect(applyTeamCommand(s, { id: 6, kind: "restore", backup: 1, madeAt: 0, note: "" })).toBe(false);
  });

  it("changes the company's reputation within 0–100, and the racing team's in whole points from 0", () => {
    expect(
      parseTeamCommands([
        { id: 1, kind: "rep", payload: { which: "company", mode: "set", amount: 80 } },
        { id: 2, kind: "rep", payload: { which: "company", mode: "add", amount: 120 } },
        { id: 3, kind: "rep", payload: { which: "racing", mode: "add", amount: 1.5 } },
        { id: 4, kind: "rep", payload: { which: "racing", mode: "add", amount: 500 } },
        { id: 5, kind: "rep", payload: { which: "fame", mode: "add", amount: 5 } },
      ]).map((c) => c.id),
    ).toEqual([1, 4]);
    const s = createInitialState(T0);
    expect(s.quality.rep).toBe(50);
    const rep = (which: "company" | "racing", mode: "add" | "set", amount: number): TeamCommand => ({ id: 1, kind: "rep", which, mode, amount, note: "" });
    applyTeamCommand(s, rep("company", "add", 30));
    expect(s.quality.rep).toBe(80);
    applyTeamCommand(s, rep("company", "add", 30));
    expect(s.quality.rep).toBe(100);
    applyTeamCommand(s, rep("company", "set", 12.5));
    expect(s.quality.rep).toBe(12.5);
    applyTeamCommand(s, rep("company", "add", -50));
    expect(s.quality.rep).toBe(0);
    const racing = s.racing.rep;
    applyTeamCommand(s, rep("racing", "add", 600));
    expect(s.racing.rep).toBe(racing + 600);
    applyTeamCommand(s, rep("racing", "add", -1e6));
    expect(s.racing.rep).toBe(0);
    applyTeamCommand(s, rep("racing", "set", 2500));
    expect(s.racing.rep).toBe(2500);
  });
});

describe("the team's announcements", () => {
  const row = (id: number, texts: unknown, end = T0 + H) => ({ id, icon: "🎉", texts, starts_at: new Date(T0 - H).toISOString(), ends_at: new Date(end).toISOString() });

  const realFetch = globalThis.fetch;
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    globalThis.fetch = realFetch;
  });

  it("keeps the running ones with a title, in the six languages", () => {
    const list = parseAnnouncements(
      [
        row(1, { ro: { title: "Salut", body: "Text" }, en: { title: "Hello", body: "" }, xx: { title: "?" } }),
        row(2, { en: { title: "" } }),
        row(3, { en: { title: "Over" } }, T0 - 1),
        { id: "4", texts: { en: { title: "Bad id" } }, ends_at: new Date(T0 + H).toISOString() },
      ],
      T0,
    );
    expect(list.map((a) => a.id)).toEqual([1]);
    expect(Object.keys(list[0].texts).sort()).toEqual(["en", "ro"]);
  });

  it("speaks the player's language, else English, else Romanian", () => {
    const [a] = parseAnnouncements([row(1, { ro: { title: "Salut", body: "" }, en: { title: "Hello", body: "" } })], T0);
    expect(announcementText(a, "ro").title).toBe("Salut");
    expect(announcementText(a, "de").title).toBe("Hello");
    const [b] = parseAnnouncements([row(2, { ro: { title: "Doar română", body: "" } })], T0);
    expect(announcementText(b, "ru").title).toBe("Doar română");
  });

  it("shows each one once on a device", async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://e2e.supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "key";
    const answer = (name: string) => (name.endsWith("live_announcements") ? [row(1, { en: { title: "Hello", body: "World" } }, Date.now() + H)] : []);
    (globalThis as { fetch?: unknown }).fetch = async (url: string) => ({ ok: true, json: async () => answer(url) });
    await refreshLiveEvents();
    const shown: string[] = [];
    expect(showNewAnnouncements("en", (icon, title, body) => shown.push(`${icon} ${title}: ${body}`))).toBe(1);
    expect(showNewAnnouncements("en", (icon, title) => shown.push(title))).toBe(0);
    expect(shown).toEqual(["🎉 Hello: World"]);
  });
});

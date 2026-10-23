import { describe, expect, it } from "vitest";
import { CHAPTERS, DILEMMAS, STORY } from "./config/story";
import { snapshot } from "./engine/economy";
import { createInitialState } from "./engine/state";
import { canChoose, chapterProgress, choiceCost, claimChapter, decide, dilemmaAt, storyTick, storyWaiting } from "./engine/story";
import { decodeSave, encodeSave } from "./save";
import type { GameState, PlantData } from "./types";

const T0 = Date.UTC(2026, 0, 1);

function withPlant(): { s: GameState; id: string; p: PlantData } {
  const s = createInitialState(T0);
  const id = "test:plant";
  const p = { speed: 0, automation: 0, fleet: 1, grade: 1, route: "auto", progress: 0, stock: {}, warehouse: 1, power: 0, inputs: {}, out: 0, outValue: 0, car: null, wait: 0, made: 100, status: "ok" } as unknown as PlantData;
  s.city.buildings[id] = { type: "engineFactory", level: 1, plant: p } as unknown as GameState["city"]["buildings"][string];
  return { s, id, p };
}

/** Plays until the next decision lands on the desk. */
function untilOffer(s: GameState) {
  const snap = snapshot(s);
  storyTick(s, snap);
  s.lifetime.playTime = s.story.nextAt;
  expect(storyTick(s, snap)).toBe("offer");
}

describe("decisions on the CEO's desk", () => {
  it("waits a quarter of an hour of play before the first one, and only once a plant has made something", () => {
    const { s, p } = withPlant();
    const snap = snapshot(s);
    expect(storyTick(s, snap)).toBeNull();
    expect(s.story.nextAt).toBe(STORY.first);
    p.made = 0;
    s.lifetime.playTime = STORY.first;
    expect(storyTick(s, snap)).toBeNull();
    expect(s.story.pending).toBeNull();
    p.made = 1;
    s.lifetime.playTime = s.story.nextAt;
    expect(storyTick(s, snap)).toBe("offer");
    expect(s.story.pending?.until).toBe(s.lifetime.playTime + STORY.expires);
  });

  it("brings the next one 20–35 minutes of play later, and drops one left too long", () => {
    const { s } = withPlant();
    untilOffer(s);
    const t = s.lifetime.playTime;
    expect(s.story.nextAt).toBeGreaterThanOrEqual(t + STORY.every);
    expect(s.story.nextAt).toBeLessThanOrEqual(t + STORY.every + STORY.spread);
    s.lifetime.playTime = s.story.pending!.until;
    expect(storyTick(s, snapshot(s))).toBe("expired");
    expect(s.story.pending).toBeNull();
  });

  it("goes through every decision in turn", () => {
    const ids = new Set(DILEMMAS.map((_, n) => dilemmaAt(n).id));
    expect(ids.size).toBe(DILEMMAS.length);
  });

  it("does what each choice says: the raise costs money and cheers the crew; refusing sours them", () => {
    const { s, p } = withPlant();
    const snap = snapshot(s);
    s.story.pending = { id: "raise", plot: "", until: 1e9 };
    const cost = choiceCost(DILEMMAS.find((d) => d.id === "raise")!.choices[0], snap);
    expect(cost).toBeGreaterThan(0);
    s.cash = cost + 10;
    expect(decide(s, 0, snap)).toBe(true);
    expect(s.cash).toBeCloseTo(10);
    expect(p.morale).toBe(90);
    expect(s.story.pending).toBeNull();
    expect(s.story.last).toEqual({ id: "raise", choice: 0, plot: "" });

    s.story.pending = { id: "raise", plot: "", until: 1e9 };
    expect(decide(s, 1, snap)).toBe(true);
    expect(p.morale).toBe(80);
  });

  it("won't take a choice the company can't pay for", () => {
    const { s } = withPlant();
    const snap = snapshot(s);
    s.story.pending = { id: "party", plot: "", until: 1e9 };
    s.cash = 0;
    expect(canChoose(s, 0, snap)).toBe(false);
    expect(decide(s, 0, snap)).toBe(false);
    expect(canChoose(s, 1, snap)).toBe(true);
  });

  it("acts on the plant a decision is about: a night shift boosts it, a storm breaks a machine", () => {
    const { s, id, p } = withPlant();
    const snap = snapshot(s);
    s.story.pending = { id: "overtime", plot: id, until: 1e9 };
    expect(decide(s, 0, snap)).toBe(true);
    expect(p.boost).toBe(90);
    expect(p.morale).toBe(65);
    s.story.pending = { id: "storm", plot: id, until: 1e9 };
    expect(decide(s, 1, snap)).toBe(true);
    expect(p.broken).toBeGreaterThan(0);
    expect(p.breaks).toBe(1);
  });

  it("moves reputation within 0–100", () => {
    const { s } = withPlant();
    const snap = snapshot(s);
    s.quality.rep = 98;
    s.story.pending = { id: "journalist", plot: "", until: 1e9 };
    s.cash = 1e9;
    expect(decide(s, 0, snap)).toBe(true);
    expect(s.quality.rep).toBe(100);
  });
});

describe("the campaign against Kaiser Werke", () => {
  it("opens a chapter only once its goal is met, announces it once, and pays its reward", () => {
    const { s } = withPlant();
    let snap = snapshot(s);
    expect(claimChapter(s, snap)).toBe(false);
    expect(storyWaiting(s, snap)).toBe(false);
    s.lifetime.carsProduced = 25;
    snap = snapshot(s);
    expect(chapterProgress(s, CHAPTERS[0], snap).done).toBe(true);
    expect(storyTick(s, snap)).toBe("chapter");
    expect(storyTick(s, snap)).not.toBe("chapter");
    expect(storyWaiting(s, snap)).toBe(true);
    const cash = s.cash;
    expect(claimChapter(s, snap)).toBe(true);
    expect(s.story.chapter).toBe(1);
    expect(s.cash).toBeGreaterThan(cash);
    expect(claimChapter(s, snap)).toBe(false);
  });

  it("ends with overtaking Kaiser Werke", () => {
    const { s } = withPlant();
    const snap = snapshot(s);
    s.story.chapter = CHAPTERS.length - 1;
    expect(claimChapter(s, snap)).toBe(false);
    s.rivalsBeaten.push("kaiser");
    const stars = s.stars;
    expect(claimChapter(s, snap)).toBe(true);
    expect(s.stars).toBe(stars + 3);
    expect(claimChapter(s, snap)).toBe(false);
  });

  it("keeps the story in the save, and gives older saves a fresh one", () => {
    const { s } = withPlant();
    s.story.chapter = 2;
    s.story.pending = { id: "patent", plot: "", until: 1234 };
    const back = decodeSave(encodeSave(s), T0);
    expect(back.story.chapter).toBe(2);
    expect(back.story.pending).toEqual({ id: "patent", plot: "", until: 1234 });
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.story;
    const fresh = decodeSave(JSON.stringify(old), T0);
    expect(fresh.story.chapter).toBe(0);
    expect(fresh.story.pending).toBeNull();
  });
});

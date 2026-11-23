import { describe, expect, it, vi } from "vitest";
import { SAVE_ACCOUNT_GAP_MS, SAVE_ACCOUNT_MAX_ASKS, SAVE_ACCOUNT_PLAY_SECONDS, markAsked, readAsked, saveAccountDue, stopAskingToSave } from "@/lib/save-account-ask";

const base = { guest: true, pendingEmail: false, ready: true, playTime: 0, carsProduced: 1, now: 10 * SAVE_ACCOUNT_GAP_MS, asked: { at: 0, n: 0 } };

describe("the card that asks a guest to add an email", () => {
  it("asks after the first car", () => {
    expect(saveAccountDue(base)).toBe(true);
  });
  it("asks after 20 minutes of play, even before the first car", () => {
    expect(saveAccountDue({ ...base, carsProduced: 0, playTime: SAVE_ACCOUNT_PLAY_SECONDS - 1 })).toBe(false);
    expect(saveAccountDue({ ...base, carsProduced: 0, playTime: SAVE_ACCOUNT_PLAY_SECONDS })).toBe(true);
  });
  it("never asks a registered player, one whose email is waiting to be confirmed, or before the game runs", () => {
    expect(saveAccountDue({ ...base, guest: false })).toBe(false);
    expect(saveAccountDue({ ...base, pendingEmail: true })).toBe(false);
    expect(saveAccountDue({ ...base, ready: false })).toBe(false);
  });
  it("asks again a day after \"Later\", three times at most", () => {
    const at = base.now - SAVE_ACCOUNT_GAP_MS + 1;
    expect(saveAccountDue({ ...base, asked: { at, n: 1 } })).toBe(false);
    expect(saveAccountDue({ ...base, asked: { at: at - 2, n: 1 } })).toBe(true);
    expect(saveAccountDue({ ...base, asked: { at: 0, n: SAVE_ACCOUNT_MAX_ASKS } })).toBe(false);
  });
});

describe("what the phone remembers", () => {
  it("stops asking for good once the player added an email", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    try {
      expect(readAsked()).toEqual({ at: 0, n: 0 });
      markAsked(5);
      expect(readAsked()).toEqual({ at: 5, n: 1 });
      stopAskingToSave();
      expect(readAsked().n).toBe(SAVE_ACCOUNT_MAX_ASKS);
      expect(saveAccountDue({ ...base, asked: readAsked() })).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

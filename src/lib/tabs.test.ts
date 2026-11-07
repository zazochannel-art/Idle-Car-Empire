import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimTab, TABS, TABS_CHANNEL, type TabChannel, type TabLocks } from "./tabs";

/**
 * Fake BroadcastChannels: what one posts reaches every other open one (a copy of it, a moment
 * later), as in a browser; a copy busy drawing its map gets its messages `busyMs` late.
 */
function channels() {
  const open = new Map<TabChannel, number>();
  return (busyMs = 0) => {
    const ch: TabChannel = {
      onmessage: null,
      postMessage(data) {
        for (const [other, late] of open) if (other !== ch) setTimeout(() => open.has(other) && other.onmessage?.({ data: structuredClone(data) } as MessageEvent), late);
      },
      close: () => void open.delete(ch),
    };
    open.set(ch, busyMs);
    return ch;
  };
}

/** Fake Web Locks, one browser's: a lock is held until its holder lets it go. */
function webLocks(): TabLocks & { held: string[] } {
  const held: string[] = [];
  return {
    held,
    query: async () => ({ held: held.map((name) => ({ name })) }),
    request: async (name, _options, hold) => {
      held.push(name);
      await hold();
      held.splice(held.indexOf(name), 1);
    },
  };
}

/** The save every copy writes to (one localStorage key). */
let saved: { by: string; at: number } | null = null;

/**
 * A copy of the game as the store runs it: it saves every 5 s; replaced by a newer copy, it saves
 * once (on this device, then the cloud, which takes `cloudMs`; not when it heard too late) and
 * stops for good.
 */
function copy(name: string, channel: TabChannel, locks: TabLocks | null, cloudMs = 300) {
  let stopped = false;
  let flushed = false;
  let saves = 0;
  const save = () => {
    if (stopped) return;
    saved = { by: name, at: Date.now() };
    saves++;
  };
  const loop = setInterval(save, 5_000);
  const claim = claimTab({
    channel,
    locks,
    id: name,
    onReplaced: async (late) => {
      if (!late) save();
      stopped = true;
      clearInterval(loop);
      if (late) return;
      await new Promise((r) => setTimeout(r, cloudMs));
      flushed = true;
    },
  })!;
  return {
    claim,
    get stopped() {
      return stopped;
    },
    get flushed() {
      return flushed;
    },
    get saves() {
      return saves;
    },
  };
}

/** Whether `ready` resolves within the fake time given. */
async function readyWithin(ready: Promise<void>, ms: number) {
  let done = false;
  void ready.then(() => (done = true));
  await vi.advanceTimersByTimeAsync(ms);
  return done;
}

beforeEach(() => {
  vi.useFakeTimers();
  saved = null;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("one copy of the game at a time", () => {
  it("the older copy saves once and stops; the newer keeps saving", async () => {
    const [open, locks] = [channels(), webLocks()];
    const a = copy("a", open(), locks);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(saved?.by).toBe("a");

    const before = a.saves;
    const started = Date.now();
    const b = copy("b", open(), locks);
    // the older copy heard it: one last save, then nothing more from it
    await vi.advanceTimersByTimeAsync(10);
    expect(a.stopped).toBe(true);
    expect(a.claim.replaced).toBe(true);
    expect(a.saves).toBe(before + 1);
    expect(saved).toEqual({ by: "a", at: started });
    expect(b.claim.replaced).toBe(false);

    for (let i = 1; i <= 6; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
      expect(saved).toEqual({ by: "b", at: started + i * 5_000 });
    }
    expect([a.saves, b.saves]).toEqual([before + 1, 6]);
    expect(b.stopped).toBe(false);
    // the stopped copy let go of its lock: only the newer one is running
    expect(locks.held).toEqual([TABS_CHANNEL]);
  });

  it("the newer copy reads the save only after the older one's last save reached the cloud", async () => {
    const [open, locks] = [channels(), webLocks()];
    const a = copy("a", open(), locks, 1_500);
    await vi.advanceTimersByTimeAsync(3_000);
    const b = copy("b", open(), locks);
    expect(await readyWithin(b.claim.ready, 1_400)).toBe(false);
    expect(a.flushed).toBe(false);
    expect(await readyWithin(b.claim.ready, 200)).toBe(true);
    expect(a.flushed).toBe(true);
  });

  it("an older copy too busy to answer at once is still waited for", async () => {
    const [open, locks] = [channels(), webLocks()];
    // its messages come a second late: far past the answer window of a browser without Web Locks
    const a = copy("a", open(1_000), locks);
    await vi.advanceTimersByTimeAsync(3_000);
    const b = copy("b", open(), locks);
    expect(await readyWithin(b.claim.ready, 1_100)).toBe(false);
    expect(a.stopped).toBe(true);
    expect(await readyWithin(b.claim.ready, 400)).toBe(true);
    expect(a.flushed).toBe(true);
  });

  it("an older copy that hears of the newer one too late stops without its last save", async () => {
    const [open, locks] = [channels(), webLocks()];
    // stuck for seconds (or frozen, and back): the newer copy has stopped waiting by then
    const a = copy("a", open(TABS.saveMs + 500), locks);
    await vi.advanceTimersByTimeAsync(7_000);
    const before = a.saves;
    const b = copy("b", open(), locks);
    expect(await readyWithin(b.claim.ready, TABS.saveMs)).toBe(true);
    expect(a.stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    // its loop's save before it heard (a stuck page's timers may run first), then nothing: not even the last save
    expect(a.stopped).toBe(true);
    expect(a.claim.replaced).toBe(true);
    expect(a.saves).toBe(before + 1);
    expect(a.flushed).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(a.saves).toBe(before + 1);
    expect(saved?.by).toBe("b");
  });

  it("alone, the start doesn't wait", async () => {
    const a = copy("a", channels()(), webLocks());
    expect(await readyWithin(a.claim.ready, 0)).toBe(true);
    expect(a.claim.replaced).toBe(false);
  });

  it("without Web Locks, the start gives older copies the answer window", async () => {
    const open = channels();
    const a = copy("a", open(), null);
    expect(await readyWithin(a.claim.ready, TABS.answerMs - 1)).toBe(false);
    expect(await readyWithin(a.claim.ready, 1)).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    // one that answers within it is waited for, until its last save is done
    const b = copy("b", open(), null);
    expect(await readyWithin(b.claim.ready, 300)).toBe(false);
    expect(await readyWithin(b.claim.ready, 10)).toBe(true);
    expect([a.stopped, a.flushed]).toEqual([true, true]);
  });

  it("a last save slower than saveMs (a busy page, a slow connection) is still waited for", async () => {
    const [open, locks] = [channels(), webLocks()];
    const a = copy("a", open(), locks, TABS.saveMs + 2_000);
    await vi.advanceTimersByTimeAsync(1_000);
    const b = copy("b", open(), locks);
    expect(await readyWithin(b.claim.ready, TABS.saveMs + 1_000)).toBe(false);
    expect(a.flushed).toBe(false);
    expect(await readyWithin(b.claim.ready, 1_100)).toBe(true);
    expect(a.flushed).toBe(true);
  });

  it("a cloud save that hangs holds the newer copy up no longer than lastSaveMs", async () => {
    const [open, locks] = [channels(), webLocks()];
    copy("a", open(), locks, 60_000);
    await vi.advanceTimersByTimeAsync(1_000);
    const b = copy("b", open(), locks);
    expect(await readyWithin(b.claim.ready, TABS.lastSaveMs - 1)).toBe(false);
    expect(await readyWithin(b.claim.ready, 1)).toBe(true);
  });

  it("an older copy that never answers holds the newer one up no longer than saveMs", async () => {
    const [open, locks] = [channels(), webLocks()];
    // (it holds the lock but its page is frozen: no message comes back)
    copy("a", open(60_000), locks);
    await vi.advanceTimersByTimeAsync(1_000);
    const b = copy("b", open(), locks);
    expect(await readyWithin(b.claim.ready, TABS.saveMs - 1)).toBe(false);
    expect(await readyWithin(b.claim.ready, 1)).toBe(true);
  });

  it("two copies started at the same moment agree on which one stops", async () => {
    vi.setSystemTime(1_000_000);
    const [open, locks] = [channels(), webLocks()];
    // both channels open before either hello arrives: each hears the other
    const a = copy("a", open(), locks);
    const b = copy("b", open(), locks);
    await vi.advanceTimersByTimeAsync(10_000);
    expect([a.stopped, b.stopped]).toEqual([true, false]);
    expect(saved?.by).toBe("b");
  });

  it("each newer copy stops the one before it; one that already stopped stays quiet", async () => {
    const [open, locks] = [channels(), webLocks()];
    const a = copy("a", open(), locks);
    await vi.advanceTimersByTimeAsync(1_000);
    const b = copy("b", open(), locks);
    await vi.advanceTimersByTimeAsync(1_000);
    const c = copy("c", open(), locks);
    // only b was still running: c waits for b's last save, not for a's
    expect(await readyWithin(c.claim.ready, 310)).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect([a.stopped, b.stopped, c.stopped]).toEqual([true, true, false]);
    expect(saved?.by).toBe("c");
    expect(locks.held).toEqual([TABS_CHANNEL]);
  });

  it("does nothing where there is no BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    expect(claimTab({ onReplaced: () => {} })).toBeNull();
    expect(claimTab({ onReplaced: () => {}, channel: null })).toBeNull();
  });
});

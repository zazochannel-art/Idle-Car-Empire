// One copy of the game at a time. Open in two tabs or windows (or, after the app is relaunched,
// in two web views), the game had two companies in memory, each saving over the other every few
// seconds: what the player did in one was lost at the other's next save, and the cloud got
// whichever saved last. So each copy says hello on a BroadcastChannel as it starts (a random id
// and its start time), and the newest wins: an older copy that hears it saves once and stops for
// good (the game then says it is open elsewhere, with "Play here"), and the newer one waits for
// that last save before it reads its own. Where there is no BroadcastChannel nothing changes.
//
// How long to wait: each running copy also holds a shared Web Lock, which the browser keeps for it
// until it stops or its page goes, so a new copy knows how many older ones there are without
// asking them. Alone, it doesn't wait at all; with older copies, it waits for each one's last save,
// however busy that copy is drawing its map. Without Web Locks it gives them a short while to answer.
// An older copy that hears the hello only when the newer one has stopped waiting (a frozen tab come
// back, a page stuck for seconds) stops without that last save: the newer one has read the save by
// then, and would find it written over.

/** The channel (and lock) every copy of the game on this site shares. */
export const TABS_CHANNEL = "idle-car-empire";

export const TABS = {
  /** Without Web Locks: how long older copies have to answer a newer one's hello (ms); alone, the start waits this long. */
  answerMs: 250,
  /** The longest the newer copy waits for older ones' last saves (ms): a frozen tab or a cloud save that hangs doesn't hold the game up. */
  saveMs: 4_000,
  /** A hello heard this long after it was said is too late for a last save (ms): it would land as the newer copy reads, or after. */
  lateMs: 3_000,
};

/** The part of a BroadcastChannel used here (the tests pass their own). */
export interface TabChannel {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((e: MessageEvent) => void) | null;
}

/** The part of the Web Locks API used here (the tests pass their own). */
export interface TabLocks {
  query(): Promise<{ held?: { name?: string }[] }>;
  request(name: string, options: { mode: "shared" }, hold: () => Promise<void>): Promise<unknown>;
}

type TabMessage =
  /** A copy starts. */
  | { type: "hello"; id: string; at: number }
  /** An older copy heard `to`'s hello: it is saving its last state. */
  | { type: "stopping"; id: string; to: string }
  /** That last save is done: the copy has stopped. */
  | { type: "stopped"; id: string };

export interface TabOptions {
  /**
   * A newer copy started: save once and stop for good (the newer copy waits for the promise, up to
   * `saveMs`). `late`: heard too late for that last save, stop without it.
   */
  onReplaced: (late: boolean) => Promise<void> | void;
  /** The channel (default: a BroadcastChannel; null: none, nothing to coordinate). */
  channel?: TabChannel | null;
  /** The locks that tell how many copies run (default: the browser's; null: none). */
  locks?: TabLocks | null;
  id?: string;
  now?: () => number;
  answerMs?: number;
  saveMs?: number;
  lateMs?: number;
}

export interface TabClaim {
  /** Resolves once older copies, if any, have saved for the last time and stopped (or were too slow to say so). */
  ready: Promise<void>;
  /** A newer copy took over: this one has stopped. */
  readonly replaced: boolean;
}

function openChannel(): TabChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(TABS_CHANNEL);
  } catch {
    // blocked (a sandboxed page): one copy can't hear another, as before
    return null;
  }
}

/** The browser's Web Locks (none on a page that isn't https, or in an older browser). */
const browserLocks = (): TabLocks | null => (typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null);

/** Whether `a` started after `b` (the same moment: the larger id, so two copies always agree on which is newer). */
const newer = (a: { id: string; at: number }, b: { id: string; at: number }) => a.at > b.at || (a.at === b.at && a.id > b.id);

/** Says this copy started: older copies stop, and a newer one later stops this one. Null without a channel. */
export function claimTab(opts: TabOptions): TabClaim | null {
  const channel = opts.channel === undefined ? openChannel() : opts.channel;
  if (!channel) return null;
  const locks = opts.locks === undefined ? browserLocks() : opts.locks;
  const now = opts.now ?? Date.now;
  const me = { id: opts.id ?? Math.random().toString(36).slice(2), at: now() };
  /** Older copies that answered the hello and are still saving, and those that have stopped. */
  const saving = new Set<string>();
  const stopped = new Set<string>();
  let replaced = false;
  /** Stopped: the lock goes as soon as this copy holds it. */
  let gone = false;
  let release = () => {};
  let settle = () => {};

  // how many copies run already (each holds the lock while it runs), then this one holds it too
  const running = (async () => {
    if (!locks) return null;
    try {
      const { held = [] } = await locks.query();
      return held.filter((l) => l.name === TABS_CHANNEL).length;
    } catch {
      return null;
    } finally {
      try {
        const hold = () => new Promise<void>((r) => (gone ? r() : (release = r)));
        void locks.request(TABS_CHANNEL, { mode: "shared" }, hold).catch(() => {});
      } catch {
        // no lock: copies after this one wait a short while instead
      }
    }
  })();

  const ready = new Promise<void>((resolve) => {
    const cap = setTimeout(resolve, opts.saveMs ?? TABS.saveMs);
    /** Without locks: whether older copies may still answer. */
    let answering = true;
    void running.then((others) => {
      settle = () => {
        const done = others === null ? !answering && !saving.size : stopped.size >= others && !saving.size;
        if (!done) return;
        clearTimeout(cap);
        resolve();
      };
      if (others === null)
        setTimeout(() => {
          answering = false;
          settle();
        }, opts.answerMs ?? TABS.answerMs);
      settle();
    });
  });
  const send = (m: TabMessage) => {
    try {
      channel.postMessage(m);
    } catch {
      // closed meanwhile: nobody to tell
    }
  };

  channel.onmessage = (e) => {
    const m = e.data as TabMessage | null;
    if (!m || typeof m !== "object" || m.id === me.id) return;
    if (m.type === "hello") {
      if (!newer(m, me)) return;
      // (a copy already stopping answers a still newer one too: that one waits for the same last save)
      send({ type: "stopping", id: me.id, to: m.id });
      if (replaced) return;
      replaced = true;
      // (the copies share the device's clock)
      const late = now() - m.at > (opts.lateMs ?? TABS.lateMs);
      void (async () => {
        try {
          await opts.onReplaced(late);
        } catch {
          // stopped all the same
        }
        send({ type: "stopped", id: me.id });
        channel.close();
        // no longer running: copies started after this don't wait for it
        gone = true;
        release();
      })();
    } else if (m.type === "stopping" && m.to === me.id) saving.add(m.id);
    else if (m.type === "stopped") {
      saving.delete(m.id);
      stopped.add(m.id);
      settle();
    }
  };
  send({ type: "hello", ...me });

  return {
    ready,
    get replaced() {
      return replaced;
    },
  };
}

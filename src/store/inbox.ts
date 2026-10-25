"use client";

import { create } from "zustand";
import type { NoticeKind } from "@/game/types";
import type { UiToastAction } from "./events";

/** A notice that came on its own (a client's offer, a breakdown, a race…), kept for the notification center. */
export interface Notice {
  id: number;
  at: number;
  kind: NoticeKind;
  tone: "success" | "gold" | "info" | "warn";
  title: string;
  body?: string;
  icon?: string;
  action?: UiToastAction;
}

const KEY = "idle-car-empire:inbox";
/** The newest notices kept, and for how long. */
const MAX = 60;
const KEEP_MS = 24 * 3600_000;

interface InboxStore {
  items: Notice[];
  /** Notices that did not show on screen (their kind is off) since the center was last opened. */
  unread: number;
  add: (n: Omit<Notice, "id" | "at">, shown: boolean) => void;
  markRead: () => void;
  clear: () => void;
}

/** This device's notices from before (the list is a convenience: it may come back empty). */
function load(): { items: Notice[]; unread: number } {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const saved = raw ? (JSON.parse(raw) as { items?: Notice[]; unread?: number }) : null;
    const since = Date.now() - KEEP_MS;
    const items = Array.isArray(saved?.items) ? saved.items.filter((n) => n && typeof n.title === "string" && typeof n.at === "number" && n.at > since).slice(-MAX) : [];
    const unread = typeof saved?.unread === "number" ? Math.max(0, Math.min(items.length, Math.floor(saved.unread))) : 0;
    return { items, unread };
  } catch {
    return { items: [], unread: 0 };
  }
}

function keep(items: Notice[], unread: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ items, unread }));
  } catch {
    // private mode or storage full: the list lives for this session only
  }
}

let nextId = Date.now();

export const useInbox = create<InboxStore>((set, get) => ({
  ...load(),
  add: (n, shown) => {
    const items = [...get().items, { ...n, id: ++nextId, at: Date.now() }].slice(-MAX);
    const unread = Math.min(items.length, get().unread + (shown ? 0 : 1));
    set({ items, unread });
    keep(items, unread);
  },
  markRead: () => {
    if (!get().unread) return;
    set({ unread: 0 });
    keep(get().items, 0);
  },
  clear: () => {
    set({ items: [], unread: 0 });
    keep([], 0);
  },
}));

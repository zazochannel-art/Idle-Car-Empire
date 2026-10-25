import type { NoticeKind } from "../types";

/**
 * The kinds of notices that come on their own (a client's offer, a breakdown, a race result…),
 * in the order the notification center lists its filters. A notice that answers the player's
 * own tap has no kind: it always shows.
 */
export const NOTICE_KINDS: NoticeKind[] = ["clients", "problems", "racing", "progress", "events"];

export const NOTICE_ICON: Record<NoticeKind, string> = {
  clients: "🤝",
  problems: "⚠️",
  racing: "🏁",
  progress: "🏗️",
  events: "📰",
};

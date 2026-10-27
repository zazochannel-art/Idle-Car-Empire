// The "what's new" card shown once after an update (components/game/whats-new.tsx): what the
// release brought, each with the screen it lives on. A new release gets a new id; a company
// started on this version never sees it (it has nothing to compare with).
export interface NewsItem {
  icon: string;
  /** whatsNew.item.<key> (title) and whatsNew.item.<key>Body. */
  key: string;
  /** Where its button goes: a screen, or the settings. */
  view?: "landmarks" | "stock" | "managers" | "inbox" | "world";
  settings?: true;
}

export const WHATS_NEW: { id: string; items: NewsItem[] } = {
  id: "1.0.6",
  items: [
    { icon: "🏔️", key: "cities", view: "world" },
    { icon: "🏗️", key: "landmarks", view: "landmarks" },
    { icon: "📈", key: "stock", view: "stock" },
    { icon: "🔧", key: "crew", view: "managers" },
    { icon: "🔔", key: "inbox", view: "inbox" },
    { icon: "🤖", key: "auto", settings: true },
    { icon: "💰", key: "money" },
  ],
};

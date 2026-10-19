"use client";

// The shop (the HUD's top-left button): a free crate every 4 hours, a mystery box
// and packs for a rewarded ad (the reward comes only once the ad was watched to
// the end), and items for ⭐ Stars. Nothing in it costs real money.
import { playAd } from "@/components/game/ad-buttons";
import { Button } from "@/components/ui/button";
import { ADS } from "@/game/config/ads";
import { SHOP, SHOP_ITEMS, SHOP_ITEM_BY_ID, type ShopItem, type ShopTone } from "@/game/config/shop";
import { adsToday, buildWait } from "@/game/engine/ads";
import { remainingOf } from "@/game/engine/construction";
import type { EconomySnapshot } from "@/game/engine/economy";
import { rewardCash } from "@/game/engine/progress";
import { crateWait, longestJob, packsToday, shopBlock, shopReward, type ShopBlock } from "@/game/engine/shop";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { GameState } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { useAdStatus } from "@/lib/ads";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { ViewHeader } from "./section-title";

type T = ReturnType<typeof useT>["t"];

/** Each card's colours: its glow, the icon's tile, the reward's lettering. */
const TONES: Record<ShopTone, { card: string; icon: string; value: string }> = {
  gold: { card: "from-gold/25 ring-gold/40", icon: "bg-gold/20 ring-gold/40", value: "text-gold" },
  green: { card: "from-go/25 ring-go/35", icon: "bg-go/20 ring-go/40", value: "text-lime" },
  blue: { card: "from-electric/30 ring-electric/40", icon: "bg-electric/25 ring-electric/45", value: "text-cyan-glow" },
  orange: { card: "from-orange-500/25 ring-orange-400/35", icon: "bg-orange-500/20 ring-orange-400/40", value: "text-orange-300" },
  yellow: { card: "from-amber-400/20 ring-amber-300/35", icon: "bg-amber-400/20 ring-amber-300/40", value: "text-amber-200" },
  purple: { card: "from-epic/35 ring-violet-400/40", icon: "bg-epic/30 ring-violet-400/45", value: "text-violet-300" },
  cyan: { card: "from-cyan-400/20 ring-cyan-300/30", icon: "bg-cyan-400/15 ring-cyan-300/35", value: "text-cyan-200" },
  pink: { card: "from-fuchsia-500/30 ring-fuchsia-400/40", icon: "bg-fuchsia-500/25 ring-fuchsia-400/45", value: "text-fuchsia-200" },
};

const TAGS: Record<NonNullable<ShopItem["tag"]>, string> = {
  daily: "bg-fuchsia-500 text-white",
  best: "bg-gold text-[#2a1d00]",
  save: "bg-go text-white",
};

export function ShopView() {
  const state = useGame((g) => g.view.state);
  const { t } = useT();
  const ads = SHOP_ITEMS.filter((i) => i.price === "ad");
  const stars = SHOP_ITEMS.filter((i) => typeof i.price === "number");

  return (
    <div className="space-y-4">
      <ViewHeader icon="🛒" title={t("nav.shop")} subtitle={t("shop.subtitle")} />
      {/* what there is to spend: Stars, and today's ads */}
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-gold/10 px-3 py-2 ring-1 ring-gold/35">
          <span className="text-xl">⭐</span>
          <span className="text-lg font-black tabular-nums text-gold">{formatNumber(state.stars, 0)}</span>
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/10">
          <span className="text-xl">📺</span>
          <span className="text-xs font-bold leading-tight text-white/70">{t("shop.adsToday", { n: adsToday(state, state.lastActiveAt), max: ADS.perDay })}</span>
        </div>
      </div>
      <CrateHero />
      <Section title={t("shop.ads")} icon="📺" items={ads} />
      <Section title={t("shop.stars")} icon="⭐" items={stars} right={<span className="text-xs font-black text-gold">{t("shop.have", { n: formatNumber(state.stars, 0) })}</span>}>
        <p className="px-1 text-[11px] text-white/45">{t("shop.starsHow")}</p>
      </Section>
      <p className="px-1 text-center text-[11px] text-white/40">{t("shop.footer")}</p>
    </div>
  );
}

/** The free crate, up top: big and glowing when it's ready, a bar filling up until the next one. */
function CrateHero() {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const { shopBuy } = useGame.getState();
  const { t } = useT();
  // the game's clock: the crate counts down with it
  const wait = crateWait(state, state.lastActiveAt);
  const ready = wait === 0;
  const r = shopReward("crate", snap);
  const filled = Math.min(100, (1 - wait / SHOP.crateEvery) * 100);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-4 ring-1",
        ready ? "bg-gradient-to-br from-gold/35 via-orange-500/20 to-transparent shadow-[0_0_28px_-6px_rgba(255,194,26,0.55)] ring-gold/60" : "bg-gradient-to-br from-white/[0.08] to-transparent ring-white/10",
      )}
    >
      {ready && <div className="pointer-events-none absolute -left-10 -top-10 size-44 rounded-full bg-gold/25 blur-2xl" />}
      <div className="relative flex items-center gap-4">
        <span className={cn("flex size-20 shrink-0 items-center justify-center rounded-2xl text-5xl ring-1", ready ? "animate-[shop-bob_1.6s_ease-in-out_infinite] bg-gold/25 ring-gold/50" : "bg-white/[0.06] ring-white/10")}>
          {SHOP_ITEM_BY_ID.crate.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gold/90">{ready ? t("shop.crateReady") : t("shop.free")}</div>
          <div className="text-lg font-black leading-tight">{t("shop.item.crate")}</div>
          <div className="text-[11px] text-white/55">{t("shop.desc.crate")}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[12px] font-black tabular-nums">
            <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-lime">💵 {formatMoney(rewardCash(r, snap))}</span>
            <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-cyan-glow">🔬 {t("shop.rp", { n: formatNumber(r.rp ?? 0, 0) })}</span>
          </div>
        </div>
      </div>
      <div className="relative mt-3">
        {ready ? (
          <Button variant="gold" size="lg" className="w-full" onClick={() => shopBuy("crate")}>
            🎁 {t("shop.open")}
          </Button>
        ) : (
          <div className="space-y-1">
            <div className="h-2.5 overflow-hidden rounded-full bg-black/35">
              <div className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold transition-all" style={{ width: `${filled}%` }} />
            </div>
            <div className="text-center text-xs font-bold tabular-nums text-white/60">{t("shop.crateNext", { time: formatDuration(wait / 1000) })}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, right, items, children }: { title: string; icon: string; right?: React.ReactNode; items: ShopItem[]; children?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wider text-white/75">
          <span>{icon}</span>
          {title}
        </span>
        {right}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((i) => (
          <ShopCard key={i.id} item={i} />
        ))}
      </div>
      {children}
    </div>
  );
}

/** The card's big line: what the item gives, at a glance (the name already says for how long). */
function headline(item: ShopItem, s: GameState, snap: EconomySnapshot, t: T): string {
  switch (item.id) {
    case "box":
      return t("shop.surprise");
    case "boost":
    case "boostLong":
      return `×${ADS.boostMult}`;
    case "build": {
      // the time it saves
      const plot = longestJob(s);
      return plot ? `⚡ −${formatDuration(remainingOf(s, plot))}` : "";
    }
    default: {
      const r = shopReward(item.id, snap);
      return [r.incomeSeconds ? `+${formatMoney(rewardCash(r, snap))}` : "", r.rp ? `+${t("shop.rp", { n: formatNumber(r.rp, 0) })}` : ""].filter(Boolean).join(" ");
    }
  }
}

function buttonLabel(item: ShopItem, block: ShopBlock, ready: boolean, s: GameState, t: T): string {
  if (block === "wait") return t("shop.in", { time: formatDuration(buildWait(s, s.lastActiveAt) / 1000) });
  if (block === "limit") return t("shop.limit");
  if (block === "active") return `${t("shop.active")} · ${formatDuration(s.ads.boostLeft)}`;
  if (block === "full") return t("shop.full");
  if (block === "nothing") return t("shop.nothing");
  if (item.price === "free") return t("shop.open");
  if (item.price === "ad") return ready ? `📺 ${t("shop.watch")}` : t("shop.noAd");
  return `⭐ ${item.price}`;
}

/** What the mystery box can hold, as little icons. */
const boxIcon = (p: (typeof SHOP.box)[number]) => (p.stars ? "⭐" : p.rpSeconds ? "🔬" : (p.incomeSeconds ?? 0) > 3600 ? "💰" : "💵");

function ShopCard({ item }: { item: ShopItem }) {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const { shopBuy } = useGame.getState();
  const { t } = useT();
  const ad = useAdStatus();
  // the game's clock: the pauses count down with it
  const now = state.lastActiveAt;
  const block = shopBlock(state, item.id, now);
  const big = headline(item, state, snap, t);
  const packs = item.id === "cash" || item.id === "research" ? SHOP.packsPerDay - packsToday(state, item.id, now) : null;
  const ready = !block && (item.price !== "ad" || (ad.ready && !ad.showing));
  const tone = TONES[item.tone];

  const buy = () => {
    if (item.price === "ad") void playAd(() => useGame.getState().shopBuy(item.id), t);
    else shopBuy(item.id);
  };

  const button = (
    <Button size="sm" variant={!ready ? "locked" : item.price === "ad" ? "go" : "gold"} disabled={!ready} className={cn("tabular-nums", item.wide ? "w-28 shrink-0" : "mt-2 w-full")} onClick={buy}>
      {buttonLabel(item, block, ready, state, t)}
    </Button>
  );
  const prizes = item.id === "box" && (
    <div className={cn("mt-1 flex gap-1 text-sm", !item.wide && "justify-center")} aria-hidden>
      {SHOP.box.map((p, i) => (
        <span key={i} className="rounded-md bg-black/25 px-1">
          {boxIcon(p)}
        </span>
      ))}
    </div>
  );

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-b to-white/[0.03] ring-1", tone.card, item.wide ? "col-span-2 flex items-center gap-3 p-3" : "flex flex-col p-2.5 pt-3")}>
      {item.tag && <span className={cn("absolute right-0 top-0 rounded-bl-xl px-2 py-0.5 text-[10px] font-black uppercase tracking-wide shadow", TAGS[item.tag])}>{t(`shop.tag.${item.tag}` as MessageKey)}</span>}
      <span className={cn("flex shrink-0 items-center justify-center rounded-2xl ring-1", tone.icon, item.wide ? "size-16 text-[40px]" : "mx-auto size-14 text-[34px]")}>{item.icon}</span>
      <div className={cn("min-w-0 flex-1", item.wide ? "pt-2" : "flex flex-col items-center text-center")}>
        <div className={cn("text-[13px] font-black leading-tight", !item.wide && "mt-2")}>{t(`shop.item.${item.id}` as MessageKey)}</div>
        {big && <div className={cn("mt-0.5 text-[15px] font-black tabular-nums leading-tight", tone.value)}>{big}</div>}
        <div className="mt-1 text-[10.5px] leading-snug text-white/55">{t(`shop.desc.${item.id}` as MessageKey)}</div>
        {prizes}
        {packs !== null && <div className="mt-0.5 text-[10px] font-bold text-white/40">{t("shop.left", { n: Math.max(0, packs) })}</div>}
      </div>
      {button}
    </div>
  );
}

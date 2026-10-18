"use client";

// The shop (the HUD's top-left button): a free crate every 4 hours, packs for a
// rewarded ad (the reward comes only once the ad was watched to the end), and
// items for ⭐ Stars. Nothing in it costs real money.
import { playAd } from "@/components/game/ad-buttons";
import { Button } from "@/components/ui/button";
import { SHOP, SHOP_ITEMS, type ShopItem } from "@/game/config/shop";
import { buildWait } from "@/game/engine/ads";
import { rewardCash } from "@/game/engine/progress";
import { crateWait, packsToday, shopBlock, shopReward } from "@/game/engine/shop";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { useAdStatus } from "@/lib/ads";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { ViewHeader } from "./section-title";

export function ShopView() {
  const stars = useGame((g) => g.view.state.stars);
  const { t } = useT();
  const section = (price: "free" | "ad" | "stars") => SHOP_ITEMS.filter((i) => (price === "stars" ? typeof i.price === "number" : i.price === price));

  return (
    <div className="space-y-4">
      <ViewHeader icon="🛒" title={t("nav.shop")} subtitle={t("shop.subtitle")} />
      <Section title={t("shop.free")} items={section("free")} />
      <Section title={t("shop.ads")} items={section("ad")} />
      <Section title={t("shop.stars")} right={<span className="text-xs font-black text-gold">{t("shop.have", { n: formatNumber(stars, 0) })}</span>} items={section("stars")}>
        <p className="px-1 text-[11px] text-white/45">{t("shop.starsHow")}</p>
      </Section>
      <p className="px-1 text-center text-[11px] text-white/40">{t("shop.footer")}</p>
    </div>
  );
}

function Section({ title, right, items, children }: { title: string; right?: React.ReactNode; items: ShopItem[]; children?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">{title}</span>
        {right}
      </div>
      {items.map((i) => (
        <ShopCard key={i.id} item={i} />
      ))}
      {children}
    </div>
  );
}

function ShopCard({ item }: { item: ShopItem }) {
  const state = useGame((g) => g.view.state);
  const snap = useGame((g) => g.view.snap);
  const { shopBuy } = useGame.getState();
  const { t } = useT();
  const ad = useAdStatus();
  // the game's clock: the crate and the pauses count down with it
  const now = state.lastActiveAt;
  const block = shopBlock(state, item.id, now);
  const r = shopReward(item.id, snap);
  const desc = t(`shop.desc.${item.id}` as MessageKey, { amount: formatMoney(rewardCash(r, snap)), rp: formatNumber(r.rp ?? 0, 0) });
  const packs = item.id === "cash" || item.id === "research" ? SHOP.packsPerDay - packsToday(state, item.id, now) : null;
  const ready = !block && (item.price !== "ad" || (ad.ready && !ad.showing));

  let label: string;
  if (block === "wait") label = t("shop.in", { time: formatDuration((item.id === "crate" ? crateWait(state, now) : buildWait(state, now)) / 1000) });
  else if (block === "limit") label = t("shop.limit");
  else if (block === "active") label = `${t("shop.active")} · ${formatDuration(state.ads.boostLeft)}`;
  else if (block === "full") label = t("shop.full");
  else if (block === "nothing") label = t("shop.nothing");
  else if (item.price === "free") label = t("shop.open");
  else if (item.price === "ad") label = ready ? `📺 ${t("shop.watch")}` : t("shop.noAd");
  else label = `⭐ ${item.price}`;

  const buy = () => {
    if (item.price === "ad") void playAd(() => useGame.getState().shopBuy(item.id), t);
    else shopBuy(item.id);
  };

  return (
    <div className={cn("flex items-center gap-3 rounded-2xl p-3 ring-1", item.id === "crate" && ready ? "bg-gold/10 ring-gold/50" : "bg-white/[0.04] ring-white/[0.07]")}>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-3xl">{item.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-black">{t(`shop.item.${item.id}` as MessageKey)}</div>
        <div className="text-[11px] leading-snug text-white/60">{desc}</div>
        {packs !== null && <div className="mt-0.5 text-[10px] font-bold text-white/40">{t("shop.left", { n: Math.max(0, packs) })}</div>}
      </div>
      <Button size="sm" variant={!ready ? "locked" : item.price === "ad" ? "go" : "gold"} disabled={!ready} className="min-w-[5.5rem] shrink-0 tabular-nums" onClick={buy}>
        {label}
      </Button>
    </div>
  );
}

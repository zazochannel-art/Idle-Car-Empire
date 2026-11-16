// Offline income, maintenance, shares, standing orders and Stars.
// Part of the game store (store/game-store.ts): the actions only, sharing its helpers through StoreCtx.
import * as Mt from "@/game/engine/maintenance";
import * as St from "@/game/engine/stock";
import { buyStarUpgrade, imperium as doImperium } from "@/game/engine/imperium";
import { collectOffline } from "@/game/engine/offline";
import { formatMoney } from "@/game/format";
import { maybeAskForReview } from "@/lib/review";
import { uiEvents } from "../events";
import type { GameStore, StoreCtx } from "../game-store";

type Keys = "collectOffline" | "buyMaintenance" | "sellShares" | "buyBackShares" | "setAutoRecall" | "setAutoDecide" | "seenWhatsNew" | "setToastOff" | "imperium" | "buyStarUpgrade";

export function companyActions({ get, act, persist, tr }: StoreCtx): Pick<GameStore, Keys> {
  return {
  collectOffline: () => {
    // what reaches the wallet (the shareholders take their part: engine/stock.ts)
    let amount = 0;
    act((s) => {
      if (!s.pendingOffline) return false;
      amount = collectOffline(s);
      return true;
    });
    if (amount > 0) uiEvents.emit({ type: "toast", tone: "gold", icon: "💰", title: tr("toast.collected", { amount: formatMoney(amount) }), body: tr("toast.collectedBody") });
    persist(true);
    // a good moment for the store's rating card (lib/review.ts decides whether it is due)
    if (amount > 0) setTimeout(() => void maybeAskForReview(get().state), 1500);
  },
  buyMaintenance: () => {
    const ok = act((s) => Mt.upgradeMaintenance(s, get().snap));
    if (ok) {
      uiEvents.emit({ type: "toast", tone: "success", icon: "🔧", title: tr("crew.hiredToast", { n: get().state.maintenance.level }) });
      persist(true);
    }
    return ok;
  },
  sellShares: () => {
    const cash = act((s) => St.sellShares(s, get().snap));
    if (cash > 0) {
      uiEvents.emit({ type: "toast", tone: "gold", icon: "📈", title: tr("stock.soldToast", { money: formatMoney(cash) }), body: tr("stock.soldToastBody", { pct: Math.round(get().state.stock.sold * 100) }) });
      persist(true);
    }
    return cash > 0;
  },
  buyBackShares: () => {
    const ok = act((s) => St.buyBack(s, get().snap));
    if (ok) {
      uiEvents.emit({ type: "toast", tone: "success", icon: "🏦", title: tr("stock.boughtToast", { pct: Math.round(get().state.stock.sold * 100) }) });
      persist(true);
    }
    return ok;
  },
  setAutoRecall: (policy) => {
    act((s) => {
      s.settings.autoRecall = policy;
      return true;
    });
    persist(true);
  },
  setAutoDecide: (key, on) => {
    act((s) => {
      s.settings[key] = on;
      return true;
    });
    persist(true);
  },
  seenWhatsNew: (id) => {
    act((s) => {
      s.settings.whatsNew = id;
      return true;
    });
    persist(true);
  },
  setToastOff: (kind, off) => {
    act((s) => {
      const list = s.settings.toastsOff.filter((k) => k !== kind);
      s.settings.toastsOff = off ? [...list, kind] : list;
      return true;
    });
    persist(true);
  },
  imperium: () => {
    const gained = act((s) => doImperium(s));
    if (gained > 0) {
      uiEvents.emit({ type: "imperium", stars: gained });
      persist(true);
    }
  },
  buyStarUpgrade: (id) => {
    const ok = act((s) => buyStarUpgrade(s, id));
    if (ok) persist(true);
    return ok;
  },
  };
}

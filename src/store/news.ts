// The news of a game step (engine/session.ts) as the player sees it: toasts, fireworks, the race
// viewer. Nothing here changes the game; the store calls it after each step.
import { CAR_BY_ID } from "@/game/config/cars";
import { CITIES } from "@/game/config/cities";
import { STRUCTURE_BY_ID } from "@/game/config/city";
import { EDITION } from "@/game/config/collection";
import { RESCUE } from "@/game/config/economy";
import { ENGINEER_BY_ID, type EngineerId } from "@/game/config/expansion";
import { landmarkIn } from "@/game/config/landmarks";
import { HOT_CLASS, RECALL } from "@/game/config/market";
import { DILEMMA_BY_ID, RIVAL_CEO } from "@/game/config/story";
import { landmarkLotId } from "@/game/city/landmark-lots";
import { RACING } from "@/game/city/layout";
import { SEASON_ICON } from "@/game/engine/season";
import type { News } from "@/game/engine/session";
import { formatMoney, formatPercent } from "@/game/format";
import type { GameEvent, GameState } from "@/game/types";
import { translate, type MessageKey, type Vars } from "@/i18n";
import { contentFor } from "@/i18n/content";
import { uiEvents } from "./events";


/** What the simulation itself reported (sales, a finished building, a race…). */
function tickNews(e: GameEvent, s: GameState, tr: (key: MessageKey, vars?: Vars) => string) {
  if (e.type === "sale") uiEvents.emit(e);
  else if (e.type === "carBuilt" && e.first) uiEvents.emit({ type: "firstCar", plot: e.plot, car: e.car });
  else if (e.type === "built") {
    // a finished upgrade has no toast (with many plants they covered the map); a new building does
    if (!e.upgrade) {
      uiEvents.emit({
        type: "toast",
        kind: "progress",
        tone: "gold",
        icon: STRUCTURE_BY_ID[e.structure].emoji,
        title: tr("toast.constructionDone", { name: tr(`structure.${e.structure}`) }),
        body: tr("toast.constructionDoneBody"),
        action: { label: tr("toast.open"), plot: e.plot },
      });
    }
    // a round level (5, 10, 15) is worth fireworks over the building
    else if (e.level % 5 === 0) uiEvents.emit({ type: "fireworks", plot: e.plot, big: e.level >= 15 });
  } else if (e.type === "emergency") uiEvents.emit({ type: "toast", kind: "problems", tone: "warn", icon: "🆘", title: tr("toast.emergency"), body: tr("toast.emergencyBody", { money: formatMoney(e.cost) }) });
  else if (e.type === "restructured") uiEvents.emit({ type: "toast", kind: "problems", tone: "warn", icon: "🏦", title: tr("toast.restructured"), body: tr("toast.restructuredBody", { money: formatMoney(e.amount), rep: RESCUE.restructure.rep }) });
  else if (e.type === "suspended") uiEvents.emit({ type: "toast", kind: "problems", tone: "warn", icon: "⛔", title: tr("toast.suspended"), body: tr("toast.suspendedBody") });
  else if (e.type === "breakdown") {
    const b = s.city.buildings[e.plot];
    if (b) uiEvents.emit({ type: "toast", kind: "problems", tone: "warn", icon: "🔧", title: tr("floor.brokeToast", { name: tr(`structure.${b.type}` as MessageKey) }), body: tr("floor.brokeToastBody"), action: { label: tr("floor.repair"), plot: e.plot } });
  } else if (e.type === "raceFinished") {
    const rec = s.racing.last;
    const rw = rec?.result;
    if (rec && rw) {
      const n = contentFor(s.settings.lang);
      uiEvents.emit({ type: "race", id: rec.id });
      if (rw.position === 0) uiEvents.emit({ type: "fireworks", plot: RACING });
      uiEvents.emit({
        type: "toast",
        kind: "racing",
        tone: rw.position === 0 ? "gold" : rw.position <= 2 ? "success" : "info",
        icon: rw.position === 0 ? "🏆" : rw.position <= 2 ? "🏅" : "🏁",
        title: tr("racing.toast", { pos: rw.position + 1, event: n.raceEvent(rec.event) }),
        body: tr("racing.toastBody", { money: formatMoney(rw.prize + rw.sponsor), rep: rw.rep }),
      });
    }
  }
}

/** Shows a step's news, in order (`s`: the state after the step). */
export function showNews(news: readonly News[], s: GameState) {
  const tr = (key: MessageKey, vars?: Vars) => translate(s.settings.lang, key, vars);
  const names = contentFor(s.settings.lang);
  for (const n of news) {
    switch (n.kind) {
      case "tick":
        tickNews(n.event, s, tr);
        break;
      case "recall":
        if ("paid" in n.result) uiEvents.emit({ type: "toast", kind: "problems", tone: "success", icon: "🛠️", title: tr("autoDecide.recallPaid", { money: formatMoney(n.result.paid) }), body: tr("recall.paidToast", { n: RECALL.repPaid }) });
        else uiEvents.emit({ type: "toast", kind: "problems", tone: n.result.ignored === "scandal" ? "warn" : "info", icon: n.result.ignored === "scandal" ? "📰" : "🤫", title: tr("autoDecide.recallIgnored"), body: tr(n.result.ignored === "scandal" ? "recall.scandalToast" : "recall.quietToast") });
        break;
      case "rival":
        uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: n.rival.emoji, title: tr("rival.beaten", { name: n.rival.name }), body: tr("rival.beatenBody", { n: n.rival.stars }) });
        break;
      case "sponsor":
        if (n.what === "offer") uiEvents.emit({ type: "toast", kind: "clients", tone: "info", icon: "🤝", title: tr("sponsor.offerToast"), body: tr("sponsor.offerToastBody"), action: { label: tr("toast.open"), view: "racing" } });
        else uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "⌛", title: tr("sponsor.expired") });
        break;
      case "usedLot":
        uiEvents.emit({ type: "toast", kind: "clients", tone: "info", icon: "🚙", title: tr("used.lotToast"), body: tr("used.lotToastBody"), action: { label: tr("toast.open"), view: "missions" } });
        break;
      case "contract":
        if (n.what === "offer") uiEvents.emit({ type: "toast", kind: "clients", tone: "info", icon: "📨", title: tr("contract.offerToast"), body: tr("contract.offerToastBody") });
        else uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "⌛", title: tr("contract.expired") });
        break;
      case "eventStarted":
        uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: n.event.emoji, title: tr("event.started", { name: names.event(n.event) }), body: names.eventDesc(n.event) });
        break;
      case "daily":
        uiEvents.emit({ type: "toast", kind: "events", tone: "info", icon: "📋", title: tr("toast.daily"), body: tr("toast.dailyBody") });
        break;
      case "vip":
        if (n.what === "autoAccepted") uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: "💎", title: tr("autoDecide.vipAccepted"), body: tr(`vip.client.${n.client}` as MessageKey), action: { label: tr("toast.open"), view: "missions" } });
        else if (n.what === "offer") uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: "💎", title: tr("vip.offerToast"), body: tr(`vip.client.${n.client}` as MessageKey) });
        else uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "⌛", title: tr("vip.failed") });
        break;
      case "seasonOver":
        uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🏆", title: tr("season.over", { rank: n.rank + 1 }) });
        break;
      case "classicRestored":
        uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: "🏛️", title: tr("classics.done", { name: tr(`classic.${n.id}` as MessageKey) }), body: tr("classics.doneBody") });
        break;
      case "engineer":
        if (n.what === "candidate") uiEvents.emit({ type: "toast", kind: "clients", tone: "info", icon: "👩‍🔬", title: tr("eng.candidateToast", { name: ENGINEER_BY_ID[n.id as EngineerId].name }) });
        else uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "🕵️", title: tr("eng.lostToast") });
        break;
      case "passLeftover":
        uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🎟️", title: tr("pass.leftoverToast", { n: n.n }) });
        break;
      case "passSeason":
        uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🎟️", title: tr("pass.newSeason", { n: n.n }), action: { label: tr("pass.open"), view: "pass" } });
        break;
      case "winter":
        uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: "🎄", title: tr("winter.startToast"), body: tr("winter.startToastBody"), action: { label: tr("winter.open"), view: "winter" } });
        break;
      case "festival":
        uiEvents.emit({ type: "toast", kind: "events", tone: "gold", icon: SEASON_ICON[n.which], title: tr(`festival.${n.which}Start`), body: tr("festival.startBody"), action: { label: tr("winter.open"), view: "festival" } });
        break;
      case "landmarkFirstCar": {
        const car = CAR_BY_ID[n.car.car];
        uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: car.emoji, title: tr("landmark.firstCarToast", { car: names.car(car) }), body: tr("landmark.firstCarBody", { money: formatMoney(n.car.cash), stars: n.car.stars }), action: { label: tr("toast.open"), view: "landmarks" } });
        uiEvents.emit({ type: "fireworks", plot: landmarkLotId(s.activeCity, n.car.territory), big: true });
        break;
      }
      case "landmarkLevel": {
        const works = landmarkIn(s.activeCity, n.up.territory)!.works;
        uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: "🏗️", title: tr("landmark.levelToast", { works: tr(`structure.${works}`), n: n.up.level }), body: tr("landmark.levelToastBody"), action: { label: tr("toast.open"), view: "landmarks" } });
        uiEvents.emit({ type: "fireworks", plot: landmarkLotId(s.activeCity, n.up.territory) });
        break;
      }
      case "cityReady":
        uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: CITIES[n.city].emoji, title: tr("toast.cityReady", { name: tr(`city.${n.city}`) }), body: tr("toast.cityReadyBody"), action: { label: tr("toast.open"), view: "world" } });
        break;
      case "fleet":
        if (n.what === "autoAccepted") uiEvents.emit({ type: "toast", kind: "clients", tone: "info", icon: "🚌", title: tr("autoDecide.fleetAccepted") });
        else if (n.what === "offer") uiEvents.emit({ type: "toast", kind: "clients", tone: "info", icon: "🚌", title: tr("fleet.offerToast") });
        else uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "⌛", title: tr("fleet.failed") });
        break;
      case "edition": {
        const car = n.car ? names.car(CAR_BY_ID[n.car]) : "";
        uiEvents.emit({ type: "toast", kind: "progress", tone: "gold", icon: n.edition.icon, title: tr("edition.toast", { name: tr(`edition.${n.edition.id}` as MessageKey), car }), body: tr("edition.toastBody", { pct: formatPercent(EDITION.income) }), action: { label: tr("edition.see"), view: "cars" } });
        break;
      }
      case "story":
        if (n.what === "offer") {
          const b = s.city.buildings[n.plot];
          const plant = b ? tr(`structure.${b.type}` as MessageKey) : "";
          uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: DILEMMA_BY_ID[n.id].icon, title: tr("story.offerToast"), body: tr(`story.d.${n.id}.title` as MessageKey, { plant }), action: { label: tr("story.decide"), view: "story" } });
        } else if (n.what === "expired") uiEvents.emit({ type: "toast", kind: "clients", tone: "warn", icon: "⌛", title: tr("story.expired") });
        else uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: RIVAL_CEO.emoji, title: tr("story.chapterToast"), body: tr("story.chapterToastBody"), action: { label: tr("story.open"), view: "story" } });
        break;
      case "protoStageDone":
        uiEvents.emit({ type: "toast", kind: "progress", tone: "success", icon: "🧪", title: tr("proto.stageDone") });
        break;
      case "trend":
        uiEvents.emit({ type: "toast", kind: "events", tone: "info", icon: "📰", title: tr("news.toast"), body: tr("news.hot", { cls: tr(`class.${n.hot}` as MessageKey), price: formatPercent(HOT_CLASS.price), demand: formatPercent(HOT_CLASS.demand - 1) }) });
        break;
      case "collected":
        if (n.got.vip !== null) uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: "💎", title: tr("vip.paid"), body: tr("autoDecide.collected", { money: formatMoney(n.got.vip) }) });
        if (n.got.fleet) uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: "🚌", title: tr("fleet.doneToast") });
        if (n.got.contract) uiEvents.emit({ type: "toast", kind: "clients", tone: "gold", icon: "🤝", title: tr("contract.paid"), body: tr("contract.paidBody") });
        break;
    }
  }
}

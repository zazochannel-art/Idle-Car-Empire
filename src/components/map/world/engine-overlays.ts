// What the map draws over the 3D view: labels over the lots, the flow arcs, the bonuses, and the HTML cards pinned over the districts.
// Drawn for MapEngine (engine.ts): its methods moved here as functions of the engine.
import type { FlowState } from "@/game/engine/flow";
import { COMPONENT_BY_ID } from "@/game/config/chain";
import type { ComponentId } from "@/game/types";
import { DEALER_BY_ID } from "@/game/config/dealerships";
import { LABEL_ZOOM } from "./engine-shared";
import type { Live, MapEngine } from "./engine";
import { MAP_BONUS_BY_KIND } from "@/game/config/map-bonus";
import type { MapArea, MapNames } from "../map-types";
import { SPEC_BY_ID, STRUCTURE_BY_ID } from "@/game/config/city";
import { banner, pop, tag } from "./labels";
import { flowLinks } from "@/game/engine/flow";
import { levelCost } from "@/game/engine/chain";
import { plotStatus } from "@/game/engine/construction";
import { slowsDeliveries } from "@/game/engine/map-bonus";


/** The flow arcs' colours: running, piling up, stuck. */
const FLOW_COLOR: Record<FlowState, string> = { ok: "#22c55e", slow: "#f59e0b", stuck: "#ef4444" };

export function drawLabels(eng: MapEngine, dt: number, live: Live | null) {
  const c = eng.ctx;
  c.setTransform(eng.dpr, 0, 0, eng.dpr, 0, 0);
  c.clearRect(0, 0, eng.w, eng.h);
  const plots = eng.plots;
  const names = eng.names;
  if (!plots || !live || !names) return;
  const s = live.state;
  const zoom = eng.cam.zoom;
  const anyCar = s.chain.firstCar || s.lifetime.carsProduced > 0;
  if (eng.flow) drawFlow(eng, c, live);
  for (const lot of plots.lots.values()) {
    const plot = lot.plot;
    const isOpen = eng.unlocked.has(plot.zone);
    if (!isOpen && plot.kind !== "racing") continue;
    const pos = lot.root.position;
    const top = eng.project(pos.x, pos.y + lot.top + 0.12, pos.z);
    if (!eng.onScreen(top)) continue;
    const [x, y] = top;
    const v = lot.view;
    if (!v) continue;
    const sel = eng._selected === plot.id;
    switch (v.look.kind) {
      case "market":
      case "depot": {
        if (zoom < 0.5) break;
        const m = v.look.kind === "market";
        tag(c, m ? names.market : names.depot, x, y, { icon: m ? "💰" : "🏗️", bg: m ? "rgba(21,128,61,0.9)" : "rgba(146,64,14,0.9)" });
        break;
      }
      case "paddock":
        if (zoom >= 0.5 && v.look.open) tag(c, names.racing, x, y, { icon: "🏁", bg: "rgba(185,28,28,0.9)" });
        break;
      case "dealer": {
        if (zoom < 0.75) break;
        const id = plot.dealer!;
        const dl = s.dealers[id];
        if (dl?.owned) {
          tag(c, `${names.dealer(id)} · ${names.level(dl.level)}`, x, y, { icon: DEALER_BY_ID[id].emoji });
          // no car to sell for a while: build more (or send them here)
          const empty = (s.chain.dealers[id]?.cars ?? 0) < 1;
          if (!empty) eng.emptySince.delete(id);
          else if (!eng.emptySince.has(id)) eng.emptySince.set(id, eng.t);
          if (empty && anyCar && !eng.visiting && eng.t - eng.emptySince.get(id)! > 20) tag(c, "📭", x + 26, y - 22, { bg: "rgba(245,158,11,0.95)", size: 11 });
        }
        else if (anyCar) tag(c, names.money(DEALER_BY_ID[id].cost), x, y, { icon: "🏪", bg: "rgba(120,53,15,0.85)", fg: "#fde68a" });
        else if (zoom >= 0.9) tag(c, "🔒", x, y, { bg: "rgba(15,23,42,0.75)", size: 10 });
        break;
      }
      case "site": {
        const st = s.city.sites[plot.id];
        if (st && zoom >= 0.3) tag(c, `${Math.floor((st.t / st.dur) * 100)}%`, x, y, { icon: "🏗️", bg: "rgba(120,53,15,0.88)", fg: "#fde68a", size: 10 });
        break;
      }
      case "empty": {
        if (zoom < 0.38 || !plot.use || eng.visiting) break;
        const st = plotStatus(s, plot.id);
        const bob = st === "available" ? Math.sin(eng.t * 2.4 + lot.seed * 6) * 2 : 0;
        const bg = sel ? "rgba(245,158,11,0.95)" : st === "owned" ? "rgba(37,99,235,0.9)" : st === "available" ? "rgba(21,128,61,0.88)" : "rgba(30,41,59,0.75)";
        const mark = st === "owned" ? "🟦" : st === "locked" ? "🔒" : "+";
        tag(c, zoom >= 0.85 ? `${mark} ${names.structure(plot.use)}` : mark, x, y - bob, { icon: STRUCTURE_BY_ID[plot.use].emoji, bg, size: 9 });
        break;
      }
      case "plant": {
        if (zoom < 0.32) break;
        const b = s.city.buildings[plot.id];
        if (!b) break;
        tag(c, zoom < 0.9 ? names.level(b.level) : `${names.plant(plot.id)} · ${names.level(b.level)}`, x, y, { icon: STRUCTURE_BY_ID[b.type].emoji, bg: "rgba(15,23,42,0.85)" });
        const pl = b.plant;
        // a machine down: a red wrench (tap the plant to repair it)
        if (pl?.broken) tag(c, "🔧", x - 22, y - 22 + Math.sin(eng.t * 6) * 2, { bg: "rgba(220,38,38,0.95)", size: 11 });
        // a boost: a lightning bolt
        else if ((pl?.boost ?? 0) > 0) tag(c, "⚡", x - 22, y - 22, { bg: "rgba(8,145,178,0.95)", size: 11 });
        if (pl && pl.status !== "ok") {
          const icon = pl.status === "noParts" && pl.missing ? COMPONENT_BY_ID[pl.missing as ComponentId].emoji : pl.status === "noRaw" ? "🪨" : pl.status === "full" ? "📦" : "⚠️";
          tag(c, zoom < 0.6 ? "!" : `⚠️ ${icon}`, x + 22, y - 22 + Math.sin(eng.t * 4) * 2, { bg: "rgba(245,158,11,0.95)", fg: "#111", size: 11 });
        }
        // the next level is affordable: a green arrow over the plant
        const up = zoom >= 0.45 && !eng.visiting ? levelCost(b, live.snap.gm) : null;
        if (up !== null && s.cash >= up) tag(c, "⬆️", x, y - 24 + Math.sin(eng.t * 3 + lot.seed * 5) * 1.5, { bg: "rgba(22,163,74,0.95)", size: 11 });
        break;
      }
      case "garage": {
        if (zoom < 0.32) break;
        const b = s.city.buildings[plot.id];
        if (!b) break;
        const active = (live.snap.city.garages[plot.id]?.incomePerSec ?? 0) > 0;
        const no = b.garage?.no ?? 1;
        tag(c, zoom < 0.9 ? `#${String(no).padStart(2, "0")} · ${names.level(b.level)}` : `${names.garage(no)} · ${names.level(b.level)}`, x, y, { icon: SPEC_BY_ID[b.garage?.spec ?? "repair"].emoji, bg: active ? "rgba(29,78,216,0.9)" : "rgba(8,12,20,0.8)" });
        if (!active && zoom >= 0.5 && !eng.visiting) tag(c, "!", x + 26, y - 22, { bg: "rgba(245,158,11,0.95)", fg: "#111", size: 11 });
        break;
      }
      case "structure":
        if (zoom >= 0.85) tag(c, names.level(v.look.level), x, y, { icon: STRUCTURE_BY_ID[v.look.type].emoji });
        break;
    }
    // an upgrade under way: its progress over the crane
    const w = v.works ? s.city.buildings[plot.id]?.works : undefined;
    if (w && zoom >= 0.3) tag(c, `${Math.floor((w.t / w.dur) * 100)}%`, x, y - 24, { icon: "⬆️", bg: "rgba(120,53,15,0.88)", fg: "#fde68a", size: 10 });
  }

  drawBonus(eng, c, names);

  for (const p of eng.pops) {
    p.age += dt;
    const k = p.age / 1.6;
    if (k >= 1) continue;
    const at = eng.project(p.x, p.y, p.z);
    if (eng.onScreen(at)) pop(c, p.text, p.color, at[0], at[1], k);
  }
  eng.pops = eng.pops.filter((q) => q.age < 1.6);

  for (const b of eng.banners) {
    b.age += dt;
    const k = b.age / 2.6;
    const lot = plots.lots.get(b.plot.id);
    if (k >= 1 || !lot) continue;
    const at = eng.project(lot.root.position.x, lot.root.position.y + lot.top + 0.6, lot.root.position.z);
    if (eng.onScreen(at)) banner(c, b.text, at[0], at[1], k);
  }
  eng.banners = eng.banners.filter((b) => b.age < 2.6);
}

/** The flow view: an arc from each plant to where its loads go, dashes running along it. */
export function drawFlow(eng: MapEngine, c: CanvasRenderingContext2D, live: Live) {
  const plots = eng.plots!;
  const top = (id: string): [number, number, number] | null => {
    const lot = plots.lots.get(id);
    if (!lot) return null;
    const p = lot.root.position;
    return [p.x, p.y + lot.top * 0.6, p.z];
  };
  c.save();
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const link of flowLinks(live.state, live.snap.chain)) {
    const a = top(link.from);
    const b = top(link.to);
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const lift = 1.5 + len * 0.22;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      const q = eng.project(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + Math.sin(Math.PI * k) * lift, a[2] + (b[2] - a[2]) * k);
      if (q) pts.push(q);
    }
    if (pts.length < 2) continue;
    const col = FLOW_COLOR[link.state];
    const path = () => {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) c.lineTo(q[0], q[1]);
    };
    c.setLineDash([]);
    c.strokeStyle = "rgba(8,12,20,0.55)";
    c.lineWidth = 6;
    path();
    c.stroke();
    c.strokeStyle = col;
    c.lineWidth = 3;
    path();
    c.stroke();
    // goods running toward the destination (still when the link is stuck)
    c.setLineDash([2, 12]);
    c.lineDashOffset = link.state === "stuck" ? 0 : -eng.t * (link.state === "ok" ? 36 : 12);
    c.strokeStyle = "rgba(255,255,255,0.95)";
    c.lineWidth = 3;
    path();
    c.stroke();
    // an arrowhead at the destination
    const [ex, ey] = pts[pts.length - 1];
    const [fx, fy] = pts[Math.max(0, pts.length - 3)];
    const ang = Math.atan2(ey - fy, ex - fx);
    c.setLineDash([]);
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(ex, ey);
    c.lineTo(ex - 11 * Math.cos(ang - 0.45), ey - 11 * Math.sin(ang - 0.45));
    c.lineTo(ex - 11 * Math.cos(ang + 0.45), ey - 11 * Math.sin(ang + 0.45));
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** The bonus's label over it; off screen, a bubble at the screen's edge pointing to it. */
export function drawBonus(eng: MapEngine, c: CanvasRenderingContext2D, names: MapNames) {
  eng.bonusArrow = null;
  const b = eng.bonus;
  const p = b?.position();
  const kind = b?.kind;
  if (!p || !kind) return;
  const emoji = MAP_BONUS_BY_KIND[kind].emoji;
  const bob = Math.sin(eng.t * 4) * 2;
  const bg = kind === "golden" ? "rgba(202,138,4,0.97)" : kind === "vip" ? "rgba(109,40,217,0.95)" : kind === "drone" ? "rgba(21,128,61,0.95)" : kind === "storm" ? "rgba(2,132,199,0.95)" : kind === "police" ? "rgba(29,78,216,0.95)" : kind === "jam" ? "rgba(217,119,6,0.95)" : "rgba(220,38,38,0.95)";
  const at = eng.project(p.x, p.y + 0.5, p.z);
  if (at && at[0] > 24 && at[1] > 24 && at[0] < eng.w - 24 && at[1] < eng.h - 24) {
    tag(c, slowsDeliveries(kind) ? names.bonusSlowed : names.bonusTap, at[0], at[1] + bob, { icon: emoji, bg, fg: "#fff", size: 11 });
    return;
  }
  // where it is, seen from the middle of the screen (behind the camera: the other way)
  const v = eng.v3.set(p.x, p.y, p.z).project(eng.camera);
  let dx = v.x;
  let dy = -v.y;
  if (v.z > 1) {
    dx = -dx;
    dy = -dy;
  }
  const n = Math.hypot(dx, dy) || 1;
  dx /= n;
  dy /= n;
  // inside the edges, clear of the top bar, the side menu and the bottom bar
  const l = eng.w > 700 ? 110 : 34;
  const r = eng.w - 34;
  const t = Math.min(130, eng.h * 0.3);
  const bt = Math.max(t + 40, eng.h - 110);
  const cx = (l + r) / 2;
  const cy = (t + bt) / 2;
  const k = Math.min(Math.abs(dx) > 1e-6 ? (dx > 0 ? r - cx : cx - l) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? (dy > 0 ? bt - cy : cy - t) / Math.abs(dy) : Infinity);
  const ax = cx + dx * k;
  const ay = cy + dy * k;
  c.save();
  c.fillStyle = bg;
  c.beginPath();
  c.arc(ax, ay, 19, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(ax + dx * 29, ay + dy * 29);
  c.lineTo(ax + dx * 15 - dy * 9, ay + dy * 15 + dx * 9);
  c.lineTo(ax + dx * 15 + dy * 9, ay + dy * 15 - dx * 9);
  c.closePath();
  c.fill();
  c.font = "18px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(emoji, ax, ay + 1 + bob * 0.5);
  c.restore();
  eng.bonusArrow = [ax, ay];
}

/**
 * HTML over the areas follows the camera: names (data-far: only from far
 * away, shrinking with the zoom), padlocks (data-fixed: always the same
 * size) and the card a padlock opens (data-anchor="above": over its
 * padlock, kept on the screen).
 */
export function placeCards(eng: MapEngine) {
  const cards = eng.overlay?.children;
  if (!cards) return;
  // only when the view moved, a card came or went, or now and then (a card's size can change)
  const at = eng.cardsAt;
  const n = cards.length;
  if (at.version === eng.viewVersion && at.frame < 10 && n === eng.cardCount) {
    at.frame++;
    return;
  }
  at.version = eng.viewVersion;
  at.frame = 0;
  eng.cardCount = n;
  const k = Math.max(0.5, Math.min(1, eng.cam.zoom * 2.4));
  // every size is read before any style is written: one layout, not one per card
  const plan: { el: HTMLElement; vis: string; tf: string }[] = [];
  for (const node of cards) {
    const el = node as HTMLElement;
    const id = el.dataset.zone as MapArea | undefined;
    if (!id) continue;
    const c = eng.areaCenter(id);
    const p = eng.project(c.x, eng.ground ? eng.ground.at(c.x, c.y) + 0.5 : 0.5, c.y);
    const far = el.dataset.far !== undefined;
    const above = el.dataset.anchor === "above";
    const off = !eng.onScreen(p, above ? 0 : 200) || (far && eng.cam.zoom > LABEL_ZOOM);
    let tf = "";
    if (p && !off) {
      if (above) {
        // the card sits over its padlock, or under it when there is no room above
        const hw = el.offsetWidth / 2;
        const x = Math.max(hw + 8, Math.min(eng.w - hw - 8, p[0]));
        const up = p[1] - el.offsetHeight - 26 > 8;
        tf = `translate(${Math.round(x)}px, ${Math.round(p[1])}px) translate(-50%, ${up ? "calc(-100% - 22px)" : "22px"})`;
      } else {
        const s = el.dataset.fixed !== undefined ? 1 : k;
        tf = `translate(${Math.round(p[0])}px, ${Math.round(p[1])}px) translate(-50%, -50%) scale(${s.toFixed(2)})`;
      }
    }
    plan.push({ el, vis: off ? "hidden" : "visible", tf });
  }
  for (const { el, vis, tf } of plan) {
    const was = eng.cardStyle.get(el);
    if (was?.vis !== vis) el.style.visibility = vis;
    if (tf && was?.tf !== tf) el.style.transform = tf;
    eng.cardStyle.set(el, { vis, tf: tf || was?.tf || "" });
  }
}

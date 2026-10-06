// The player's side of the island: what stands on every lot (plants,
// garages, dealerships, the other buildings, building sites, the Parts
// Market, the Materials Depot and the racing paddock), how it changes
// (a building rises out of the ground when it is built or upgraded), and
// the build-mode markers, the selection outline and the preview ghost.
import * as THREE from "three";
import { WORLD_MAP, type Plot } from "@/game/city/layout";
import { SPEC_BY_ID, STRUCTURE_BY_ID } from "@/game/config/city";
import { PLANT_BY_ID, isPlantType } from "@/game/config/chain";
import type { PlotStatus } from "@/game/engine/construction";
import type { DealerId, GameState, StructureType } from "@/game/types";
import type { MapNames } from "../map-types";
import { dealerModel, depotModel, emptyDealerModel, garageModel, lotMarker, lotOutline, marketModel, paddockModel, plantModel, siteModel, structureModel, worksModel, type SiteModel } from "./structures";
import type { Ground } from "./terrain";

export type PlotLook =
  | { kind: "empty" }
  | { kind: "market" }
  | { kind: "depot" }
  | { kind: "paddock"; open: boolean }
  | { kind: "dealer"; tier: number; owned: boolean }
  | { kind: "plant"; type: string; level: number }
  | { kind: "garage"; level: number; color: string }
  | { kind: "structure"; type: StructureType; level: number }
  | { kind: "site"; type: StructureType };

export interface PlotView {
  look: PlotLook;
  /** Changes when the lot's building changes (a new one or a new level). */
  sig: string;
  /** Written over the lot when its construction finishes. */
  announce?: string;
  /** An upgrade is under way. */
  works: boolean;
}

const DEALER_TIER: DealerId[] = ["local", "city", "premium", "luxury", "supercar", "global"];

/** What every lot shows, from the game state. */
export function plotViews(s: GameState, names: MapNames): Map<string, PlotView> {
  const out = new Map<string, PlotView>();
  for (const plot of WORLD_MAP.plots) {
    let v: PlotView;
    if (plot.kind === "market") v = { look: { kind: "market" }, sig: "built", works: false };
    else if (plot.kind === "depot") v = { look: { kind: "depot" }, sig: "built", works: false };
    else if (plot.kind === "racing") v = { look: { kind: "paddock", open: s.racing.unlocked }, sig: s.racing.unlocked ? "built" : "lot", announce: names.racing, works: false };
    else if (plot.kind === "dealer") {
      const id = plot.dealer!;
      const owned = !!s.dealers[id]?.owned;
      v = { look: { kind: "dealer", tier: Math.max(0, DEALER_TIER.indexOf(id)), owned }, sig: owned ? "built" : "lot", announce: names.dealer(id), works: false };
    } else {
      const b = s.city.buildings[plot.id];
      const site = s.city.sites[plot.id];
      if (site) v = { look: { kind: "site", type: site.type }, sig: `site:${site.type}`, works: false };
      else if (!b) v = { look: { kind: "empty" }, sig: "lot", works: false };
      else if (b.plant && isPlantType(b.type)) v = { look: { kind: "plant", type: b.type, level: Math.min(10, b.level) }, sig: `${b.type}:${b.level}`, announce: `${names.plant(plot.id)} · ${names.level(b.level)}`, works: !!b.works };
      else if (b.type === "garage")
        v = { look: { kind: "garage", level: Math.min(10, b.level), color: SPEC_BY_ID[b.garage?.spec ?? "repair"].color }, sig: `garage:${b.level}`, announce: `${names.garage(b.garage?.no ?? 1)} · ${names.level(b.level)}`, works: !!b.works };
      else v = { look: { kind: "structure", type: b.type, level: Math.min(10, b.level) }, sig: `${b.type}:${b.level}`, announce: `${names.structure(b.type)} · ${names.level(b.level)}`, works: !!b.works };
    }
    out.set(plot.id, v);
  }
  return out;
}

/** How long a building takes to rise when it is built or upgraded (s). */
export const BUILD_ANIM = 3.2;

const seedOf = (p: Plot) => {
  const s = Math.sin(p.x * 127.1 + p.y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function model(look: PlotLook, plot: Plot, seed: number): THREE.Object3D | null {
  const { w: W, d: D } = plot;
  switch (look.kind) {
    case "empty":
    case "site":
      return null;
    case "market":
      return marketModel(W, D);
    case "depot":
      return depotModel(W, D);
    case "paddock":
      return paddockModel(W, D, look.open);
    case "dealer":
      return look.owned ? dealerModel(look.tier, W, D) : emptyDealerModel(W, D);
    case "plant": {
      const cfg = PLANT_BY_ID[look.type as keyof typeof PLANT_BY_ID];
      return plantModel({ type: look.type, level: look.level, big: !!plot.big, wall: cfg.color, roof: cfg.roof, accent: cfg.roof }, W, D);
    }
    case "garage":
      return garageModel(look.level, look.color, W, D);
    case "structure": {
      const cfg = STRUCTURE_BY_ID[look.type];
      return structureModel(look.type, look.level, cfg.color, cfg.roof, W, D, seed);
    }
  }
}

/** A model of `type` at level 1, for the preview. */
function previewModel(type: StructureType, plot: Plot) {
  if (isPlantType(type)) return model({ kind: "plant", type, level: 1 }, plot, 0.5);
  if (type === "garage") return model({ kind: "garage", level: 1, color: SPEC_BY_ID.repair.color }, plot, 0.5);
  return model({ kind: "structure", type, level: 1 }, plot, 0.5);
}

interface Lot {
  plot: Plot;
  seed: number;
  root: THREE.Group;
  content: THREE.Object3D | null;
  view: PlotView | null;
  site: SiteModel | null;
  works: SiteModel | null;
  /** Height of the building's top above the lot (labels sit there). */
  top: number;
  anim: { start: number; upgrade: boolean; announce?: string } | null;
}

const STATUS_FILL: Record<PlotStatus, string> = { available: "#4ade80", owned: "#38bdf8", construction: "#facc15", operational: "#ffffff", locked: "#64748b" };
const STATUS_OPACITY: Record<PlotStatus, number> = { available: 0.5, owned: 0.4, construction: 0.4, operational: 0.12, locked: 0.25 };

const ghostMats = new Map<THREE.Material, THREE.Material>();
function ghost(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.Material;
    let g = ghostMats.get(src);
    if (!g) {
      g = src.clone();
      g.transparent = true;
      g.opacity = 0.55;
      g.depthWrite = false;
      ghostMats.set(src, g);
    }
    m.material = g;
    m.castShadow = false;
  });
}

const smooth = (k: number) => k * k * (3 - 2 * k);

export class PlotLayer {
  readonly root = new THREE.Group();
  readonly lots = new Map<string, Lot>();
  /** Finished constructions: the engine shows their banner. */
  onFinished: (plot: Plot, text: string) => void = () => {};
  private first = true;
  private markers = new THREE.Group();
  private markerFor = new Map<string, { fill: THREE.Mesh; line: THREE.LineLoop; status: PlotStatus }>();
  private selection: { id: string; line: THREE.LineLoop } | null = null;
  private previewOf: { key: string; obj: THREE.Object3D } | null = null;

  constructor(private ground: Ground) {
    this.root.name = "plots";
    for (const plot of WORLD_MAP.plots) {
      const root = new THREE.Group();
      root.position.set(plot.x, this.groundY(plot), plot.y);
      root.rotation.y = plot.rot;
      this.root.add(root);
      this.lots.set(plot.id, { plot, seed: seedOf(plot), root, content: null, view: null, site: null, works: null, top: 0.4, anim: null });
    }
    this.root.add(this.markers);
  }

  groundY(plot: Plot) {
    return Math.max(this.ground.at(plot.x, plot.y), (Math.max(plot.h, 0.3) / 10) * 1.5);
  }

  /** New game state: rebuild the lots whose building changed. */
  update(views: Map<string, PlotView>, t: number) {
    for (const [id, v] of views) {
      const lot = this.lots.get(id);
      if (!lot) continue;
      const old = lot.view;
      const changed = !old || old.sig !== v.sig;
      if (changed) {
        if (!this.first && old && v.sig !== "lot") {
          // a finished site only loses its scaffolding: it rises like an upgrade
          const upgrade = old.sig !== "lot" && (old.sig.startsWith("site:") || old.sig.split(":")[0] === v.sig.split(":")[0]);
          lot.anim = { start: t, upgrade, announce: v.announce };
        }
        this.build(lot, v);
      }
      if (!!old?.works !== v.works || changed) this.setWorks(lot, v.works);
      lot.view = v;
    }
    this.first = false;
  }

  private build(lot: Lot, v: PlotView) {
    if (lot.content) lot.root.remove(lot.content);
    if (lot.site) lot.root.remove(lot.site.root);
    lot.content = null;
    lot.site = null;
    if (v.look.kind === "site") {
      lot.site = siteModel(lot.plot.w, lot.plot.d, !!lot.plot.big, lot.seed);
      lot.root.add(lot.site.root);
      lot.top = lot.plot.big ? 1.6 : 1.2;
      return;
    }
    const m = model(v.look, lot.plot, lot.seed);
    lot.content = m;
    lot.top = 0.35;
    if (m) {
      lot.root.add(m);
      // the box is in world space (the lot's transform included)
      lot.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m);
      lot.top = Math.max(0.3, box.max.y - lot.root.position.y);
    }
  }

  private setWorks(lot: Lot, on: boolean) {
    if (lot.works) lot.root.remove(lot.works.root);
    lot.works = null;
    if (on) {
      lot.works = worksModel(lot.plot.w, lot.plot.d, lot.seed);
      lot.root.add(lot.works.root);
    }
  }

  /** Per frame: sites grow, cranes turn, new buildings rise. */
  frame(t: number, live: GameState) {
    for (const lot of this.lots.values()) {
      if (lot.site) {
        const st = live.city.sites[lot.plot.id];
        lot.site.update(st ? st.t / st.dur : 1, t);
      }
      if (lot.works) lot.works.update(0, t);
      const a = lot.anim;
      if (a && lot.content) {
        const k = Math.min(1, (t - a.start) / (BUILD_ANIM * 0.8));
        const start = a.upgrade ? 0.55 : 0.02;
        lot.content.scale.y = start + (1 - start) * smooth(k);
        if (t - a.start >= BUILD_ANIM) {
          lot.content.scale.y = 1;
          lot.anim = null;
          if (a.announce) this.onFinished(lot.plot, a.announce);
        }
      } else if (a) lot.anim = null;
    }
    for (const m of this.markerFor.values()) {
      if (m.status !== "available") continue;
      (m.fill.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.18 * Math.sin(t * 2.5);
    }
  }

  /** BUILD mode: every lot tinted by its status (null clears it). */
  setBuildInfo(info: Map<string, PlotStatus> | null) {
    if (!info) {
      for (const m of this.markerFor.values()) this.markers.remove(m.fill, m.line);
      this.markerFor.clear();
      return;
    }
    for (const [id, m] of this.markerFor)
      if (info.get(id) !== m.status) {
        this.markers.remove(m.fill, m.line);
        this.markerFor.delete(id);
      }
    for (const [id, status] of info) {
      if (this.markerFor.has(id)) continue;
      const lot = this.lots.get(id);
      if (!lot) continue;
      const fill = lotMarker(lot.plot.w, lot.plot.d, STATUS_FILL[status], STATUS_OPACITY[status]);
      const line = lotOutline(lot.plot.w, lot.plot.d, STATUS_FILL[status]);
      for (const o of [fill, line]) {
        o.position.add(lot.root.position);
        o.rotation.y = lot.plot.rot;
      }
      this.markers.add(fill, line);
      this.markerFor.set(id, { fill, line, status });
    }
  }

  setSelected(id: string | null) {
    if (this.selection?.id === id) return;
    if (this.selection) this.selection.line.parent?.remove(this.selection.line);
    this.selection = null;
    const lot = id ? this.lots.get(id) : undefined;
    if (!lot) return;
    const line = lotOutline(lot.plot.w, lot.plot.d, "#fbbf24");
    lot.root.add(line);
    this.selection = { id: id!, line };
  }

  /** A see-through model of the building about to be bought. */
  setPreview(p: { plot: string; type: StructureType } | null) {
    const key = p ? `${p.plot}|${p.type}` : "";
    if (this.previewOf?.key === key) return;
    if (this.previewOf) this.previewOf.obj.parent?.remove(this.previewOf.obj);
    this.previewOf = null;
    const lot = p ? this.lots.get(p.plot) : undefined;
    if (!p || !lot) return;
    const m = previewModel(p.type, lot.plot);
    if (!m) return;
    ghost(m);
    lot.root.add(m);
    this.previewOf = { key, obj: m };
  }

  /** Front-most lot under a ray (its box: the lot's footprint up to its roof). */
  pick(ray: THREE.Ray): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    const inv = new THREE.Matrix4();
    const local = new THREE.Ray();
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    for (const [id, lot] of this.lots) {
      inv.copy(lot.root.matrixWorld).invert();
      local.copy(ray).applyMatrix4(inv);
      const w = lot.plot.w / 2 - 0.15;
      const d = lot.plot.d / 2 - 0.15;
      box.min.set(-w, -0.2, -d);
      box.max.set(w, Math.max(0.5, lot.top), d);
      if (!local.intersectBox(box, hit)) continue;
      hit.applyMatrix4(lot.root.matrixWorld);
      const dist = hit.distanceTo(ray.origin);
      if (dist < bestD) {
        bestD = dist;
        best = id;
      }
    }
    return best;
  }
}

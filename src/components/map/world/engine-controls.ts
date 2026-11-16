// Touch and mouse on the map: rays onto the ground, picking what was tapped, and the pan, pinch and twist controls.
// Drawn for MapEngine (engine.ts): its methods moved here as functions of the engine.
import type { MapEngine } from "./engine";
import type { MapTarget } from "../map-types";
import * as THREE from "three";
import { WORLD_MAP } from "@/game/city/layout";
import { ZONE_IDS } from "./engine-shared";
import type { ZoneId } from "@/game/types";

export function rayAt(eng: MapEngine, px: number, py: number) {
  eng.ndc.set((px / eng.w) * 2 - 1, -(py / eng.h) * 2 + 1);
  eng.ray.setFromCamera(eng.ndc, eng.camera);
  return eng.ray.ray;
}

/** Where the ray through a screen point meets the level y. */
export function onPlane(eng: MapEngine, px: number, py: number, y: number): THREE.Vector3 | null {
  const r = rayAt(eng, px, py);
  if (Math.abs(r.direction.y) < 1e-4) return null;
  const t = (y - r.origin.y) / r.direction.y;
  if (t <= 0 || t > 1e5) return null;
  return r.origin.clone().addScaledVector(r.direction, t);
}

/** Where the ray through a screen point meets the ground (marching over the heights). */
export function onGround(eng: MapEngine, px: number, py: number): THREE.Vector3 | null {
  const g = eng.ground;
  if (!g) return onPlane(eng, px, py, 0);
  const r = rayAt(eng, px, py);
  const o = r.origin;
  const d = r.direction;
  let prev = 0;
  for (let t = 0, i = 0; i < 800 && t < eng.camera.far; i++) {
    const x = o.x + d.x * t;
    const y = o.y + d.y * t;
    const z = o.z + d.z * t;
    if (y <= g.at(x, z)) {
      // refine between the last two steps
      let a = prev;
      let b = t;
      for (let k = 0; k < 12; k++) {
        const m = (a + b) / 2;
        if (o.y + d.y * m <= g.at(o.x + d.x * m, o.z + d.z * m)) b = m;
        else a = m;
      }
      return o.clone().addScaledVector(d, b);
    }
    prev = t;
    t += Math.max(0.15, t * 0.01);
  }
  return null;
}

export function pick(eng: MapEngine, px: number, py: number): MapTarget {
  if (!eng.plots) return null;
  // the bonus first: it is what the player is after
  const bp = eng.bonus?.position();
  const bid = eng.bonus?.id;
  if (bp && bid) {
    const at = eng.project(bp.x, bp.y + 0.2, bp.z);
    if (at && Math.hypot(at[0] - px, at[1] - py) < Math.max(36, 42 * eng.cam.zoom)) return { kind: "bonus", id: bid };
  }
  // vehicles first: they drive in front of the buildings
  const tl = eng.trafficLayer;
  if (tl) {
    const radius = Math.max(16, Math.min(34, 22 * eng.cam.zoom));
    let best: MapTarget = null;
    let bestD = radius;
    for (const [x, y, z, v] of tl.pickables()) {
      const p = eng.project(x, y, z);
      if (!p) continue;
      const d = Math.hypot(p[0] - px, p[1] - py);
      if (d < bestD) {
        bestD = d;
        best = { kind: "vehicle", v };
      }
    }
    if (best) return best;
  }
  const id = eng.plots.pick(rayAt(eng, px, py));
  if (id) {
    const plot = WORLD_MAP.plotById[id];
    if (plot && plot.kind !== "racing" && !eng.unlocked.has(plot.zone)) return { kind: "zone", id: plot.zone };
    return { kind: "plot", id };
  }
  const hit = onGround(eng, px, py);
  const area = hit ? eng.areaAt(hit.x, hit.z) : null;
  if (area && ZONE_IDS.has(area) && !eng.unlocked.has(area)) return { kind: "zone", id: area as ZoneId };
  return null;
}

export function attachControls(eng: MapEngine): () => void {
  const el = eng.canvas;
  const pts = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; t: number; moved: boolean; button: number } | null = null;
  let lastMove = 0;
  let hoverAt = 0;
  const local = (e: PointerEvent | WheelEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const userMoved = () => {
    eng.cam.stop();
    eng.tracked = null;
    eng.followUntil = 0;
  };
  /** Shifts the camera so the ground under screen point a lands under b. */
  const drag = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const pa = onPlane(eng, a.x, a.y, eng.ty);
    const pb = onPlane(eng, b.x, b.y, eng.ty);
    if (!pa || !pb) return [0, 0];
    const dx = pa.x - pb.x;
    const dz = pa.z - pb.z;
    // never fling the camera across the map when a ray grazes the horizon
    const lim = eng.cam.dist * 0.6;
    const k = Math.min(1, lim / Math.max(1e-6, Math.hypot(dx, dz)));
    eng.cam.x += dx * k;
    eng.cam.z += dz * k;
    eng.cam.clamp();
    eng.place(-1);
    return [dx * k, dz * k];
  };
  /** Zooms by f keeping the ground under screen point c in place. */
  const zoomAt = (c: { x: number; y: number }, f: number) => {
    const before = onPlane(eng, c.x, c.y, eng.ty);
    eng.cam.zoom *= f;
    eng.cam.clamp();
    eng.place(-1);
    const after = onPlane(eng, c.x, c.y, eng.ty);
    if (before && after) {
      eng.cam.x += before.x - after.x;
      eng.cam.z += before.z - after.z;
      eng.cam.clamp();
      eng.place(-1);
    }
  };
  const pair = () => {
    const [a, b] = [...pts.values()];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  let prevPair: ReturnType<typeof pair> | null = null;

  const onDown = (e: PointerEvent) => {
    el.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) down = { ...p, t: performance.now(), moved: false, button: e.button };
    else if (down) down.moved = true;
    if (pts.size === 2) prevPair = pair();
    eng.cam.vx = eng.cam.vz = 0;
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    const old = pts.get(e.pointerId);
    if (!old) {
      // hovering with a mouse: a pointer over things that can be tapped
      if (e.pointerType === "mouse" && performance.now() - hoverAt > 90) {
        hoverAt = performance.now();
        el.style.cursor = pick(eng, p.x, p.y) ? "pointer" : "grab";
      }
      return;
    }
    if (down && !down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 7) {
      down.moved = true;
      userMoved();
    }
    if (!down?.moved) return;
    if (pts.size === 1) {
      if (down.button === 2 || e.ctrlKey || e.shiftKey) {
        // turn the view
        eng.cam.az -= (p.x - old.x) * 0.006;
      } else {
        const now = performance.now();
        const [dx, dz] = drag(old, p);
        const dt = Math.max(0.008, (now - lastMove) / 1000);
        lastMove = now;
        eng.cam.vx = eng.cam.vx * 0.5 + (dx / dt) * 0.5;
        eng.cam.vz = eng.cam.vz * 0.5 + (dz / dt) * 0.5;
      }
      pts.set(e.pointerId, p);
    } else if (pts.size === 2) {
      pts.set(e.pointerId, p);
      const q = pair();
      if (prevPair) {
        drag({ x: prevPair.cx, y: prevPair.cy }, { x: q.cx, y: q.cy });
        if (prevPair.d > 10) zoomAt({ x: q.cx, y: q.cy }, q.d / prevPair.d);
        let da = q.ang - prevPair.ang;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        eng.cam.az += da;
      }
      prevPair = q;
    }
  };
  const onUp = (e: PointerEvent) => {
    const p = local(e);
    const was = pts.size;
    pts.delete(e.pointerId);
    if (pts.size < 2) prevPair = null;
    if (was === 1 && down && !down.moved && performance.now() - down.t < 600 && down.button !== 2) {
      // the arrow to a bonus off screen: fly there
      const arrow = eng.bonusArrow;
      const bp = eng.bonus?.position();
      if (arrow && bp && Math.hypot(arrow[0] - p.x, arrow[1] - p.y) < 30) eng.cam.flyTo(bp.x, bp.z, Math.max(eng.cam.zoom, 1.2), 0.8);
      else eng.onTap(pick(eng, p.x, p.y));
    }
    if (performance.now() - lastMove > 80) eng.cam.vx = eng.cam.vz = 0;
    if (pts.size === 0) down = null;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    userMoved();
    zoomAt(local(e), Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)));
  };
  const onMenu = (e: Event) => e.preventDefault();
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("contextmenu", onMenu);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("contextmenu", onMenu);
  };
}

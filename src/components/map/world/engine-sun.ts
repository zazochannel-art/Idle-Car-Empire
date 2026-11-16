// The sun and the sky: where the sun stands, its shadows, and the sky's colour by the hour.
// Drawn for MapEngine (engine.ts): its methods moved here as functions of the engine.
import { LOCK } from "./kit";
import { MOON, dawnMist, sunAt, worldClock } from "../lighting";
import type { MapEngine } from "./engine";
import { NOON, SHADOW_TOP, SUN_SWING, smoothstep } from "./engine-shared";
import * as THREE from "three";

/**
 * Points the sun (from where it stands eng time of day) at the middle of the view, and fits its
 * shadow box round what the camera sees: the view's corners on the ground and up to the tallest
 * buildings, in the sun's own frame. Everything on screen casts its shadow, as sharp as the
 * shadow map allows (the box was a square round the middle before: the edges of the view had none).
 */
export function aimSun(eng: MapEngine) {
  const c = eng.cam;
  const cam = eng.camera;
  const target = eng.sun.target.position.set(c.x, eng.ty, c.z);
  eng.sun.position.copy(target).addScaledVector(eng.sunDir, 400);
  const frame = eng.sunFrame;
  frame.position.copy(eng.sun.position);
  frame.lookAt(target);
  frame.updateMatrixWorld();
  // the ground the camera sees: its four corners (a ray that misses the ground stops three views out)
  const reach = c.dist * 3 + 20;
  const pts = eng.sunPts;
  for (let i = 0; i < 4; i++) {
    const v = pts[i].set(i & 1 ? 1 : -1, i & 2 ? 1 : -1, 0.5).unproject(cam).sub(cam.position).normalize();
    let t = v.y < -1e-3 ? (eng.ty - cam.position.y) / v.y : reach;
    const flat = Math.hypot(v.x, v.z) * t;
    if (flat > reach) t *= reach / flat;
    v.multiplyScalar(t).add(cam.position);
    v.y = eng.ty;
    pts[i + 4].copy(v).setY(eng.ty + SHADOW_TOP);
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const q of pts) {
    q.applyMatrix4(frame.matrixWorldInverse);
    x0 = Math.min(x0, q.x);
    x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y);
    y1 = Math.max(y1, q.y);
    z0 = Math.min(z0, q.z);
    z1 = Math.max(z1, q.z);
  }
  // a margin for what stands just out of view, no more than the old box at its widest, and
  // snapped to whole units so the box keeps still while the view creeps
  const cap = 110;
  const mid = [(x0 + x1) / 2, (y0 + y1) / 2];
  const hx = Math.min(cap, (x1 - x0) / 2 + 2);
  const hy = Math.min(cap, (y1 - y0) / 2 + 2);
  const sh = eng.sun.shadow.camera;
  sh.left = Math.floor(mid[0] - hx);
  sh.right = Math.ceil(mid[0] + hx);
  sh.bottom = Math.floor(mid[1] - hy);
  sh.top = Math.ceil(mid[1] + hy);
  sh.near = Math.max(1, -z1 - 40);
  sh.far = -z0 + 40;
  sh.updateProjectionMatrix();
}

/** Towards the light now: the sun along its path through the day, handed over to the moon by night. */
export function sunNow(eng: MapEngine, out: THREE.Vector3) {
  const sun = sunAt(eng.timeMode, worldClock.t);
  const toward = (el: number, turn: number, v: THREE.Vector3) => {
    const a = NOON + turn * SUN_SWING;
    return v.set(Math.cos(el) * Math.cos(a), Math.sin(el), Math.cos(el) * Math.sin(a));
  };
  toward(sun.el, sun.turn, out);
  if (sun.moon > 0) out.lerp(toward(MOON.el, MOON.turn, eng.v3), sun.moon).normalize();
  return out;
}

export function applySky(eng: MapEngine, dark: number) {
  const day = eng.skyDay;
  const dusk = eng.skyDusk;
  const night = eng.skyNight;
  const c = eng.skyCol;
  if (dark <= 0.5) c.copy(day).lerp(dusk, dark / 0.5);
  else c.copy(dusk).lerp(night, (dark - 0.5) / 0.5);
  // rain or snow clouds grey the sky; fog and the morning mist close in round the view
  const over = eng.weather?.overcast ?? 0;
  const mist = Math.max(eng.weather?.fog ?? 0, dawnMist(eng.timeMode, worldClock.t) * 0.55);
  c.lerp(eng.skyGrey, Math.min(0.7, over * 0.45 + mist * 0.4) * (1 - dark * 0.7));
  (eng.scene.background as THREE.Color).copy(c);
  const fog = eng.scene.fog as THREE.Fog;
  fog.color.copy(c);
  const d = eng.cam.dist;
  fog.near = d * 2.2 + 60 + (d * 0.15 - (d * 2.2 + 60)) * mist;
  fog.far = d * 6 + 400 + (d * 1.5 - (d * 6 + 400)) * mist;
  // the fog itself is a pale grey (by night it takes the sky's colour)
  fog.color.lerp(eng.fogGrey, mist * 0.8 * (1 - dark));
  // the sun carries the light and the fill (sky and room light) stays low, so the shadows read
  // clearly; by night the fill dims less than the sun, or the map would go black
  eng.sun.intensity = 3.3 * (1 - dark * 0.9) * (1 - 0.45 * over - 0.2 * mist);
  eng.sun.color.copy(eng.sunWarm).lerp(eng.sunNight, Math.min(1, dark * 1.4) * 0.6);
  eng.hemi.intensity = 0.6 - dark * 0.3;
  eng.hemi.color.copy(eng.hemiDay).lerp(eng.hemiNight, dark);
  // wet ground and rain-washed colours catch more of the sky's light: the streets shine
  eng.scene.environmentIntensity = 0.25 * (1 - dark * 0.5) + 0.3 * LOCK.uniforms.uWet.value * (1 - dark * 0.4);
  // clouds drift over the land by day, less under a grey sky
  LOCK.uniforms.uCloud.value = (1 - smoothstep(0.3, 0.8, dark)) * (1 - 0.6 * over);
  // the windows light up as the evening comes on
  LOCK.uniforms.uNight.value = smoothstep(0.35, 0.8, dark);
  if (eng.glows) {
    const k = smoothstep(0.55, 0.9, dark);
    (eng.glows.material as THREE.PointsMaterial).opacity = k;
    eng.glows.visible = k > 0.01;
    if (eng.pools) {
      (eng.pools.material as THREE.MeshBasicMaterial).opacity = k * 0.5;
      eng.pools.visible = k > 0.01;
    }
  }
}

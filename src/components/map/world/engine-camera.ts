// The map's camera: where it looks, how far and from which side, and its flights (engine.ts drives it).

import { DIST1, ease, smoothstep } from "./engine-shared";

/**
 * The camera: a point on the ground it looks at, a zoom (camera distance
 * DIST1 / zoom), and a heading. Far out it looks almost straight down; close
 * in it tilts toward the horizon.
 */
export class CameraRig {
  x = 0;
  z = 0;
  zoom = 1;
  /** Heading: 0 looks north. */
  az = 0;
  minZoom = 0.08;
  maxZoom = 4;
  private flight: { x0: number; z0: number; l0: number; x1: number; z1: number; l1: number; t: number; dur: number } | null = null;
  /** Pan velocity (world units/s) carried on after a drag. */
  vx = 0;
  vz = 0;

  constructor(private half: [number, number]) {}

  /** The map's y is the scene's z. */
  get y() {
    return this.z;
  }

  get dist() {
    return DIST1 / this.zoom;
  }

  /** Angle of the camera from the vertical. */
  get polar() {
    return 0.3 + 0.62 * smoothstep(Math.log(0.12), Math.log(1.6), Math.log(this.zoom));
  }

  flyTo(x: number, y: number, zoom: number, dur = 0.6) {
    zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.vx = this.vz = 0;
    if (dur <= 0) {
      this.x = x;
      this.z = y;
      this.zoom = zoom;
      this.flight = null;
      this.clamp();
      return;
    }
    this.flight = { x0: this.x, z0: this.z, l0: Math.log(this.zoom), x1: x, z1: y, l1: Math.log(zoom), t: 0, dur };
  }

  stop() {
    this.flight = null;
    this.vx = this.vz = 0;
  }

  get flying() {
    return this.flight !== null;
  }

  update(dt: number) {
    const f = this.flight;
    if (f) {
      f.t += dt;
      const k = ease(Math.min(1, f.t / f.dur));
      this.x = f.x0 + (f.x1 - f.x0) * k;
      this.z = f.z0 + (f.z1 - f.z0) * k;
      this.zoom = Math.exp(f.l0 + (f.l1 - f.l0) * k);
      if (f.t >= f.dur) this.flight = null;
    } else if (Math.abs(this.vx) + Math.abs(this.vz) > 1e-3) {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const d = Math.exp(-dt * 5);
      this.vx *= d;
      this.vz *= d;
    }
    this.clamp();
  }

  clamp() {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    this.x = Math.max(-this.half[0], Math.min(this.half[0], this.x));
    this.z = Math.max(-this.half[1], Math.min(this.half[1], this.z));
  }
}

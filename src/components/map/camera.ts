// A 2D camera over world pixels with smooth fly-to, inertia and bounds, plus
// pointer controls: drag to pan, wheel/pinch to zoom, tap to select.

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  minZoom = 0.25;
  maxZoom = 2.5;
  w = 1;
  h = 1;
  vx = 0;
  vy = 0;
  bounds: Bounds;
  private anim: { fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; t: number; dur: number } | null = null;

  constructor(bounds: Bounds) {
    this.bounds = bounds;
  }

  get animating() {
    return this.anim !== null;
  }

  toWorld(px: number, py: number): [number, number] {
    return [(px - this.w / 2) / this.zoom + this.x, (py - this.h / 2) / this.zoom + this.y];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom + this.w / 2, (wy - this.y) * this.zoom + this.h / 2];
  }

  /** Visible world rectangle [x0, y0, x1, y1]. */
  view(): [number, number, number, number] {
    const hw = this.w / 2 / this.zoom;
    const hh = this.h / 2 / this.zoom;
    return [this.x - hw, this.y - hh, this.x + hw, this.y + hh];
  }

  zoomAt(px: number, py: number, zoom: number) {
    const z = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    const [wx, wy] = this.toWorld(px, py);
    this.zoom = z;
    this.x = wx - (px - this.w / 2) / z;
    this.y = wy - (py - this.h / 2) / z;
    this.anim = null;
    this.clamp();
  }

  panBy(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.anim = null;
    this.clamp();
  }

  flyTo(x: number, y: number, zoom = this.zoom, dur = 0.6) {
    this.vx = this.vy = 0;
    this.anim = { fx: this.x, fy: this.y, fz: this.zoom, tx: x, ty: y, tz: Math.max(this.minZoom, Math.min(this.maxZoom, zoom)), t: 0, dur };
  }

  stop() {
    this.vx = this.vy = 0;
    this.anim = null;
  }

  clamp() {
    const b = this.bounds;
    // Let the edge of the world reach the middle of the screen, no further.
    this.x = Math.max(b.minX, Math.min(b.maxX, this.x));
    this.y = Math.max(b.minY, Math.min(b.maxY, this.y));
  }

  /** Advances animation and inertia. Returns true if the camera moved. */
  update(dt: number): boolean {
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const k = ease(a.t);
      // zoom interpolates geometrically so it feels even
      this.zoom = a.fz * Math.pow(a.tz / a.fz, k);
      this.x = a.fx + (a.tx - a.fx) * k;
      this.y = a.fy + (a.ty - a.fy) * k;
      if (a.t >= 1) this.anim = null;
      this.clamp();
      return true;
    }
    if (Math.abs(this.vx) + Math.abs(this.vy) > 2) {
      this.x -= (this.vx * dt) / this.zoom;
      this.y -= (this.vy * dt) / this.zoom;
      const decay = Math.exp(-dt * 6);
      this.vx *= decay;
      this.vy *= decay;
      this.clamp();
      return true;
    }
    this.vx = this.vy = 0;
    return false;
  }
}

export interface ControlHandlers {
  onTap: (px: number, py: number) => void;
  onHover?: (px: number, py: number) => void;
  /** Return true to take over a drag (e.g. to drag a placement ghost). */
  onDragStart?: (px: number, py: number) => boolean;
  onDragMove?: (px: number, py: number) => void;
  onDragEnd?: () => void;
}

const TAP_SLOP = 7;

/** Pointer controls for a camera on `el`. Returns a cleanup function. */
export function attachControls(el: HTMLElement, cam: Camera, h: ControlHandlers): () => void {
  const pts = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number; t: number } | null = null;
  let dragging = false;
  let custom = false;
  let pinch: { dist: number; zoom: number; mx: number; my: number } | null = null;
  let last = { x: 0, y: 0, t: 0 };

  const local = (e: PointerEvent | WheelEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    el.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, p);
    cam.stop();
    if (pts.size === 1) {
      start = { ...p, t: performance.now() };
      last = { ...p, t: performance.now() };
      dragging = false;
      custom = false;
    } else if (pts.size === 2) {
      if (custom) h.onDragEnd?.();
      custom = false;
      const s = pinchState();
      pinch = { dist: s.dist, zoom: cam.zoom, mx: s.mx, my: s.my };
      dragging = true;
    }
  };

  const move = (e: PointerEvent) => {
    const p = local(e);
    if (!pts.has(e.pointerId)) {
      if (e.pointerType === "mouse") h.onHover?.(p.x, p.y);
      return;
    }
    pts.set(e.pointerId, p);
    if (pinch && pts.size >= 2) {
      const s = pinchState();
      cam.zoomAt(s.mx, s.my, pinch.zoom * (s.dist / Math.max(1, pinch.dist)));
      cam.panBy(s.mx - pinch.mx, s.my - pinch.my);
      pinch.mx = s.mx;
      pinch.my = s.my;
      return;
    }
    if (!start) return;
    if (!dragging && Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) {
      dragging = true;
      custom = h.onDragStart?.(start.x, start.y) ?? false;
    }
    if (!dragging) return;
    if (custom) {
      h.onDragMove?.(p.x, p.y);
      return;
    }
    const now = performance.now();
    const dt = Math.max(1, now - last.t) / 1000;
    cam.panBy(p.x - last.x, p.y - last.y);
    cam.vx = cam.vx * 0.6 + ((p.x - last.x) / dt) * 0.4;
    cam.vy = cam.vy * 0.6 + ((p.y - last.y) / dt) * 0.4;
    last = { ...p, t: now };
  };

  const up = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.delete(e.pointerId);
    if (pts.size === 1) {
      // finished a pinch: continue as a plain drag with the remaining finger
      pinch = null;
      const rest = [...pts.values()][0];
      start = { ...rest, t: performance.now() };
      last = { ...rest, t: performance.now() };
      cam.vx = cam.vy = 0;
      return;
    }
    if (pts.size > 0) return;
    pinch = null;
    if (custom) h.onDragEnd?.();
    else if (!dragging && start) h.onTap(p.x, p.y);
    else if (performance.now() - last.t > 80) cam.vx = cam.vy = 0;
    start = null;
    dragging = false;
    custom = false;
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
    cam.zoomAt(p.x, p.y, cam.zoom * factor);
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("wheel", wheel, { passive: false });
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.removeEventListener("wheel", wheel);
  };
}

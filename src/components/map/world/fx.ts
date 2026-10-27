// Particles over the Empire Map: fireworks for the big moments, sparkles
// round a golden car, a burst of coins when a bonus is taken, smoke from a
// broken-down truck. Two batches of points (glowing ones added to the light,
// soft ones blended over it), simulated here and drawn in one call each.
import * as THREE from "three";

/** Room in each batch. */
const CAP = 1400;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds lived and to live. */
  age: number;
  life: number;
  /** World size, and its colour. */
  size: number;
  r: number;
  g: number;
  b: number;
  /** Pull down (units/s²) and air drag (1/s). */
  grav: number;
  drag: number;
  /** Twinkles as it fades (fireworks), or grows as it fades (smoke). */
  twinkle: boolean;
  grow: number;
  /** A rocket bursts into a firework when its life ends. */
  burst?: { big: boolean; hue: number };
  /** A rocket's show scale (its burst's size). */
  k?: number;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uViewH;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mv.z));
}`;
const FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = vColor.a * smoothstep(1.0, 0.0, r);
  gl_FragColor = vec4(vColor.rgb * (1.0 + 0.6 * (1.0 - r)), a);
}`;

class Batch {
  readonly points: THREE.Points;
  readonly list: Particle[] = [];
  private pos = new Float32Array(CAP * 3);
  private col = new Float32Array(CAP * 4);
  private size = new Float32Array(CAP);
  private geo = new THREE.BufferGeometry();
  readonly mat: THREE.ShaderMaterial;

  constructor(additive: boolean) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uViewH: { value: 800 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 8 : 7;
    this.points.visible = false;
  }

  add(p: Particle) {
    if (this.list.length >= CAP) this.list.shift();
    this.list.push(p);
  }

  /** Moves every particle on; returns the rockets that burst. */
  step(dt: number, t: number): Particle[] {
    const burst: Particle[] = [];
    let n = 0;
    const keep: Particle[] = [];
    for (const p of this.list) {
      p.age += dt;
      // a rocket still waiting for its turn
      if (p.age < 0) {
        keep.push(p);
        continue;
      }
      if (p.age >= p.life) {
        if (p.burst) burst.push(p);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d - p.grav * dt;
      p.vz *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      keep.push(p);
      const k = p.age / p.life;
      let a = k < 0.1 ? k / 0.1 : 1 - Math.max(0, (k - 0.55) / 0.45);
      if (p.twinkle && k > 0.4) a *= 0.55 + 0.45 * Math.sin(t * 40 + p.x * 13);
      this.pos[3 * n] = p.x;
      this.pos[3 * n + 1] = p.y;
      this.pos[3 * n + 2] = p.z;
      this.col[4 * n] = p.r;
      this.col[4 * n + 1] = p.g;
      this.col[4 * n + 2] = p.b;
      this.col[4 * n + 3] = Math.max(0, a);
      this.size[n] = p.size * (1 + p.grow * k);
      n++;
    }
    this.list.length = 0;
    this.list.push(...keep);
    this.geo.setDrawRange(0, n);
    if (n) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
    }
    this.points.visible = n > 0;
    return burst;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

const tmp = new THREE.Color();
/** Firework colours (hue in turns), bright and saturated. */
const HUES = [0.0, 0.08, 0.14, 0.3, 0.52, 0.6, 0.78, 0.9];

export class Fx {
  readonly root = new THREE.Group();
  private glow = new Batch(true);
  private soft = new Batch(false);
  private t = 0;
  /** Fewer particles on low graphics. */
  low = false;

  constructor() {
    this.root.name = "fx";
    this.root.add(this.glow.points, this.soft.points);
  }

  /** The canvas height in device pixels (the points' size follows it). */
  setViewHeight(h: number) {
    this.glow.mat.uniforms.uViewH.value = h;
    this.soft.mat.uniforms.uViewH.value = h;
  }

  get busy() {
    return this.glow.list.length + this.soft.list.length > 0;
  }

  private base(x: number, y: number, z: number): Particle {
    return { x, y, z, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 0.3, r: 1, g: 1, b: 1, grav: 0, drag: 0, twinkle: false, grow: 0 };
  }

  /**
   * A volley of fireworks from the ground at (x, y, z): `n` rockets, a few
   * seconds of them. `scale` sizes the show to the view (the camera's
   * distance / 30), so the bursts fill the same part of the screen at any zoom.
   */
  fireworks(x: number, y: number, z: number, n = 4, big = false, scale = 1) {
    const count = this.low ? Math.ceil(n / 2) : n;
    const k = Math.max(0.5, Math.min(4, scale));
    for (let i = 0; i < count; i++) {
      const p = this.base(x + (Math.random() - 0.5) * 4 * k, y, z + (Math.random() - 0.5) * 4 * k);
      p.life = 0.9 + Math.random() * 0.3;
      // up to about a sixth of the view's distance, slowing as it climbs
      const h = (big ? 5.5 : 4.5) * k * (0.85 + Math.random() * 0.3);
      p.drag = 1.2;
      p.vy = (h * p.drag) / (1 - Math.exp(-p.drag * p.life));
      p.vx = (Math.random() - 0.5) * k;
      p.vz = (Math.random() - 0.5) * k;
      // staggered: each rocket waits its turn below ground level, unseen
      p.age = -i * (big ? 0.45 : 0.6) - Math.random() * 0.3;
      p.size = 0.3 * k;
      p.k = k;
      p.r = 1;
      p.g = 0.85;
      p.b = 0.6;
      p.burst = { big, hue: HUES[(i + Math.floor(Math.random() * HUES.length)) % HUES.length] };
      this.glow.add(p);
    }
  }

  private explode(r: Particle) {
    const big = r.burst!.big;
    const n = (big ? 130 : 80) * (this.low ? 0.5 : 1);
    const k = r.k ?? 1;
    const speed = (big ? 5.2 : 4.2) * k;
    const two = Math.random() < 0.35;
    for (let i = 0; i < n; i++) {
      // even directions over a sphere
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.85 + Math.random() * 0.25);
      const p = this.base(r.x, r.y, r.z);
      p.vx = s * Math.cos(a) * v;
      p.vy = u * v;
      p.vz = s * Math.sin(a) * v;
      p.grav = 1.6 * k;
      p.drag = 1.1;
      p.life = 1.4 + Math.random() * 0.6;
      p.size = (big ? 0.34 : 0.28) * k;
      p.twinkle = true;
      tmp.setHSL((r.burst!.hue + (two && i % 2 ? 0.45 : 0)) % 1, 0.95, 0.6);
      p.r = tmp.r;
      p.g = tmp.g;
      p.b = tmp.b;
      // solid colours: they read against a bright day as well as at night
      this.soft.add(p);
    }
    // a white flash at the centre
    const f = this.base(r.x, r.y, r.z);
    f.life = 0.25;
    f.size = (big ? 2.4 : 1.8) * k;
    this.glow.add(f);
  }

  /** A few golden sparkles round a point (call now and then while something shines). */
  sparkle(x: number, y: number, z: number, n = 2, color = "#ffd75e") {
    tmp.set(color);
    for (let i = 0; i < n; i++) {
      const p = this.base(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.8);
      p.vy = 0.6 + Math.random() * 0.6;
      p.life = 0.7 + Math.random() * 0.4;
      p.size = 0.16 + Math.random() * 0.1;
      p.twinkle = true;
      p.r = tmp.r;
      p.g = tmp.g;
      p.b = tmp.b;
      this.glow.add(p);
    }
  }

  /** A burst of coins (a bonus taken). */
  coins(x: number, y: number, z: number) {
    for (let i = 0; i < (this.low ? 18 : 36); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1.5 + Math.random() * 2;
      const p = this.base(x, y + 0.3, z);
      p.vx = Math.cos(a) * v;
      p.vz = Math.sin(a) * v;
      p.vy = 4 + Math.random() * 3;
      p.grav = 9;
      p.drag = 0.3;
      p.life = 0.9 + Math.random() * 0.4;
      p.size = 0.22;
      p.twinkle = true;
      p.r = 1;
      p.g = 0.8;
      p.b = 0.25;
      this.soft.add(p);
    }
  }

  /** A puff of smoke rising from a point. */
  smoke(x: number, y: number, z: number, dark = 0.35) {
    const p = this.base(x + (Math.random() - 0.5) * 0.15, y, z + (Math.random() - 0.5) * 0.15);
    p.vy = 0.5 + Math.random() * 0.3;
    p.vx = 0.15 + Math.random() * 0.1;
    p.drag = 0.4;
    p.life = 2 + Math.random();
    p.size = 0.35;
    p.grow = 2.2;
    p.r = p.g = p.b = dark;
    this.soft.add(p);
  }

  update(dt: number) {
    this.t += dt;
    for (const r of this.glow.step(dt, this.t)) this.explode(r);
    // the rockets leave a short trail of sparks
    const trail: Particle[] = [];
    for (const r of this.glow.list)
      if (r.burst && r.age > 0) {
        const p = this.base(r.x, r.y, r.z);
        p.life = 0.35;
        p.size = 0.15 * (r.k ?? 1);
        p.g = 0.75;
        p.b = 0.45;
        trail.push(p);
      }
    for (const p of trail) this.glow.add(p);
    this.soft.step(dt, this.t);
  }

  dispose() {
    this.glow.dispose();
    this.soft.dispose();
  }
}

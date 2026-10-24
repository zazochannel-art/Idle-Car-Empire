// The weather drawn over the Empire Map (the forecast itself: ../weather.ts):
// rain streaks, snowflakes and spring petals falling in a box round what the
// camera looks at, each kind one draw call animated on the graphics card. The
// drops stay put in the world as the camera pans (the box wraps round them).
// Snow lying on roofs and fields and the sheen of wet ground are drawn by the
// map's own materials (kit.ts: LOCK.uniforms uSnow and uWet).
import * as THREE from "three";
import type { Weather } from "../weather";
import { LOCK } from "./kit";

const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uCentre;
uniform vec3 uSize;
uniform float uSpeed;
uniform float uAlpha;
uniform float uSway;
varying float vFade;
/** Where a drop is now: anchored in the world, wrapped into the box round the centre. */
vec3 dropAt(vec3 base) {
  float fall = fract(base.y - uTime * uSpeed / uSize.y);
  vec3 w;
  w.x = uCentre.x + (fract((base.x * uSize.x - uCentre.x) / uSize.x + 0.5) - 0.5) * uSize.x;
  w.z = uCentre.z + (fract((base.z * uSize.z - uCentre.z) / uSize.z + 0.5) - 0.5) * uSize.z;
  w.y = uCentre.y + fall * uSize.y;
  float ph = base.x * 61.0 + base.z * 37.0;
  w.x += sin(uTime * 0.9 + ph) * uSway;
  w.z += cos(uTime * 0.7 + ph * 1.3) * uSway * 0.7;
  // fade at the box's sides, near the ground and at its top
  vec2 e = abs(w.xz - uCentre.xz) / uSize.xz;
  vFade = (1.0 - smoothstep(0.32, 0.5, max(e.x, e.y))) * smoothstep(0.0, 0.06, fall) * (1.0 - smoothstep(0.85, 1.0, fall));
  return w;
}`;

const RAIN_VERT = /* glsl */ `
${COMMON}
attribute float aEnd;
uniform float uLen;
void main() {
  vec3 w = dropAt(position);
  w += vec3(0.18, -1.0, 0.1) * uLen * aEnd;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const RAIN_FRAG = /* glsl */ `
uniform float uAlpha;
varying float vFade;
void main() {
  gl_FragColor = vec4(0.78, 0.84, 0.92, uAlpha * vFade);
}`;

const FLAKE_VERT = /* glsl */ `
${COMMON}
attribute float aSeed;
uniform float uPx;
uniform float uFlake;
varying float vSeed;
void main() {
  vec3 w = dropAt(position);
  vSeed = aSeed;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.5, uFlake * (0.7 + 0.6 * aSeed) * projectionMatrix[1][1] * uPx * 0.5 / max(0.1, -mv.z));
}`;
const SNOW_FRAG = /* glsl */ `
uniform float uAlpha;
varying float vFade;
varying float vSeed;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, uAlpha * vFade * smoothstep(1.0, 0.3, r));
}`;
const PETAL_FRAG = /* glsl */ `
uniform float uAlpha;
uniform float uTime;
varying float vFade;
varying float vSeed;
void main() {
  // a small turning oval, pink to white
  float a = uTime * (1.5 + vSeed * 2.0) + vSeed * 40.0;
  vec2 p = gl_PointCoord - 0.5;
  p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
  p.x *= 1.9;
  float r = length(p) * 2.0;
  if (r > 1.0) discard;
  vec3 c = mix(vec3(0.98, 0.62, 0.76), vec3(1.0, 0.9, 0.94), vSeed);
  gl_FragColor = vec4(c, uAlpha * vFade * smoothstep(1.0, 0.6, r));
}`;

function uniforms() {
  return {
    uTime: { value: 0 },
    uCentre: { value: new THREE.Vector3() },
    uSize: { value: new THREE.Vector3(60, 30, 60) },
    uSpeed: { value: 10 },
    uAlpha: { value: 0 },
    uSway: { value: 0 },
    uLen: { value: 1 },
    uPx: { value: 800 },
    uFlake: { value: 0.2 },
  };
}

/** n random points in the unit cube (and a seed per point). */
function cloud(n: number, ends: boolean) {
  const per = ends ? 2 : 1;
  const pos = new Float32Array(n * per * 3);
  const extra = new Float32Array(n * per);
  for (let i = 0; i < n; i++) {
    const x = Math.random();
    const y = Math.random();
    const z = Math.random();
    const seed = Math.random();
    for (let k = 0; k < per; k++) {
      const j = i * per + k;
      pos.set([x, y, z], j * 3);
      extra[j] = ends ? k : seed;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute(ends ? "aEnd" : "aSeed", new THREE.BufferAttribute(extra, 1));
  return g;
}

function material(vert: string, frag: string, u: ReturnType<typeof uniforms>) {
  return new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: u, transparent: true, depthWrite: false });
}

export class WeatherFx {
  readonly root = new THREE.Group();
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private petals: THREE.Points;
  private ur = uniforms();
  private us = uniforms();
  private up = uniforms();
  /** How strong each kind is now (eased toward the forecast). */
  private k = { rain: 0, snow: 0, petals: 0, fog: 0, cover: 0 };

  constructor(low: boolean) {
    this.root.name = "weather";
    this.rain = new THREE.LineSegments(cloud(low ? 1200 : 3000, true), material(RAIN_VERT, RAIN_FRAG, this.ur));
    this.snow = new THREE.Points(cloud(low ? 900 : 2200, false), material(FLAKE_VERT, SNOW_FRAG, this.us));
    this.petals = new THREE.Points(cloud(low ? 500 : 1200, false), material(FLAKE_VERT, PETAL_FRAG, this.up));
    for (const o of [this.rain, this.snow, this.petals]) {
      o.frustumCulled = false;
      o.visible = false;
      o.renderOrder = 6;
      this.root.add(o);
    }
  }

  /** Fog over the map now (0–1), for the engine's sky. */
  get fog() {
    return this.k.fog;
  }

  /** Rain or snow clouds over the map (0–1): the sky greys and the sun dims. */
  get overcast() {
    return Math.max(this.k.rain, this.k.snow * 0.7);
  }

  /**
   * The forecast `w` (eased in over a few seconds), the time, what the camera
   * looks at (x, ground y, z), its distance and the canvas height in pixels.
   */
  update(w: Weather, dt: number, t: number, x: number, y: number, z: number, dist: number, px: number) {
    const ease = Math.min(1, dt * 0.6);
    const want = { rain: w.kind === "rain" ? w.k : 0, snow: w.kind === "snow" ? w.k : 0, petals: w.kind === "petals" ? w.k : 0, fog: w.kind === "fog" ? w.k : 0, cover: w.snowCover };
    for (const key of Object.keys(want) as (keyof typeof want)[]) this.k[key] += (want[key] - this.k[key]) * ease;
    const k = this.k;
    LOCK.uniforms.uSnow.value = k.cover;
    LOCK.uniforms.uWet.value = k.rain;
    // the box: wider and taller as the camera pulls back
    const wide = Math.max(40, Math.min(260, dist * 2.2));
    const tall = Math.max(18, Math.min(120, dist * 0.9));
    const set = (u: ReturnType<typeof uniforms>, speed: number, sway: number, flake: number, alpha: number, box = 1) => {
      u.uTime.value = t;
      u.uCentre.value.set(x, y - 2, z);
      u.uSize.value.set(wide * box, tall * box, wide * box);
      u.uSpeed.value = speed;
      u.uSway.value = sway;
      u.uPx.value = px;
      u.uFlake.value = flake;
      u.uAlpha.value = alpha;
    };
    const far = Math.max(1, dist / 30);
    set(this.ur, 26, 0, 0, 0.42 * k.rain);
    this.ur.uLen.value = Math.max(0.7, Math.min(4, dist * 0.035));
    set(this.us, 2.2, 0.7, 0.2 * far, 0.9 * k.snow);
    // the petals drift in a smaller box round the view: fewer of them, so closer together
    set(this.up, 1.2, 1.2, 0.34 * far, k.petals, 0.6);
    this.rain.visible = k.rain > 0.01;
    this.snow.visible = k.snow > 0.01;
    this.petals.visible = k.petals > 0.01;
  }

  dispose() {
    for (const o of [this.rain, this.snow, this.petals]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
}

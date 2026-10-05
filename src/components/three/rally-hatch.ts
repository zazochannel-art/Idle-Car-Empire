// The rally hatch: a short, wide hot hatchback in rally trim, modelled after
// the reference photo. Smooth and rounded: the body and the glasshouse are
// lofted from rounded cross-sections (no boxes), the wheel arches are round
// openings with fat flares round them, and the livery is painted on with
// curves — red, an orange swoosh sweeping up over the rear quarter onto the
// roof, a black tail behind it, curved hood stripes and mud splashes. Gold
// ten-spoke wheels, four X-taped rally lamps, a deep splitter, a roof wing.
// Standalone: not wired into the game yet. Units are metres; +X is
// forward, +Y up, +Z to the right; the wheels stand on y = 0.
import type * as THREE_NS from "three";

type Three = typeof THREE_NS;

const RED = "#d8261c";
const BLACK = "#222226";
const ORANGE = "#f39a1e";
const GOLD = "#d9993a";

/** Wheel layout. */
const L = { R: 0.39, tw: 0.3, xf: 1.27, xr: -1.27, track: 0.8, arch: 0.47 };
/** Glass starts above this height (the beltline). */
const BELT = 1.02;

/** Smooth curve through (x, value) points (Catmull-Rom), clamped at the ends. */
function spline(pts: [number, number][]) {
  return (x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = (x - p1[0]) / (p2[0] - p1[0]);
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * (p2[0] - p1[0]);
    const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * (p2[0] - p1[0]);
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}

/**
 * A closed rounded body lofted along x: at each station a superellipse
 * cross-section between `bottom` and `top`, `half` wide, narrowing towards
 * the top by `tuck` (tumblehome). Both ends are capped.
 */
function loft(T: Three, x0: number, x1: number, n: number, bottom: (x: number) => number, top: (x: number) => number, half: (x: number) => number, shape: number, tuck = 0) {
  const M = 36;
  const pos: number[] = [];
  const idx: number[] = [];
  const e = 2 / shape;
  for (let i = 0; i <= n; i++) {
    // denser stations near the ends, where the shape turns fastest
    const u = i / n;
    const x = x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(u * Math.PI));
    const b = bottom(x);
    const t = Math.max(b + 0.01, top(x));
    const yc = (b + t) / 2;
    const H = (t - b) / 2;
    const W = half(x);
    for (let k = 0; k < M; k++) {
      const a = (k / M) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const yy = Math.sign(s) * Math.pow(Math.abs(s), e);
      const narrow = 1 - tuck * Math.max(0, yy);
      pos.push(x, yc + H * yy, W * narrow * Math.sign(c) * Math.pow(Math.abs(c), e));
    }
  }
  for (let i = 0; i < n; i++)
    for (let k = 0; k < M; k++) {
      const a = i * M + k;
      const b = i * M + ((k + 1) % M);
      idx.push(a, a + M, b, b, a + M, b + M);
    }
  // end caps: a fan from each end's centre
  for (const [ring, flip] of [
    [0, true],
    [n, false],
  ] as [number, boolean][]) {
    const c = pos.length / 3;
    let cy = 0;
    for (let k = 0; k < M; k++) cy += pos[(ring * M + k) * 3 + 1];
    pos.push(pos[ring * M * 3], cy / M, 0);
    for (let k = 0; k < M; k++) {
      const a = ring * M + k;
      const b = ring * M + ((k + 1) % M);
      if (flip) idx.push(c, b, a);
      else idx.push(c, a, b);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The paint, drawn per pixel from the model-space position and normal:
 * the curved orange swoosh and the black tail, hood stripes, mud splashes,
 * dark glass above the beltline, and round openings over the wheels (the
 * inside of the body shows black through them, like a wheel well).
 */
function paintMaterial(T: Three) {
  const m = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.38, metalness: 0.1, side: T.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRed = { value: new T.Color(RED) };
    sh.uniforms.uBlack = { value: new T.Color(BLACK) };
    sh.uniforms.uOrange = { value: new T.Color(ORANGE) };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLiv;\nvarying vec3 vLivN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLiv = position;\nvLivN = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vLiv;
varying vec3 vLivN;
uniform vec3 uRed; uniform vec3 uBlack; uniform vec3 uOrange;
float gGlass = 0.0;
float blob(vec2 p, vec2 c, vec2 r) { return step(length((p - c) / r), 1.0); }`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec3 P = vLiv;
vec3 N = normalize(vLivN);
float az = abs(P.z);
// wheel openings: round holes in the flanks and the floor over each wheel
for (int w = 0; w < 2; w++) {
  float wx = w == 0 ? ${L.xf.toFixed(3)} : ${L.xr.toFixed(3)};
  if (length(vec2(P.x - wx, P.y - ${L.R.toFixed(3)})) < ${L.arch.toFixed(3)} && (az > 0.55 || P.y < 0.5)) discard;
}
vec3 paint = uRed;
// the band: a wide orange sash just behind the rear doors, gently curved,
// leaning back as it climbs and running straight across the roof; black tail behind
float h = clamp((P.y - 0.2) / 1.4, 0.0, 1.0);
float split = -1.02 - 0.32 * h + 0.07 * sin(h * 3.1416);
if (P.x < split + 0.46) paint = uOrange;
if (P.x < split + 0.46 && P.x > split + 0.4) paint = uOrange * 0.82;
if (P.x < split) paint = uBlack;
// the bonnet swoosh: one orange line with a black shadow, running diagonally
// from the left corner of the windscreen to the middle of the nose
if (N.y > 0.35 && P.x > 0.95 && P.x < 2.0 && P.y > 0.7) {
  float u = clamp((P.x - 0.95) / 1.05, 0.0, 1.0);
  float zc = -0.62 + 0.66 * pow(u, 1.25);
  float d = P.z - zc;
  if (d > 0.0 && d < 0.09) paint = uOrange;
  if (d > -0.045 && d <= 0.0) paint = uBlack;
}
// white mud splashes low on the flanks
if (az > 0.7 && P.y < 0.95) {
  vec2 p = P.xy;
  float s = blob(p, vec2(1.62, 0.84), vec2(0.18, 0.06)) + blob(p, vec2(1.85, 0.8), vec2(0.07, 0.05)) + blob(p, vec2(1.42, 0.88), vec2(0.06, 0.035))
          + blob(p, vec2(-0.25, 0.38), vec2(0.06, 0.04)) + blob(p, vec2(-0.4, 0.42), vec2(0.035, 0.025)) + blob(p, vec2(-1.86, 0.62), vec2(0.06, 0.04));
  if (s > 0.5) paint = vec3(0.96);
}
// mud thrown up on the roof edges and the top of the tailgate
if (P.y > 1.48 && az > 0.55) {
  float s = blob(P.xz, vec2(-0.05, sign(P.z) * 0.72), vec2(0.22, 0.12)) + blob(P.xz, vec2(-1.5, sign(P.z) * 0.68), vec2(0.16, 0.12));
  if (s > 0.5) paint = vec3(0.96);
}
// glass above the beltline: windscreen, side windows and the rear window,
// framed by the painted pillars and roof
if (P.y > ${BELT.toFixed(2)} + 0.05) {
  float roofEdge = P.y > 1.51 ? 1.0 : 0.0;
  bool front = N.x > 0.42 && az < 0.6;
  bool rear = N.x < -0.45 && az < 0.58 && P.y < 1.47;
  bool side = abs(N.z) > 0.5 && P.y < 1.5 && P.x < 0.86 - (P.y - 1.05) * 1.7 && P.x > -1.0 + (P.y - 1.05) * 0.35 && abs(P.x + 0.36) > 0.045;
  if ((front || rear || side) && roofEdge < 0.5) { paint = vec3(0.07, 0.075, 0.09); gGlass = 1.0; }
}
if (!gl_FrontFacing) paint = vec3(0.05);
vec4 diffuseColor = vec4( paint, opacity );`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.08, gGlass);");
  };
  m.customProgramCacheKey = () => "rally-hatch-paint";
  return m;
}

/** A taped rally lamp face: white glass with a black X of tape and a black rim. */
function lampTexture(T: Three) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1c1c20";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#f4f1e6";
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#1c1c20";
  g.lineWidth = 17;
  g.beginPath();
  g.moveTo(30, 30);
  g.lineTo(98, 98);
  g.moveTo(98, 30);
  g.lineTo(30, 98);
  g.stroke();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/** A rounded fat tyre (lathed) and a gold ten-spoke rim, facing +z. */
function wheel(T: Three, tyreM: THREE_NS.Material, rimM: THREE_NS.Material, hubM: THREE_NS.Material) {
  const w = new T.Group();
  const R = L.R;
  const h = L.tw / 2;
  const pts: [number, number][] = [
    [R * 0.66, -h],
    [R - 0.07, -h],
    [R - 0.02, -h + 0.03],
    [R, -h + 0.08],
    [R, h - 0.08],
    [R - 0.02, h - 0.03],
    [R - 0.07, h],
    [R * 0.66, h],
  ];
  const tyre = new T.Mesh(new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), 28), tyreM);
  tyre.rotation.x = Math.PI / 2;
  w.add(tyre);
  const face = h - 0.02;
  // dished barrel, then spokes and the centre cap
  const dish = new T.Mesh(new T.CylinderGeometry(R * 0.66, R * 0.55, 0.06, 28, 1), hubM);
  dish.rotation.x = Math.PI / 2;
  dish.position.z = face - 0.04;
  w.add(dish);
  const lip = new T.Mesh(new T.TorusGeometry(R * 0.66, 0.022, 8, 28), rimM);
  lip.position.z = face;
  w.add(lip);
  for (let k = 0; k < 10; k++) {
    const sp = new T.Mesh(new T.CapsuleGeometry(0.018, R * 0.5, 3, 6), rimM);
    const a = (k / 10) * Math.PI * 2;
    sp.position.set(Math.sin(a) * R * 0.34, Math.cos(a) * R * 0.34, face - 0.01);
    sp.rotation.z = -a;
    w.add(sp);
  }
  const hub = new T.Mesh(new T.SphereGeometry(0.075, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), rimM);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = face - 0.02;
  w.add(hub);
  return w;
}

/** A rounded blob (a squashed sphere). */
function blob(T: Three, mat: THREE_NS.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rz = 0) {
  const m = new T.Mesh(new T.SphereGeometry(1, 20, 12), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(0, ry, rz);
  return m;
}

/** A slab with soft edges: an extruded rounded rectangle with a round bevel. */
function rounded(T: Three, w: number, h: number, d: number, r: number, mat: THREE_NS.Material, x: number, y: number, z: number, rz = 0) {
  const s = new T.Shape();
  const W = w / 2;
  const Hh = h / 2;
  s.moveTo(-W + r, -Hh);
  s.lineTo(W - r, -Hh);
  s.quadraticCurveTo(W, -Hh, W, -Hh + r);
  s.lineTo(W, Hh - r);
  s.quadraticCurveTo(W, Hh, W - r, Hh);
  s.lineTo(-W + r, Hh);
  s.quadraticCurveTo(-W, Hh, -W, Hh - r);
  s.lineTo(-W, -Hh + r);
  s.quadraticCurveTo(-W, -Hh, -W + r, -Hh);
  const depth = Math.max(0.001, d - 2 * r);
  const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.9, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  const m = new T.Mesh(g, mat);
  m.position.set(x, y, z);
  m.rotation.z = rz;
  return m;
}

export function buildRallyHatch(T: Three): THREE_NS.Group {
  const car = new T.Group();
  const paint = paintMaterial(T);
  const trim = new T.MeshStandardMaterial({ color: "#1d1d21", roughness: 0.6 });
  const carbon = new T.MeshStandardMaterial({ color: "#36373c", roughness: 0.5 });
  const gold = new T.MeshStandardMaterial({ color: GOLD, roughness: 0.32, metalness: 0.4 });
  const tyreM = new T.MeshStandardMaterial({ color: "#1b1b1e", roughness: 0.85 });
  const tail = new T.MeshStandardMaterial({ color: "#c0141b", emissive: "#ff2a2a", emissiveIntensity: 0.4, roughness: 0.25 });
  const chrome = new T.MeshStandardMaterial({ color: "#c2c6cd", roughness: 0.25, metalness: 0.85 });
  const lampFace = new T.MeshStandardMaterial({ map: lampTexture(T), roughness: 0.3 });

  // ── the body: a rounded tub from the nose to the tail ──
  const bodyTop = spline([
    [-2.06, 0.5],
    [-2.0, 0.86],
    [-1.86, 1.0],
    [-1.2, 1.03],
    [0.3, 1.03],
    [1.0, 1.0],
    [1.55, 0.9],
    [1.9, 0.8],
    [2.06, 0.66],
    [2.13, 0.42],
  ]);
  const bodyBottom = spline([
    [-2.06, 0.4],
    [-1.95, 0.26],
    [1.95, 0.24],
    [2.13, 0.34],
  ]);
  // widest over the wheels (the flared arches), tucked in at the ends
  const bodyHalf = spline([
    [-2.06, 0.66],
    [-1.92, 0.84],
    [-1.27, 0.92],
    [0, 0.86],
    [1.27, 0.92],
    [1.95, 0.84],
    [2.13, 0.62],
  ]);
  car.add(new T.Mesh(loft(T, -2.06, 2.13, 64, bodyBottom, bodyTop, bodyHalf, 3.8, 0.05), paint));

  // ── the glasshouse: a rounded hood over the cabin, painted with glass ──
  const cabTop = spline([
    [-1.98, 0.96],
    [-1.86, 1.2],
    [-1.62, 1.47],
    [-0.9, 1.6],
    [0.0, 1.58],
    [0.5, 1.4],
    [0.95, 1.12],
    [1.12, 0.96],
  ]);
  const cabHalf = spline([
    [-1.98, 0.76],
    [-1.7, 0.84],
    [0.6, 0.84],
    [1.12, 0.76],
  ]);
  car.add(new T.Mesh(loft(T, -1.98, 1.12, 56, () => 0.9, cabTop, cabHalf, 4.6, 0.13), paint));

  // ── fat flares round the arches ──
  for (const x of [L.xf, L.xr])
    for (const s of [-1, 1]) {
      const f = new T.Mesh(new T.TorusGeometry(L.arch + 0.03, 0.075, 10, 24, Math.PI), paint);
      f.position.set(x, L.R, s * (bodyHalf(x) - 0.06));
      f.scale.set(1, 1, 1.6);
      car.add(f);
    }
  // side skirts between the arches
  for (const s of [-1, 1]) car.add(rounded(T, L.xf - L.xr - 2 * L.arch - 0.06, 0.08, 0.1, 0.03, carbon, (L.xf + L.xr) / 2, 0.27, s * 0.8));

  // ── nose: intake, splitter, headlights, rally lamps ──
  // the big black intake, split by vertical fins
  car.add(rounded(T, 0.12, 0.28, 1.36, 0.05, trim, 2.08, 0.42, 0));
  for (const z of [-0.5, -0.25, 0, 0.25, 0.5]) car.add(rounded(T, 0.1, 0.24, 0.03, 0.01, carbon, 2.08, 0.42, z, -0.15));
  // deep splitter with fins underneath and canards on the corners
  car.add(rounded(T, 0.46, 0.045, 1.84, 0.02, carbon, 2.07, 0.21, 0));
  for (const z of [-0.6, -0.2, 0.2, 0.6]) car.add(rounded(T, 0.34, 0.1, 0.03, 0.012, carbon, 2.05, 0.27, z));
  for (const s of [-1, 1]) {
    car.add(rounded(T, 0.3, 0.025, 0.16, 0.01, carbon, 1.98, 0.46, s * 0.86, 0.12));
    car.add(rounded(T, 0.24, 0.025, 0.12, 0.01, carbon, 1.98, 0.36, s * 0.87, 0.12));
  }
  // six rally lamps in a row across the nose, taped with an X (the outer
  // ones stand where the headlights would be, set a little further back)
  for (const z of [-0.7, -0.5, -0.3, 0.3, 0.5, 0.7]) {
    const back = Math.abs(z) > 0.6 ? 0.07 : Math.abs(z) > 0.4 ? 0.03 : 0;
    const x = 2.03 - back;
    const housing = new T.Mesh(new T.CylinderGeometry(0.092, 0.1, 0.14, 20, 1), trim);
    housing.rotation.z = -Math.PI / 2;
    housing.position.set(x, 0.68, z);
    car.add(housing);
    const face = new T.Mesh(new T.CircleGeometry(0.083, 24), lampFace);
    face.rotation.y = Math.PI / 2;
    face.position.set(x + 0.072, 0.68, z);
    car.add(face);
  }
  // the square tow-hook plate in the middle
  car.add(rounded(T, 0.06, 0.1, 0.1, 0.015, trim, 2.12, 0.66, 0));

  // ── mirrors: gold rounded caps on short black arms ──
  for (const s of [-1, 1]) {
    car.add(rounded(T, 0.08, 0.04, 0.12, 0.015, trim, 0.86, 1.06, s * 0.84));
    car.add(rounded(T, 0.16, 0.11, 0.13, 0.04, gold, 0.84, 1.1, s * 0.93));
  }

  // ── roof spoiler: a low black lip along the rear edge of the roof, overhanging the tailgate ──
  car.add(rounded(T, 0.42, 0.045, 1.46, 0.02, trim, -1.76, 1.53, 0, -0.06));
  for (const s of [-1, 1]) car.add(rounded(T, 0.42, 0.1, 0.035, 0.014, trim, -1.76, 1.52, s * 0.74, -0.06));
  car.add(rounded(T, 0.06, 0.1, 1.2, 0.02, trim, -1.98, 1.5, 0));

  // ── tail: lights, plate recess, diffuser, twin exhausts ──
  for (const s of [-1, 1]) car.add(blob(T, tail, -2.0, 0.86, s * 0.58, 0.05, 0.07, 0.18));
  car.add(rounded(T, 0.06, 0.12, 0.42, 0.02, trim, -2.05, 0.6, 0));
  car.add(rounded(T, 0.3, 0.12, 1.4, 0.03, carbon, -1.98, 0.28, 0));
  for (let k = -3; k <= 3; k++) car.add(rounded(T, 0.24, 0.11, 0.025, 0.01, trim, -2.03, 0.29, k * 0.19));
  for (const z of [-0.46, -0.3]) {
    const ex = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.2, 16, 1, true), chrome);
    ex.rotation.z = Math.PI / 2;
    ex.position.set(-2.1, 0.32, z);
    car.add(ex);
  }

  // ── wheels ──
  for (const x of [L.xf, L.xr])
    for (const s of [-1, 1]) {
      const w = wheel(T, tyreM, gold, trim);
      w.position.set(x, L.R, s * L.track);
      if (s < 0) w.rotation.y = Math.PI;
      car.add(w);
    }

  car.traverse((o) => {
    const m = o as THREE_NS.Mesh;
    if (!m.isMesh) return;
    // the paint is drawn from model-space positions: bake painted parts in place
    if (m.material === paint && m.parent === car) {
      m.updateMatrix();
      m.geometry.applyMatrix4(m.matrix);
      m.geometry.computeVertexNormals();
      m.position.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      m.scale.set(1, 1, 1);
    }
    m.castShadow = true;
    m.receiveShadow = true;
  });
  return car;
}

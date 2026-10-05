// The rally hatch: a short, wide hot hatchback in rally trim, modelled after
// the reference photo — red body, black tail behind an orange band that
// sweeps up over the rear quarter and the roof, gold multi-spoke wheels,
// wide flares, four taped rally lamps in the bumper, a deep splitter and a
// roof wing. Low-poly on purpose (flat-shaded facets, chunky bevels).
// Standalone: not wired into the game yet. Units are metres; +X is
// forward, +Y up, +Z to the right; the wheels stand on y = 0.
import type * as THREE_NS from "three";

type Three = typeof THREE_NS;

const RED = "#d8261c";
const BLACK = "#26262b";
const ORANGE = "#f39a1e";
const GOLD = "#d9993a";

/** Body and wheel layout. */
const L = { R: 0.39, tw: 0.28, xf: 1.27, xr: -1.27, track: 0.8, W: 1.8, arch: 0.48 };

/**
 * The paint: red, a black tail behind a slanted orange band (further back
 * the higher it goes, so it sweeps over the roof), a thin hood stripe and a
 * few white mud splashes on the flanks. Drawn per pixel from the model-space
 * position, so the band edges stay crisp on big faces.
 */
function liveryMaterial(T: Three) {
  const m = new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.42, metalness: 0.08, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRed = { value: new T.Color(RED) };
    sh.uniforms.uBlack = { value: new T.Color(BLACK) };
    sh.uniforms.uOrange = { value: new T.Color(ORANGE) };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLiv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLiv = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vLiv;
uniform vec3 uRed; uniform vec3 uBlack; uniform vec3 uOrange;
float splash(vec2 p, vec2 c, float r) { return step(length((p - c) * vec2(1.0, 1.6)), r); }`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec3 paint = uRed;
float split = -0.6 - (vLiv.y - 0.35) * 0.58;
if (vLiv.x < split + 0.24) paint = uOrange;
if (vLiv.x < split + 0.07 && vLiv.x > split + 0.03) paint = uBlack;
if (vLiv.x < split) paint = uBlack;
// hood stripe: a thin orange line edged in black on each side of the bonnet
float az = abs(vLiv.z);
if (vLiv.y > 0.8 && vLiv.x > 0.45 && vLiv.x < 1.95 && vLiv.x > split + 0.3) {
  if (az > 0.36 && az < 0.42) paint = uOrange;
  if (az > 0.42 && az < 0.45) paint = uBlack;
}
// white mud splashes low on the flanks
if (az > 0.8) {
  vec2 p = vLiv.xy;
  float s = splash(p, vec2(1.72, 0.58), 0.07) + splash(p, vec2(1.6, 0.52), 0.045) + splash(p, vec2(1.84, 0.5), 0.035)
          + splash(p, vec2(-0.2, 0.36), 0.05) + splash(p, vec2(-0.32, 0.4), 0.03) + splash(p, vec2(-1.85, 0.62), 0.05);
  if (s > 0.5) paint = vec3(0.95);
}
vec4 diffuseColor = vec4( paint, opacity );`,
      );
  };
  // the patched shader differs from a plain standard material's
  m.customProgramCacheKey = () => "rally-hatch-livery";
  return m;
}

/** A side profile (x along the car, y up) extruded across the car, centred on z = 0. */
function slab(T: Three, pts: [number, number][], width: number, mat: THREE_NS.Material, bevel = 0.05, arches = false) {
  const s = new T.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  if (arches) {
    // underside from the tail to the nose, cut round both wheels
    const y0 = pts[0][1];
    for (const x of [L.xr, L.xf]) {
      s.lineTo(x - L.arch, y0);
      s.lineTo(x - L.arch, L.R);
      s.absarc(x, L.R, L.arch, Math.PI, 0, true);
      s.lineTo(x + L.arch, y0);
    }
  }
  s.closePath();
  const depth = width - bevel * 2;
  const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 9 });
  g.translate(0, 0, -depth / 2);
  return new T.Mesh(g, mat);
}

function box(T: Three, w: number, h: number, d: number, mat: THREE_NS.Material, x: number, y: number, z: number, rz = 0, ry = 0) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(0, ry, rz);
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
  g.lineCap = "butt";
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

/** Fat tyre and a gold rim with ten spokes, facing +z (flip for the left side). */
function wheel(T: Three, tyreM: THREE_NS.Material, rimM: THREE_NS.Material, hubM: THREE_NS.Material) {
  const w = new T.Group();
  const tyre = new T.Mesh(new T.CylinderGeometry(L.R, L.R, L.tw, 16, 1), tyreM);
  tyre.rotation.x = Math.PI / 2;
  w.add(tyre);
  // tread shoulders: a slightly smaller ring each side
  for (const s of [-1, 1]) {
    const sh = new T.Mesh(new T.CylinderGeometry(L.R * 0.93, L.R * 0.93, 0.03, 16, 1), tyreM);
    sh.rotation.x = Math.PI / 2;
    sh.position.z = (s * (L.tw + 0.03)) / 2;
    w.add(sh);
  }
  const face = L.tw / 2 + 0.02;
  const barrel = new T.Mesh(new T.CylinderGeometry(L.R * 0.68, L.R * 0.68, 0.03, 16, 1), hubM);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = face - 0.01;
  w.add(barrel);
  const lip = new T.Mesh(new T.TorusGeometry(L.R * 0.68, 0.024, 4, 16), rimM);
  lip.position.z = face;
  w.add(lip);
  for (let k = 0; k < 10; k++) {
    const sp = new T.Mesh(new T.BoxGeometry(0.04, L.R * 0.62, 0.03), rimM);
    const a = (k / 10) * Math.PI * 2;
    sp.position.set(Math.sin(a) * L.R * 0.34, Math.cos(a) * L.R * 0.34, face);
    sp.rotation.z = -a;
    w.add(sp);
  }
  const hub = new T.Mesh(new T.CylinderGeometry(0.06, 0.07, 0.05, 8, 1), rimM);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = face + 0.01;
  w.add(hub);
  const nut = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.03, 6, 1), hubM);
  nut.rotation.x = Math.PI / 2;
  nut.position.z = face + 0.04;
  w.add(nut);
  return w;
}

export function buildRallyHatch(T: Three): THREE_NS.Group {
  const car = new T.Group();
  const paint = liveryMaterial(T);
  const glass = new T.MeshStandardMaterial({ color: "#16181d", roughness: 0.12, metalness: 0.3, flatShading: true });
  const trim = new T.MeshStandardMaterial({ color: "#1f1f23", roughness: 0.7, flatShading: true });
  const carbon = new T.MeshStandardMaterial({ color: "#3a3b40", roughness: 0.55, flatShading: true });
  const gold = new T.MeshStandardMaterial({ color: GOLD, roughness: 0.38, metalness: 0.35, flatShading: true });
  const tyreM = new T.MeshStandardMaterial({ color: "#1b1b1e", roughness: 0.9, flatShading: true });
  const head = new T.MeshStandardMaterial({ color: "#eef3f7", emissive: "#cfe4ff", emissiveIntensity: 0.25, roughness: 0.2, flatShading: true });
  const tail = new T.MeshStandardMaterial({ color: "#c0141b", emissive: "#ff2a2a", emissiveIntensity: 0.35, roughness: 0.3, flatShading: true });
  const chrome = new T.MeshStandardMaterial({ color: "#b8bcc4", roughness: 0.3, metalness: 0.8, flatShading: true });
  const lampFace = new T.MeshStandardMaterial({ map: lampTexture(T), roughness: 0.35, flatShading: true });

  // ── lower body: bonnet, beltline and tail, cut round the wheels ──
  // (the profile runs nose → tail along the top, then back underneath)
  car.add(
    slab(
      T,
      [
        [1.98, 0.24],
        [2.08, 0.46],
        [2.06, 0.74],
        [1.8, 0.84],
        [1.0, 0.98],
        [0.3, 1.02],
        [-1.2, 1.03],
        [-1.98, 1.0],
        [-2.06, 0.5],
        [-1.96, 0.24],
      ],
      L.W,
      paint,
      0.07,
      true,
    ),
  );

  // ── the cabin: dark glass all round, painted roof, pillars and rear quarters ──
  const cabin = slab(
    T,
    [
      [1.02, 0.94],
      [0.08, 1.52],
      [-1.38, 1.55],
      [-1.86, 1.12],
      [-1.86, 0.94],
    ],
    1.5,
    glass,
    0.05,
  );
  car.add(cabin);
  // roof panel over the glass
  car.add(
    slab(
      T,
      [
        [0.14, 1.52],
        [-1.42, 1.56],
        [-1.46, 1.63],
        [0.06, 1.6],
      ],
      1.58,
      paint,
      0.04,
    ),
  );
  // rear quarter and tailgate frame (black under the livery band)
  car.add(
    slab(
      T,
      [
        [-1.02, 0.98],
        [-1.2, 1.5],
        [-1.42, 1.57],
        [-1.9, 1.12],
        [-1.9, 0.98],
      ],
      1.53,
      paint,
      0.04,
    ),
  );
  // the rear window, set into the tailgate
  car.add(
    slab(
      T,
      [
        [-1.5, 1.5],
        [-1.86, 1.16],
        [-1.9, 1.18],
        [-1.55, 1.52],
      ],
      1.24,
      glass,
      0.02,
    ),
  );
  // A- and B-pillars
  const aLen = Math.hypot(1.02 - 0.08, 1.52 - 0.94);
  const aAng = Math.atan2(1.52 - 0.94, 0.08 - 1.02);
  for (const s of [-1, 1]) {
    car.add(box(T, aLen, 0.08, 0.08, paint, (1.02 + 0.08) / 2, (0.94 + 1.52) / 2 + 0.02, s * 0.75, aAng));
    car.add(box(T, 0.09, 0.52, 0.04, trim, -0.36, 1.27, s * 0.77, -0.04));
    // a painted sill under the side windows
    car.add(box(T, 2.7, 0.06, 0.06, paint, -0.42, 1.0, s * 0.76));
  }

  // ── wide flares over the wheels ──
  for (const x of [L.xf, L.xr]) {
    for (const s of [-1, 1]) {
      const ring = new T.Shape();
      ring.absarc(0, 0, L.arch + 0.15, 0, Math.PI, false);
      ring.lineTo(-L.arch - 0.02, 0);
      ring.absarc(0, 0, L.arch + 0.02, Math.PI, 0, true);
      ring.closePath();
      const g = new T.ExtrudeGeometry(ring, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 1, curveSegments: 8 });
      g.translate(x, L.R, s > 0 ? L.W / 2 - 0.1 : -L.W / 2 - 0.06);
      car.add(new T.Mesh(g, paint));
      // black arch liner inside
      const lg = new T.ExtrudeGeometry(
        (() => {
          const r = new T.Shape();
          r.absarc(0, 0, L.arch + 0.02, 0, Math.PI, false);
          r.lineTo(-L.arch + 0.04, 0);
          r.absarc(0, 0, L.arch - 0.04, Math.PI, 0, true);
          r.closePath();
          return r;
        })(),
        { depth: 0.5, bevelEnabled: false, curveSegments: 8 },
      );
      lg.translate(x, L.R, s > 0 ? L.W / 2 - 0.5 : -L.W / 2);
      car.add(new T.Mesh(lg, trim));
    }
    // side skirts between the arches
  }
  for (const s of [-1, 1]) car.add(box(T, L.xf - L.xr - 2 * L.arch - 0.1, 0.1, 0.08, carbon, (L.xf + L.xr) / 2, 0.26, s * (L.W / 2 + 0.02)));

  // ── nose: intake, grille, splitter, lights, rally lamps ──
  car.add(box(T, 0.12, 0.2, 1.3, trim, 2.06, 0.37, 0));
  for (let k = -2; k <= 2; k++) car.add(box(T, 0.02, 0.18, 0.03, carbon, 2.13, 0.37, k * 0.24));
  car.add(box(T, 0.06, 0.12, 0.42, trim, 2.08, 0.6, 0));
  car.add(box(T, 0.02, 0.05, 0.08, chrome, 2.12, 0.61, 0));
  // splitter: a deep blade with fins underneath
  car.add(box(T, 0.42, 0.04, 1.84, carbon, 2.04, 0.2, 0));
  for (const z of [-0.6, -0.2, 0.2, 0.6]) car.add(box(T, 0.36, 0.1, 0.03, carbon, 2.02, 0.26, z));
  // headlights at the corners of the bonnet
  for (const s of [-1, 1]) {
    car.add(box(T, 0.16, 0.16, 0.46, trim, 1.98, 0.76, s * 0.56, -0.28));
    car.add(box(T, 0.19, 0.1, 0.36, head, 2.0, 0.78, s * 0.56, -0.28));
  }
  // four rally lamps along the bumper, taped with an X
  for (const z of [-0.72, -0.48, 0.48, 0.72]) {
    const housing = new T.Mesh(new T.CylinderGeometry(0.095, 0.1, 0.09, 12, 1), trim);
    housing.rotation.z = -Math.PI / 2;
    housing.position.set(2.13, 0.6, z);
    car.add(housing);
    const face = new T.Mesh(new T.CircleGeometry(0.085, 14), lampFace);
    face.rotation.y = Math.PI / 2;
    face.position.set(2.18, 0.6, z);
    car.add(face);
  }

  // ── mirrors (gold caps) ──
  for (const s of [-1, 1]) {
    car.add(box(T, 0.06, 0.04, 0.12, trim, 0.9, 1.04, s * 0.82));
    car.add(box(T, 0.17, 0.12, 0.13, gold, 0.87, 1.09, s * 0.93, 0, s * 0.2));
  }

  // ── roof: vent scoop and a wing over the tailgate ──
  car.add(box(T, 0.3, 0.06, 0.4, trim, -0.25, 1.64, 0, 0.08));
  car.add(box(T, 0.06, 0.05, 0.36, carbon, -0.1, 1.65, 0));
  car.add(box(T, 0.42, 0.04, 1.56, trim, -1.62, 1.72, 0, -0.12));
  for (const s of [-1, 1]) {
    car.add(box(T, 0.4, 0.16, 0.03, trim, -1.6, 1.68, s * 0.77, -0.12));
    car.add(box(T, 0.08, 0.12, 0.05, trim, -1.45, 1.63, s * 0.4));
  }
  // bonnet vents
  for (const s of [-1, 1]) car.add(box(T, 0.26, 0.02, 0.18, trim, 1.42, 0.93, s * 0.17, -0.18));

  // ── tail: lights, diffuser, twin exhausts ──
  for (const s of [-1, 1]) car.add(box(T, 0.06, 0.14, 0.36, tail, -2.05, 0.86, s * 0.6));
  car.add(box(T, 0.1, 0.06, 0.5, chrome, -2.08, 0.58, 0));
  car.add(box(T, 0.3, 0.12, 1.5, carbon, -2.0, 0.26, 0));
  for (let k = -3; k <= 3; k++) car.add(box(T, 0.26, 0.12, 0.025, trim, -2.04, 0.28, k * 0.2));
  for (const z of [-0.45, -0.3]) {
    const ex = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.2, 10, 1, true), chrome);
    ex.rotation.z = Math.PI / 2;
    ex.position.set(-2.1, 0.3, z);
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
    if (m.isMesh) {
      // the livery is drawn from model-space positions: bake painted parts in place
      if (m.material === paint && m.parent === car) {
        m.updateMatrix();
        m.geometry.applyMatrix4(m.matrix);
        m.position.set(0, 0, 0);
        m.rotation.set(0, 0, 0);
        m.scale.set(1, 1, 1);
      }
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return car;
}

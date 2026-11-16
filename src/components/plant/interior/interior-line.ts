// The production lines: stations, parts, people, robots, vehicles, the crane and the effects.
// Drawn for InteriorEngine (interior-engine.ts): its methods moved here as functions of the engine.
import { CYCLE, MIN_TRANSFER, MOVE, PART_SIZE, PERSON_SIZE, POSES, PROP_SIZE, ROBOT_SIZE, STATION_SIZE, VEHICLE_SIZE, along, glowSprite, smooth, tierCap } from "./interior-shared";
import { type Interior, type Line, type PartKind, type PlacedStation, type PropKind, type StationDef, type StationId, lineStops } from "./layout";
import type { InteriorEngine, InteriorScene } from "./interior-engine";
import type { WorkerRole } from "../../three/interior-models";
import { christmasTree, flowerPot, parasol, pumpkin } from "./hall-art";
import { drawModel, drawTruck } from "../../map/vehicles";
import { liveryOf } from "../../three/livery";
import { sprites3d } from "../../three/sprites";
import { sx, sy } from "../../map/iso";

/** A painted walking arrow (pointing along +x). */
export function chevron(e: InteriorEngine, x: number, y: number, color: string) {
  const c = e.ctx;
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(sx(x - 0.15, y - 0.12), sy(x - 0.15, y - 0.12));
  c.lineTo(sx(x + 0.1, y), sy(x + 0.1, y));
  c.lineTo(sx(x - 0.15, y + 0.12), sy(x - 0.15, y + 0.12));
  c.stroke();
}

/** Yellow-black hatching on the floor (keep clear). */
export function hatch(e: InteriorEngine, x: number, y: number, w: number, d: number) {
  const c = e.ctx;
  const p = e.p;
  c.save();
  c.beginPath();
  c.moveTo(sx(x, y), sy(x, y));
  c.lineTo(sx(x + w, y), sy(x + w, y));
  c.lineTo(sx(x + w, y + d), sy(x + w, y + d));
  c.lineTo(sx(x, y + d), sy(x, y + d));
  c.closePath();
  c.clip();
  p.quad(x, y, w, d, "rgba(250,204,21,0.55)");
  c.strokeStyle = "rgba(17,24,39,0.6)";
  c.lineWidth = 4;
  c.beginPath();
  for (let k = -w; k < d + w; k += 0.35) {
    c.moveTo(sx(x, y + k), sy(x, y + k));
    c.lineTo(sx(x + w, y + k + w), sy(x + w, y + k + w));
  }
  c.stroke();
  c.restore();
}

/** A soft dark patch on the floor under a machine (ambient occlusion). */
export function contactShade(e: InteriorEngine, x: number, y: number, rx: number, a = 0.22) {
  const c = e.ctx;
  const [px, py] = [sx(x, y), sy(x, y)];
  c.save();
  c.translate(px, py);
  c.scale(1, 0.5);
  const g = c.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  g.addColorStop(0, `rgba(10,14,20,${a})`);
  g.addColorStop(1, "rgba(10,14,20,0)");
  c.fillStyle = g;
  c.fillRect(-rx, -rx, rx * 2, rx * 2);
  c.restore();
}

export function drawLine(e: InteriorEngine, s: InteriorScene, L: Interior, line: Line, focus: boolean) {
  const p = e.p;
  const c = e.ctx;
  const stops = lineStops(line);
  const n = stops.length;
  // phase of the transfer (lines are a little out of step with each other)
  const clock = e.beat + line.index * 0.25;
  const ph = clock - Math.floor(clock);
  const steps = Math.max(1, n - 1);
  const per = s.cycle && s.cycle > 0 ? Math.max(MIN_TRANSFER, s.cycle / steps) : CYCLE;
  // the glide takes about MOVE seconds, the rest of the transfer is work
  const glide = Math.max(0.15, Math.min(0.45, MOVE / per));
  const moving = s.running && ph < glide;
  const mk = moving ? smooth(ph / glide) : 1;
  const working = s.running && !moving;
  const k = tierCap(e.cam.zoom * e.dpr);
  const near = e.cam.zoom > 0.5;
  const floor = s.spec.floor;

  // planned bays: just the painted outline and the station's name; on the
  // shop floor the next one to build is marked out in green
  for (const st of line.stations) {
    if (st.mode === "planned") {
      const next = !!floor && st.slot === floor.machines;
      p.quadStroke(st.x, line.belt - 1, st.w, 2, next ? "rgba(74,222,128,0.9)" : "rgba(255,255,255,0.55)", next ? 2 : 1.5, [6, 6]);
      if (next) p.quad(st.x, line.belt - 1, st.w, 2, `rgba(74,222,128,${0.1 + Math.sin(e.t * 3) * 0.05})`);
    } else {
      p.quad(st.x, line.belt - 1.05, st.w, 2.1, "rgba(30,41,59,0.18)");
      p.quadStroke(st.x, line.belt - 1.05, st.w, 2.1, "rgba(250,204,21,0.75)", 1.2);
    }
  }

  // 0. the back of each bay: steel columns, and pallets, dies and cages by the machines
  for (const st of line.stations) {
    const props = st.mode === "planned" ? [] : (st.def.props ?? []);
    props.forEach((kind, j) => prop(e, kind, st.x + 0.65 + j * 1.6, line.y0 + 0.75, s, k));
  }
  // columns stand along the back wall only, so they never hide a hall behind them
  if (line.index === 0) for (const cx of [4.1, 11.2, 18.3]) {
    const [col, top] = e.look.column;
    p.box(cx - 0.12, line.y0 + 0.05, 0.24, 0.24, 0, 88, col, top);
    if (e.look.era === "hightech") p.box(cx - 0.15, line.y0 + 0.02, 0.3, 0.3, 4, 1.5, e.look.lines);
    else if (e.look.era === "factory") p.box(cx - 0.17, line.y0, 0.34, 0.34, 0, 6, "#facc15", "#fde047");
  }

  // machines sit on the floor: a soft shade around their feet
  for (const st of stops) if (st.def.staff > 0 || st.def.machine === "sheetRack" || st.def.machine === "bodyRack") contactShade(e, st.stop.x, st.stop.y - 0.45, st.w * 30, 0.2);

  // work lamps: a lit machine is a manned, working one
  for (const st of stops)
    if (s.running && st.def.staff > 0 && st.staffed) p.light(sx(st.stop.x, st.stop.y - 0.4), sy(st.stop.x, st.stop.y - 0.4, 2), 48, "#fff3c4", 0.2);

  // 1. what stands behind the belt
  for (const st of stops) station(e, s, st, "back", working, k);

  // 2. the belt (or benches before the conveyor)
  const x0 = stops[0].stop.x;
  const x1 = stops[n - 1].stop.x;
  if (line.conveyor) {
    p.box(x0 - 0.5, line.belt - 0.32, x1 - x0 + 1, 0.64, 0, 4, "#3a4350", "#2a313b");
    if (near) {
      c.strokeStyle = "rgba(148,163,184,0.55)";
      c.lineWidth = 1;
      c.beginPath();
      const off = s.running ? (e.work * 0.9) % 0.3 : 0;
      for (let u = x0 - 0.5 + off; u < x1 + 0.5; u += 0.3) {
        c.moveTo(sx(u, line.belt - 0.3), sy(u, line.belt - 0.3, 4));
        c.lineTo(sx(u, line.belt + 0.3), sy(u, line.belt + 0.3, 4));
      }
      c.stroke();
    }
    // guard rails
    p.line(x0 - 0.5, line.belt + 0.34, x1 + 0.5, line.belt + 0.34, "#facc15", 1.5, 7);
  } else {
    // Levels 1-2: parts wait on trolleys and benches, pushed by hand
    for (const st of stops) p.box(st.stop.x - 0.4, line.belt - 0.3, 0.8, 0.6, 0, 3, "#7c5a3a", "#8b6a48");
  }

  // 3. parts on the line: one per station, each a step further along.
  // While moving, a part shows what the station it left made of it; at a
  // station it changes into the station's product halfway through the work.
  const late = working && ph > glide + (1 - glide) * 0.5;
  for (let i = 0; i < n; i++) {
    if (moving) {
      if (i === n - 1) continue; // the last one went onto the rack
      const a = stops[i];
      const b = stops[i + 1];
      part(e, s, a.def, a.stop.x + (b.stop.x - a.stop.x) * mk, line.belt, line.conveyor ? 4 : 3, k);
    } else {
      const st = stops[i];
      const shown = i === 0 || late ? st.def : stops[i - 1].def;
      part(e, s, shown, st.stop.x, line.belt, line.conveyor ? 4 : 3, k);
    }
  }
  // the finished store fills with the plant's real stock (cars and bodies on the racks)
  const fin = stops[n - 1];
  if (fin.def.part === "car") {
    const racked = Math.min(6, Math.round(s.out * 6));
    for (let r = 0; r < racked; r++) {
      const rx = fin.x + 0.6 + (r % 3) * 0.95;
      const lv = Math.floor(r / 3);
      car(e, s, fin.def.stage ?? 0, rx, line.belt - 0.62, 18 + lv * 20);
    }
  }

  // 4. what stands in front of the belt
  for (const st of stops) station(e, s, st, "front", working, k);

  // effects: sparks, laser, heat, paint mist, the QC scan (a machine without
  // its operator works in fits and starts)
  for (const st of stops) {
    if (!working || (!st.staffed && Math.sin(e.t * 2 + st.x) < 0)) continue;
    const { x, y } = st.stop;
    switch (st.def.fx) {
      case "sparks":
        if (st.mode === "robot" || st.def.role === "welder") sparks(e, x, y);
        break;
      case "laser":
        p.light(sx(x, y), sy(x, y, 8), 18, "#ff6a3d", 0.6);
        break;
      case "heat":
        p.light(sx(x - 0.4, y - 0.5), sy(x - 0.4, y - 0.5, 10), 34 + Math.sin(e.t * 3 + x) * 4, "#ff8a3d", 0.55);
        if (near && !e.low) steam(e, x - 0.3, y - 0.6);
        break;
      case "spray":
        for (let i = 0; i < 3; i++) p.light(sx(x - 0.6 + i * 0.6, y - 0.2), sy(x - 0.6 + i * 0.6, y - 0.2, 12), 16 + ((e.t * 40 + i * 7) % 8), s.color, 0.45);
        break;
      case "scan": {
        const u = st.x + 0.4 + ((e.t * 0.8) % 1) * (st.w - 0.8);
        p.line(u, line.belt - 0.6, u, line.belt + 0.6, "rgba(56,189,248,0.9)", 2, 14);
        p.light(sx(u, line.belt), sy(u, line.belt, 14), 22, "#38bdf8", 0.5);
        break;
      }
    }
  }
  // a stack light on every machine: green working, amber blinking without its operator;
  // while the line waits (the reason is tagged where it is) they glow a calm amber: standby
  const down = line.index === 0 ? e.brokenStation() : undefined;
  for (const st of stops) {
    if (st.def.staff === 0) continue;
    if (st === down) {
      const lit = Math.sin(e.t * 8) > 0;
      p.box(st.x + st.w - 0.35, line.belt - 0.95, 0.12, 0.12, 0, 24, "#475569");
      p.box(st.x + st.w - 0.38, line.belt - 0.98, 0.18, 0.18, 24, 4, lit ? "#ef4444" : "#7f1d1d");
      if (lit) p.light(sx(st.x + st.w - 0.3, line.belt - 0.9), sy(st.x + st.w - 0.3, line.belt - 0.9, 26), 26, "#ef4444", 0.7);
      continue;
    }
    const [on, off] = !s.running ? ["#f59e0b", "#b45309"] : st.staffed ? ["#22c55e", "#22c55e"] : ["#f59e0b", "#78350f"];
    const lit = s.running ? st.staffed || Math.sin(e.t * 2.5) > 0 : Math.sin(e.t * 1.2 + st.x * 0.3) > -0.3;
    p.box(st.x + st.w - 0.35, line.belt - 0.95, 0.12, 0.12, 0, 24, "#475569");
    p.box(st.x + st.w - 0.38, line.belt - 0.98, 0.18, 0.18, 24, 4, lit ? on : off);
    if (lit) p.light(sx(st.x + st.w - 0.3, line.belt - 0.9), sy(st.x + st.w - 0.3, line.belt - 0.9, 26), 18, on, s.running ? 0.45 : 0.3);
  }

  // the broken machine: dark smoke, a red glow, and the call to fix it
  if (down) {
    smoke(e, down.stop.x, down.stop.y - 0.5);
    p.light(sx(down.stop.x, down.stop.y), sy(down.stop.x, down.stop.y, 14), 46 + Math.sin(e.t * 6) * 6, "#ef4444", 0.35);
    if (s.words?.tapRepair) p.tag(`🔧 ${s.words.tapRepair}`, down.stop.x, line.belt - 0.4, 48 + Math.sin(e.t * 4) * 3, { size: 10, bg: "rgba(220,38,38,0.95)" });
  }
  // a boost: the belt hums with light
  if ((s.boost ?? 0) > 0 && line.conveyor && stops.length) {
    const x0b = stops[0].stop.x - 0.5;
    const x1b = stops[stops.length - 1].stop.x + 0.5;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = "rgba(34,211,238,0.85)";
    c.lineWidth = 1.6;
    c.setLineDash([10, 14]);
    c.lineDashOffset = -e.t * 120;
    for (const dy of [-0.34, 0.34]) {
      c.beginPath();
      c.moveTo(sx(x0b, line.belt + dy), sy(x0b, line.belt + dy, 4.5));
      c.lineTo(sx(x1b, line.belt + dy), sy(x1b, line.belt + dy, 4.5));
      c.stroke();
    }
    c.restore();
    for (const st of stops) if (st.def.staff > 0) p.light(sx(st.stop.x, st.stop.y), sy(st.stop.x, st.stop.y, 6), 30, "#22d3ee", 0.3);
  }

  // 5. robots and people in front of the line (robots in a cell without its operator at half pace)
  const pace = (id: StationId) => (line.stations.find((x) => x.def.id === id)?.staffed === false ? 0.5 : 1);
  for (const r of L.robots) {
    if (r.line !== line.index || r.reach) continue;
    robot(e, r.x, r.y, working ? Math.floor(e.t * 4 * pace(r.station) + r.x) % 4 : 0, r.tool, k);
  }
  for (const r of L.robots) {
    if (r.line !== line.index || !r.reach) continue;
    // welding, framing and assembly robots reach over the part from the front
    robot(e, r.x, line.belt + 0.75, working ? Math.floor(e.t * 5 * pace(r.station) + r.x * 3) % 4 : 0, r.tool, k);
  }
  const lift = e.cheer(line.index);
  for (const [i, h] of L.people.entries()) {
    if (h.line !== line.index) continue;
    if (h.role === "supervisor" && !e.low) {
      // supervisors walk up and down their cells with the clipboard
      const ph = e.t * 0.45 + i * 1.7;
      const v = Math.cos(ph);
      const walking = Math.abs(v) > 0.25;
      person(e, h.x + Math.sin(ph) * 0.9, h.y, "supervisor", walking ? Math.floor(e.t * 6 + i) % 4 : 0, i % 2, k, v > 0 ? 0 : 2, lift);
      continue;
    }
    const busy = working && h.station !== undefined;
    // waiting people still shift from foot to foot
    const pose = busy ? Math.floor(e.t * 4 + i) % 4 : Math.floor(e.t * (s.running ? 1.5 : 0.7) + i) % 2;
    person(e, h.x, h.y, h.role, pose, i, k, 0, lift);
    // now and then someone shows how they feel
    if (near && s.morale !== undefined) {
      const ph = (e.t / 9 + i * 0.37) % 1;
      if (ph < 0.22) mood(e, h.x, h.y, s.morale, ph / 0.22);
    }
    if (h.role === "welder" && working && near) sparks(e, h.x + 0.1, h.y - 0.6);
  }
  // people walking along the walkway, between the stations
  if (!e.low && near) {
    const walkers = L.lines.length >= 3 ? 2 : 1;
    for (let j = 0; j < walkers; j++) {
      const span = L.w - 3;
      const u = (e.t * (0.32 + j * 0.07)) / span + j * 0.5 + line.index * 0.31;
      const tri = Math.abs(((u % 2) + 2) % 2 - 1);
      const forward = ((u % 2) + 2) % 2 < 1;
      // (a few looks only: every pose and heading is a sprite to make)
      person(e, 1.5 + (1 - tri) * span, line.belt + 1.82 + (j ? 0.12 : -0.08), j % 2 ? "inspector" : "worker", Math.floor(e.t * 6 + j) % 4, j, k, forward ? 0 : 2, lift);
    }
  }
  // empty bays keep their name (the next one to build on the shop floor says so), above the belt
  if (near)
    for (const st of line.stations) {
      if (st.mode !== "planned") continue;
      const lab = s.labels[st.def.id] ?? st.def.id;
      const next = !!floor && st.slot === floor.machines;
      p.tag(next && s.words ? `＋ ${s.words.build} · ${lab}` : `${st.def.icon} ${lab}`, st.x + st.w / 2, line.belt, line.conveyor ? 8 : 2, { size: 9, bg: next ? "rgba(21,128,61,0.9)" : "rgba(15,23,42,0.6)" });
    }
  // station names on the floor in front of each station (with its operator on the shop floor);
  // the lines away from the middle of the view just show their icons, so the hall stays calm
  if (near)
    for (const st of stops) {
      const sel = e.selected?.line === line.index && e.selected.id === st.def.id;
      const crew = floor && st.slot !== undefined && st.staffed ? ` · 👷${st.slot + 1}` : "";
      if (focus || sel) p.tag(`${st.def.icon} ${s.labels[st.def.id] ?? st.def.id}${crew}`, st.x + st.w / 2, line.belt + 1.3, 1, { size: 9, bg: sel ? "rgba(14,165,233,0.95)" : "rgba(15,23,42,0.78)" });
      else p.tag(st.def.icon, st.x + st.w / 2, line.belt + 1.3, 1, { size: 8, bg: "rgba(15,23,42,0.5)" });
    }
  // what holds a machine back, at that machine: no operator, no material in, no room out
  if (near && s.words) {
    const w = s.words;
    for (const st of stops)
      if (st.def.staff > 0 && !st.staffed) p.tag(`⚠ ${w.noOperator}`, st.x + st.w / 2, line.belt - 0.4, 34, { size: 9, bg: "rgba(217,119,6,0.92)" });
    const at = s.stop === "noRaw" ? stops[0] : s.stop === "full" ? stops[n - 1] : undefined;
    if (at) p.tag(`⛔ ${s.stop === "noRaw" ? w.noRaw : w.full}`, at.x + at.w / 2, line.belt - 0.4, 34, { size: 10, bg: "rgba(220,38,38,0.92)" });
  }
}

/** Forklifts (or robot carts) shuttling between the gates and the stores; the office; trucks. */
export function drawAisle(e: InteriorEngine, s: InteriorScene, L: Interior) {
  const p = e.p;
  const k = tierCap(e.cam.zoom * e.dpr);
  const ay = L.aisle.y;
  // the office with the manager
  const o = L.office;
  p.box(o.x, o.y, o.w, o.d, 0, 26, "#e2e8f0", "#cbd5e1");
  p.onLeft(o.x, o.y + o.d, 0, 0.2, o.w - 0.2, 6, 22, "#93c5fd");
  p.onRight(o.x + o.w, o.y, 0, 0.2, o.d - 0.2, 6, 22, "#7fb8ea");
  p.box(o.x - 0.05, o.y - 0.05, o.w + 0.1, o.d + 0.1, 26, 3, p.col(s.accent));
  for (const [i, h] of L.people.entries()) {
    if (h.role !== "manager") continue;
    const walk = Math.sin(e.t * 0.4) * 1.6;
    person(e, h.x + walk, h.y, "manager", Math.floor(e.t * 3) % 4, i, k, Math.cos(e.t * 0.4) > 0 ? 0 : 2);
  }
  // shuttles: raw material from the side gate to each line's store, finished goods to the dock
  const n = L.aisle.vehicles;
  for (let v = 0; v < n; v++) {
    const line = L.lines[v % L.lines.length];
    const inbound = v % 2 === 0;
    const xs = inbound ? 0.45 : L.w - 0.45;
    const period = 14 + v * 2.3;
    const u = ((e.t + v * 5.1) % period) / period;
    // gate → along the aisle → up the side lane to the line → back
    const legA = inbound ? [0.8, ay] : [L.w - 1.6, ay];
    const pts: [number, number][] = [legA as [number, number], [xs, ay], [xs, line.belt], [xs, ay], legA as [number, number]];
    const [x, y, yaw, loaded] = along(pts, u, inbound);
    const cargo = inbound ? "#9aa4b0" : s.color;
    if (L.aisle.agv) vehicle(e, `agv|${yaw}|${loaded ? 1 : 0}|${cargo}`, x, y, k, (T, { interior }) => interior.buildAGV(T, yaw, loaded, cargo));
    else vehicle(e, `fork|${yaw}|${loaded ? 1 : 0}|${cargo}`, x, y, k, (T, { kit, interior }) => interior.buildForklift(T, kit, yaw, loaded, cargo));
  }
  // a truck at the dock while goods are waiting
  if (s.docked) drawTruck(p, L.w + 1.1, ay, 1, s.color, 1);
  drawFront(e, L, k);
}

/** The front of the hall: a break corner with coffee, pallets of stock, and the season (a tree, pumpkins). */
export function drawFront(e: InteriorEngine, L: Interior, k: number) {
  const p = e.p;
  const fy = L.aisle.y + 1.35;
  if (!e.seen(sx(0, fy + 0.7), sy(0, fy - 0.7, 70), sx(L.w, fy - 0.7), sy(L.w, fy + 0.7, 0))) return;
  // behind the table: one of the crew, facing us
  person(e, 2.8, fy - 0.45, "worker", Math.floor(e.t * 0.8) % 2, 41, k, 1);
  // the coffee machine (its light on), the vending machine (lit), a table with cups, and a plant
  p.box(1.0, fy - 0.2, 0.3, 0.26, 0, 14, "#1f2937", "#374151");
  p.onLeft(1.0, fy + 0.06, 0, 0.07, 0.23, 5, 10, "#0f172a");
  p.box(1.08, fy + 0.04, 0.05, 0.04, 11.5, 0.8, "#ef4444");
  p.light(sx(1.1, fy + 0.06), sy(1.1, fy + 0.06, 12), 7, "#ef4444", 0.7);
  p.box(4.5, fy - 0.25, 0.42, 0.34, 0, 20, "#1e3a8a", "#1d4ed8");
  p.onLeft(4.5, fy + 0.09, 0, 0.05, 0.37, 4, 18, "rgba(191,219,254,0.9)");
  for (let z = 7; z < 18; z += 3.5) p.onLeft(4.5, fy + 0.09, 0, 0.08, 0.34, z, z + 0.5, "rgba(30,64,175,0.6)");
  p.light(sx(4.7, fy + 0.09), sy(4.7, fy + 0.09, 11), 16, "#93c5fd", 0.35);
  p.box(2.75, fy - 0.03, 0.06, 0.06, 0, 5, "#78350f");
  p.box(2.4, fy - 0.2, 0.8, 0.42, 5, 1, "#b45309", "#d97706");
  p.box(2.55, fy - 0.08, 0.05, 0.05, 6, 1.3, "#f8fafc");
  p.box(3.0, fy - 0.02, 0.05, 0.05, 6, 1.3, "#f8fafc");
  p.box(5.3, fy - 0.05, 0.18, 0.18, 0, 4, "#9a3412", "#c2410c");
  p.circle(5.39, fy + 0.04, 8.5, 4.5, "#15803d");
  p.circle(5.33, fy, 11, 3.2, "#22c55e");
  // the crew on their break, chatting
  person(e, 3.0, fy + 0.4, "worker", Math.floor(e.t * 0.8 + 1.3) % 2, 42, k, 3);
  if (L.lines.length >= 3) person(e, 2.15, fy + 0.22, "inspector", Math.floor(e.t * 0.7 + 2.1) % 2, 43, k, 0);
  // pallets of the plant's stock
  const kinds = e.look.decor;
  [8.6, 10.7, 15.2].forEach((x, i) => e.stack(kinds[(i + 1) % kinds.length], x, fy, k));
  // the season
  if (e.season === "winter") christmasTree(p, 18.3, fy + 0.1, e.t);
  else if (e.season === "halloween") for (const [x, dy] of [[7.3, 0.3], [12.9, 0.35], [17.4, 0.2], [18.1, 0.45]]) pumpkin(p, x, fy + dy, 1, e.t);
  else if (e.season === "spring") for (const [x, dy] of [[7.3, 0.3], [12.9, 0.35], [17.6, 0.25]]) flowerPot(p, x, fy + dy, 1, e.t, "spring");
  else if (e.season === "summer") {
    parasol(p, 17.9, fy + 0.2, e.t);
    flowerPot(p, 7.3, fy + 0.3, 1, e.t, "summer");
  }
}

/** Big plants: an overhead crane over the stores, travelling across the halls. */
export function drawCrane(e: InteriorEngine, L: Interior) {
  const p = e.p;
  const span = (L.lines[L.lines.length - 1].y0 + 5 - 1) / 1;
  const y = 1 + ((Math.sin(e.t * 0.15) + 1) / 2) * (span - 2);
  p.box(0.2, 0.2, 0.25, L.d - 4, 78, 3, "#f59e0b");
  p.box(3.6, 0.2, 0.25, L.d - 4, 78, 3, "#f59e0b");
  p.box(0.2, y, 3.65, 0.35, 76, 6, "#f5b301", "#fcd34d");
  p.box(1.8, y + 0.05, 0.4, 0.25, 70, 6, "#1f2937");
  p.line(2, y + 0.17, 2, y + 0.17, "#111827", 1, 30);
}

export function drawSelection(e: InteriorEngine, L: Interior) {
  // a ring spreading from the machine you tapped
  const r = e.ripple;
  if (r) {
    const age = e.t - r.t0;
    const st = e.find(r.pick);
    const line = L.lines[r.pick.line];
    if (age > 0.6 || !st || !line) e.ripple = null;
    else {
      const g = 0.15 + age * 1.2;
      e.p.quadStroke(st.x - g, line.belt - 1.1 - g, st.w + g * 2, 2.2 + g * 2, `rgba(125,211,252,${(1 - age / 0.6) * 0.9})`, 2.5);
    }
  }
  if (!e.selected) return;
  const st = e.find(e.selected);
  if (!st) return;
  const line = L.lines[e.selected.line];
  const a = 0.55 + Math.sin(e.t * 5) * 0.3;
  e.p.quadStroke(st.x - 0.05, line.belt - 1.1, st.w + 0.1, 2.2, `rgba(56,189,248,${a})`, 3);
}

export function drawLights(e: InteriorEngine) {
  const ctx = e.ctx;
  ctx.globalCompositeOperation = "lighter";
  for (const l of e.p.lights) {
    // one pre-drawn glow per colour, scaled and faded to each light's size and strength
    ctx.globalAlpha = Math.max(0, Math.min(1, l.a)) * (0xaa / 0xff);
    ctx.drawImage(glowSprite(l.color), l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

export function station(e: InteriorEngine, s: InteriorScene, st: PlacedStation, part: "back" | "front", working: boolean, k: number) {
  const model = st.def.machine;
  const poses = POSES[model] ?? 1;
  // without its operator a machine runs at half pace
  const pace = (model === "press" ? 3 : 4) * (st.staffed ? 1 : 0.5);
  const pose = working && poses > 1 ? Math.floor(e.t * pace) % poses : 0;
  const robots = st.mode === "robot";
  // the stores show the plant's real stock: raw material in, finished goods out
  const fill = (v: number, places: number) => Math.max(0, Math.min(places, Math.ceil(v * places - 0.001)));
  const variant =
    model === "rawRack" ? `${st.def.variant ?? ""}|${fill(s.raw, 9)}` : model === "goodsRack" ? `|${fill(s.out, 6)}` : (st.def.variant ?? "");
  const key = `ist|${model}|${variant}|${pose}|${robots ? 1 : 0}|${part}|${s.accent}|${s.color}`;
  const spr = sprites3d.get(key, STATION_SIZE, k, (T, { kit, interior }) => interior.buildStation(T, kit, model, pose, s.accent, robots, part, variant, s.color), part === "back", "indoor");
  if (!spr) {
    // until the 3D model is ready: a simple block
    if (part === "back") e.p.box(st.x + 0.2, st.stop.y - 0.9, st.w - 0.4, 0.6, 0, 22, "#64748b", "#94a3b8");
    return;
  }
  const { x, y } = st.stop;
  e.ctx.drawImage(spr.img, sx(x, y) - STATION_SIZE.ax, sy(x, y) - STATION_SIZE.ay, STATION_SIZE.w, STATION_SIZE.h);
}

/** A part on the belt, as it looks after station `after`. */
export function part(e: InteriorEngine, s: InteriorScene, after: StationDef, x: number, y: number, z: number, k: number) {
  if (after.part === "car") {
    car(e, s, after.stage ?? 0, x, y, z);
    return;
  }
  const kind: PartKind = after.part;
  const color = s.color;
  const spr = sprites3d.get(`ipart|${kind}|${color}`, PART_SIZE, k, (T, { interior }) => interior.buildPart(T, kind, color), false, "indoor");
  if (!spr) {
    e.p.box(x - 0.25, y - 0.18, 0.5, 0.36, z, 2, "#aeb6c1");
    return;
  }
  e.ctx.drawImage(spr.img, sx(x, y) - PART_SIZE.ax, sy(x, y, z) - PART_SIZE.ay, PART_SIZE.w, PART_SIZE.h);
}

/** A car on the line at an assembly stage (0: a body in white … 8: finished). */
export function car(e: InteriorEngine, s: InteriorScene, stage: number, x: number, y: number, z: number) {
  // primer grey until the paint shop, then the model's own paint
  const paint = stage >= 6 ? s.build?.color || (s.model ? liveryOf(s.model).color : "#ef4444") : "#c3cad3";
  drawModel(e.p, x, y, 0, s.model ?? "sedan", paint, 1.1, { lift: z, noShadow: true, stage, build: s.build });
}

export function prop(e: InteriorEngine, kind: PropKind, x: number, y: number, s: InteriorScene, k: number) {
  const { accent, color } = s;
  const spr = sprites3d.get(`iprop|${kind}|${accent}|${color}`, PROP_SIZE, k, (T, { interior }) => interior.buildProp(T, kind, accent, color), true, "indoor");
  if (!spr) return;
  e.ctx.drawImage(spr.img, sx(x, y) - PROP_SIZE.ax, sy(x, y) - PROP_SIZE.ay, PROP_SIZE.w, PROP_SIZE.h);
}

/** A person, facing along +x (yaw 0) or turned in quarter turns, lifted off the floor when they jump for joy. */
export function person(e: InteriorEngine, x: number, y: number, role: WorkerRole, pose: number, i: number, k: number, yaw = 0, lift = 0) {
  if (e.cam.zoom < 0.45) {
    e.p.person(x, y, role === "worker" ? "#f97316" : "#2563eb", e.t * 3 + i);
    return;
  }
  const tone = i % 4;
  const spr = sprites3d.get(
    `iman|${role}|${pose}|${tone}${yaw ? `|y${yaw}` : ""}`,
    PERSON_SIZE,
    Math.min(4, k + 1),
    (T, { interior }) => {
      const w = interior.buildWorker(T, role, pose, tone);
      w.rotation.y = (-yaw * Math.PI) / 2;
      return w;
    },
    true,
    "indoor",
  );
  if (!spr) {
    e.p.person(x, y, "#f97316", e.t * 3 + i);
    return;
  }
  e.ctx.drawImage(spr.img, sx(x, y) - PERSON_SIZE.ax, sy(x, y, lift) - PERSON_SIZE.ay, PERSON_SIZE.w, PERSON_SIZE.h);
}

export function robot(e: InteriorEngine, x: number, y: number, pose: number, tool: "torch" | "gripper" | "suction" | "spray", k: number) {
  const spr = sprites3d.get(`irobot|${pose}|${tool}`, ROBOT_SIZE, k, (T, { kit, industrial }) => {
    const r = industrial.buildRobot(T, kit, pose, "#f59e0b", tool);
    r.scale.setScalar(1.5);
    r.rotation.y = Math.PI / 2;
    return r;
  }, true, "indoor");
  if (!spr) return;
  e.ctx.drawImage(spr.img, sx(x, y) - ROBOT_SIZE.ax, sy(x, y) - ROBOT_SIZE.ay, ROBOT_SIZE.w, ROBOT_SIZE.h);
}

export function vehicle(e: InteriorEngine, key: string, x: number, y: number, k: number, build: Parameters<typeof sprites3d.get>[3]) {
  const spr = sprites3d.get(`iveh|${key}`, VEHICLE_SIZE, k, build, true, "indoor");
  if (!spr) {
    e.p.box(x - 0.15, y - 0.1, 0.3, 0.2, 0, 6, "#f59e0b");
    return;
  }
  e.ctx.drawImage(spr.img, sx(x, y) - VEHICLE_SIZE.ax, sy(x, y) - VEHICLE_SIZE.ay, VEHICLE_SIZE.w, VEHICLE_SIZE.h);
}

/** Welding sparks: short bright streaks and a flash. */
export function sparks(e: InteriorEngine, x: number, y: number) {
  const p = e.p;
  if (Math.sin(e.t * 23 + x) < -0.2) return;
  const c = e.ctx;
  const [px, py] = [sx(x, y), sy(x, y, 9)];
  c.strokeStyle = "rgba(253,224,71,0.95)";
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (e.t * 37 + i * 1.7) % (Math.PI * 2);
    const r = 3 + ((e.t * 50 + i * 13) % 7);
    c.moveTo(px, py);
    c.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r * 0.6 + 2);
  }
  c.stroke();
  p.light(px, py, 22, "#fde68a", 0.9);
}

/** Dark smoke rising off a broken machine. */
export function smoke(e: InteriorEngine, x: number, y: number) {
  const c = e.ctx;
  const [bx, by] = [sx(x, y), sy(x, y, 26)];
  for (let i = 0; i < 4; i++) {
    const u = (e.t * 0.45 + i / 4) % 1;
    c.fillStyle = `rgba(55,60,68,${(0.5 * (1 - u) * Math.min(1, u * 6)).toFixed(3)})`;
    c.beginPath();
    c.arc(bx + Math.sin(u * 5 + i) * 5 + u * 8, by - u * 52, 5 + u * 15, 0, Math.PI * 2);
    c.fill();
  }
}

/** A little bubble over a worker's head with how they feel (the crew's morale). */
export function mood(e: InteriorEngine, x: number, y: number, morale: number, u: number) {
  const c = e.ctx;
  const face = morale >= 85 ? "😄" : morale >= 70 ? "🙂" : morale >= 50 ? "😐" : morale >= 30 ? "😟" : "😫";
  const a = Math.min(1, u * 5, (1 - u) * 5);
  const [px, py] = [sx(x, y), sy(x, y, 30 + u * 4)];
  c.save();
  c.globalAlpha = a;
  c.fillStyle = "rgba(255,255,255,0.92)";
  c.beginPath();
  c.arc(px, py, 6.5, 0, Math.PI * 2);
  c.fill();
  c.font = "8px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(face, px, py + 0.5);
  c.restore();
}

/** Soft puffs of steam rising off a hot machine and fading out. */
export function steam(e: InteriorEngine, x: number, y: number) {
  const c = e.ctx;
  const [bx, by] = [sx(x, y), sy(x, y, 34)];
  for (let i = 0; i < 3; i++) {
    const u = (e.t * 0.35 + i / 3 + x * 0.17) % 1;
    const r = 6 + u * 16;
    c.fillStyle = `rgba(241,245,249,${(0.34 * (1 - u) * Math.min(1, u * 5)).toFixed(3)})`;
    c.beginPath();
    c.arc(bx + Math.sin(u * 4 + i) * 4 + u * 6, by - u * 42, r, 0, Math.PI * 2);
    c.fill();
  }
}

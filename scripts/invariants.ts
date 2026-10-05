// Checks a game state for things that must never happen: NaN or infinite
// numbers, negative stock, money or wear out of range, broken shipments.
// Returns a list of problems (empty when the state is sound).
import type { GameState } from "../src/game/types";

export function checkInvariants(s: GameState): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "number") {
      if (!Number.isFinite(v)) out.push(`${path} = ${v}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(s, "s");
  if (s.cash < -1e-6) out.push(`cash ${s.cash}`);
  if (s.chain.owed < -1e-6) out.push(`owed ${s.chain.owed}`);
  // land and construction: a plot is a site or a building, never both; both stand on owned land
  for (const [id, st] of Object.entries(s.city.sites)) {
    if (s.city.buildings[id]) out.push(`${id} is a site and a building`);
    if (!s.city.land.includes(id)) out.push(`${id} site without land`);
    if (!(st.dur > 0) || st.t < 0 || st.t > st.dur) out.push(`${id} site time ${st.t}/${st.dur}`);
  }
  for (const [id, b] of Object.entries(s.city.buildings)) {
    if (!s.city.land.includes(id)) out.push(`${id} building without land`);
    if (b.works && (b.works.to <= b.level || b.works.t > b.works.dur)) out.push(`${id} works ${b.works.to}@${b.level}`);
  }
  for (const [id, b] of Object.entries(s.city.buildings)) {
    const p = b.plant;
    if (!p) continue;
    if (p.out < -1e-6) out.push(`${id} out ${p.out}`);
    if (p.outValue < -1e-3) out.push(`${id} outValue ${p.outValue}`);
    if ((p.stockCost ?? 0) < -1e-3) out.push(`${id} stockCost ${p.stockCost}`);
    for (const [m, n] of Object.entries(p.stock)) if ((n ?? 0) < -1e-6) out.push(`${id} stock.${m} ${n}`);
    for (const [c, n] of Object.entries(p.inputs)) if ((n ?? 0) < -1e-6) out.push(`${id} inputs.${c} ${n}`);
  }
  for (const [d, st] of Object.entries(s.chain.dealers)) {
    if (!st) continue;
    if (st.cars < -1e-6 || st.value < -1e-3) out.push(`dealer ${d} cars ${st.cars} value ${st.value}`);
    if (st.models.length > Math.ceil(st.cars) + 1) out.push(`dealer ${d} models ${st.models.length} vs cars ${st.cars}`);
  }
  for (const sh of s.chain.shipments) {
    if (sh.qty <= 0) out.push(`shipment ${sh.id} qty ${sh.qty}`);
    if (sh.t > sh.dur * 2 + 1) out.push(`shipment ${sh.id} stuck t ${sh.t} dur ${sh.dur}`);
  }
  for (const rc of s.racing.cars) for (const [k, w] of Object.entries(rc.wear)) if (w < 0.05 - 1e-9 || w > 1 + 1e-9) out.push(`race car ${rc.id} wear.${k} ${w}`);
  if (s.racing.selected !== null && !s.racing.cars.some((c) => c.id === s.racing.selected)) out.push(`racing.selected ${s.racing.selected} missing`);
  if (s.racing.live && !s.racing.cars.some((c) => c.id === s.racing.live!.car)) out.push("live race without its car");
  const q = s.quality;
  if (!(q.rep >= 0 && q.rep <= 100)) out.push(`reputation out of range: ${q.rep}`);
  if (q.defects < 0) out.push(`negative defects: ${q.defects}`);
  return out;
}

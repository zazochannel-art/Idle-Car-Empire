import { describe, expect, it } from "vitest";
import { ROAD_STEP, WORLD, WORLD_MAP, blockKind } from "./city/layout";
import { DECK, HIGHWAY_HALF, NETWORK, WAYS, heightAt, inTunnel, legs, pointAt } from "./city/network";

/** Points every half tile along a way. */
function samples(w: (typeof WAYS)[number]) {
  const out: { s: number; x: number; y: number }[] = [];
  for (let s = 0; s <= w.len; s += 0.5) out.push({ s, ...pointAt(w, s) });
  return out;
}

describe("motorway and railway", () => {
  it("are axis-aligned and stay inside the world", () => {
    for (const w of WAYS) {
      for (const { a, b } of legs(w)) expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
      for (const p of samples(w)) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.y).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(WORLD);
        expect(p.y).toBeLessThan(WORLD);
      }
    }
  });

  it("never run over a plot, and only cross fields, woods, hills, access roads and the ridge", () => {
    const half = (w: (typeof WAYS)[number]) => (w.kind === "highway" ? HIGHWAY_HALF : 0.5);
    for (const w of WAYS) {
      for (const p of samples(w)) {
        for (const plot of WORLD_MAP.plots) {
          const inside = p.x + half(w) > plot.x && p.x - half(w) < plot.x + plot.w && p.y + half(w) > plot.y && p.y - half(w) < plot.y + plot.d;
          expect(inside, `${w.id} at ${p.x},${p.y} over ${plot.id}`).toBe(false);
        }
        // on a node line it is crossing a street (or the river): checked below
        if (p.x % ROAD_STEP < 1 || p.y % ROAD_STEP < 1) continue;
        const kind = blockKind(Math.floor(p.x / ROAD_STEP), Math.floor(p.y / ROAD_STEP));
        // a siding ends inside the rail yard or the quarry it serves
        const ok = ["forest", "farm", "hills", "mountains", "road"].includes(kind) || (w.kind === "rail" && (kind === "railyard" || kind === "raw"));
        expect(ok, `${w.id} at ${p.x},${p.y} over ${kind}`).toBe(true);
      }
    }
  });

  it("the ring is a closed loop round the core with spurs to the port, the airport and the racing complex", () => {
    const ring = NETWORK.highway.find((w) => w.id === "ring")!;
    expect(ring.loop).toBe(true);
    expect(ring.len).toBeGreaterThan(250);
    expect(NETWORK.highway.map((w) => w.id).sort()).toEqual(["airport", "port", "racing", "ring"]);
    expect(NETWORK.highway.find((w) => w.id === "port")!.area).toBe("port");
    expect(NETWORK.highway.find((w) => w.id === "airport")!.area).toBe("airport");
    // the railway serves the rail yard, the quarry and the works
    expect(NETWORK.rail.map((w) => w.id).sort()).toEqual(["quarry", "rail", "works", "yard"]);
  });

  it("climbs over every street, the river and the railway; the railway stays on the ground", () => {
    const ring = NETWORK.highway.find((w) => w.id === "ring")!;
    expect(ring.crossings.some((c) => c.kind === "river")).toBe(true);
    expect(ring.crossings.filter((c) => c.kind === "rail").length).toBeGreaterThanOrEqual(2);
    for (const w of NETWORK.highway) for (const c of w.crossings) expect(heightAt(w, c.s)).toBe(DECK);
    for (const w of NETWORK.rail) {
      expect(w.crossings.some((c) => c.kind === "street")).toBe(w.id !== "works");
      for (const p of samples(w)) expect(heightAt(w, p.s)).toBe(0);
    }
    // and comes back down between them
    expect(samples(ring).some((p) => heightAt(ring, p.s) === 0)).toBe(true);
  });

  it("goes through the northern ridge in a tunnel", () => {
    const ring = NETWORK.highway.find((w) => w.id === "ring")!;
    expect(ring.tunnels.length).toBe(1);
    const [a, b] = ring.tunnels[0];
    const mid = pointAt(ring, (a + b) / 2);
    expect(blockKind(Math.floor(mid.x / ROAD_STEP), Math.floor(mid.y / ROAD_STEP))).toBe("mountains");
    expect(inTunnel(ring, (a + b) / 2)).toBe(true);
    expect(inTunnel(ring, a - 1)).toBe(false);
  });
});

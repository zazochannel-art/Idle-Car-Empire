// The freight railway on the island: planned once over free land (no
// building, lot or road in its way, no steep ground) from the port's yard to
// the industrial district's west coast. The map draws its track and, once the
// company runs trains (Logistics: the Train tier), a freight train on it.
export const RAIL_LINE: [number, number][] = [
  [-34.55, -27.31], [-35.21, -25.99], [-36.05, -24.81], [-36.33, -23.37], [-37.39, -22.31], [-38.52, -21.23], [-40.02, -21.15],
  [-41.52, -21.15], [-42.96, -20.77], [-44.39, -20.31], [-45.46, -19.24], [-46.05, -17.93], [-45.83, -16.43], [-45.71, -14.99],
  [-46.83, -13.87], [-47.89, -12.81], [-48.96, -11.74], [-50.02, -10.68], [-51.08, -9.62], [-52.14, -8.56], [-53.21, -7.49],
  [-54.64, -7.15], [-56.14, -7.15], [-57.64, -7.15], [-59.14, -7.15], [-60.64, -7.15], [-62.14, -7.15], [-63.64, -7.03],
  [-64.77, -5.93], [-65.83, -4.87], [-66.89, -3.81], [-67.96, -2.74], [-69.02, -1.68], [-70.08, -0.62], [-71.14, 0.44],
  [-72.21, 1.51], [-73.27, 2.57], [-74.33, 3.63], [-74.55, 5.13], [-74.55, 6.63], [-74.55, 7.85],
];

/** The airport's runway: its two ends (the planes take off toward the second). */
export const RUNWAY: { a: [number, number]; b: [number, number] } = { a: [33.39, 34.19], b: [58.83, 21.19] };

/** Where the cargo ships moor: off the port's quay, by its cranes. */
export const QUAYS: [number, number][] = [
  [-51.5, -27.5],
  [-55.5, -26.8],
];

/** A map's railway, runway and berths: from its world.json (the other cities' islands), else the first map's. */
export interface MapLines {
  rail: [number, number][];
  runway: { a: [number, number]; b: [number, number] };
  quays: [number, number][];
}

export function mapLines(data: { linie?: [number, number][]; pista?: { a: [number, number]; b: [number, number] }; cheiuri?: [number, number][] }): MapLines {
  return { rail: data.linie ?? RAIL_LINE, runway: data.pista ?? RUNWAY, quays: data.cheiuri ?? QUAYS };
}

/** Distance from a point to a polyline. */
export function distToLine(x: number, z: number, line: [number, number][]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const dx = bx - ax;
    const dz = bz - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * k, z - az - dz * k));
  }
  return best;
}

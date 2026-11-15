import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TruckBatch } from "./truck-batch";

function model() {
  const g = new THREE.Group();
  const cab = new THREE.MeshStandardMaterial({ color: "#ff00ff" });
  const body = new THREE.MeshStandardMaterial({ color: "#888888" });
  const glass = new THREE.MeshStandardMaterial({ color: "#335577", transparent: true });
  const mk = (mat: THREE.Material, shadow: boolean) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    m.castShadow = shadow;
    g.add(m);
  };
  mk(body, true);
  mk(cab, true);
  mk(glass, false);
  return { g, cab };
}

describe("TruckBatch", () => {
  it("makes one instanced mesh per part, sharing one matrix attribute, and a white cab", () => {
    const b = new TruckBatch();
    const { g, cab } = model();
    const k = b.kind("semi", g, cab);
    expect(k.parts).toHaveLength(3);
    expect(k.cab).toBe(1);
    expect(k.parts[1].instanceMatrix).toBe(k.parts[0].instanceMatrix);
    expect(k.parts[2].instanceMatrix).toBe(k.parts[0].instanceMatrix);
    expect((k.parts[1].material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff);
    expect(cab.color.getHexString()).toBe("ff00ff"); // the model's own paint is untouched
    expect(k.parts.map((p) => p.castShadow)).toEqual([true, true, false]);
  });

  it("keeps every truck written so far when it grows, with each truck's matrix and cab colour", () => {
    const b = new TruckBatch();
    const { g, cab } = model();
    const k = b.kind("semi", g, cab);
    b.begin();
    const m4 = new THREE.Matrix4();
    const colours = ["#ff0000", "#00ff00", "#0000ff"].map((c) => new THREE.Color(c));
    for (let i = 0; i < 50; i++) b.add("semi", k, m4.makeTranslation(i, 0, 0), colours[i % 3]);
    b.end();
    expect(k.n).toBe(50);
    expect(k.cap).toBeGreaterThanOrEqual(50);
    for (const p of k.parts) expect(p.count).toBe(50);
    const read = new THREE.Matrix4();
    for (const i of [0, 15, 16, 17, 49]) {
      k.parts[2].getMatrixAt(i, read);
      expect(read.elements[12]).toBe(i);
      const c = new THREE.Color();
      k.parts[1].getColorAt(i, c);
      expect(c.getHex()).toBe(colours[i % 3].getHex());
    }
  });

  it("empties each frame and hides parts of a kind with no trucks", () => {
    const b = new TruckBatch();
    const { g, cab } = model();
    const k = b.kind("van", g, cab);
    b.begin();
    b.add("van", k, new THREE.Matrix4(), new THREE.Color("#fff"));
    b.end();
    expect(k.parts.every((p) => p.visible && p.count === 1)).toBe(true);
    b.begin();
    b.end();
    expect(k.parts.every((p) => !p.visible && p.count === 0)).toBe(true);
    expect(b.counts()).toEqual({ van: 0 });
  });

  it("returns the same kind for the same key", () => {
    const b = new TruckBatch();
    const { g, cab } = model();
    expect(b.kind("a", g, cab)).toBe(b.kind("a", g, cab));
  });
});

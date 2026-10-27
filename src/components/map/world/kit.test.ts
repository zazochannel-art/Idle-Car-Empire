import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { freezeStatic, hazed, splitSharedMaterials } from "./kit";

const geo = () => new THREE.BoxGeometry();

describe("map materials kept steady from draw to draw", () => {
  it("gives each kind of object its own copy of a shared material", () => {
    const shared = hazed(new THREE.MeshStandardMaterial({ roughness: 0.4 }));
    const plain = new THREE.Mesh(geo(), shared);
    const plain2 = new THREE.Mesh(geo(), shared);
    const inst = new THREE.InstancedMesh(geo(), shared, 3);
    const tinted = new THREE.InstancedMesh(geo(), shared, 3);
    tinted.setColorAt(0, new THREE.Color("red"));
    const root = new THREE.Group().add(plain, plain2, inst, tinted);

    splitSharedMaterials(root);
    expect(plain.material).toBe(shared);
    expect(plain2.material).toBe(shared);
    expect(inst.material).not.toBe(shared);
    expect(tinted.material).not.toBe(inst.material);
    // the copies look the same and keep the haze
    const copy = inst.material as THREE.MeshStandardMaterial;
    expect(copy.roughness).toBe(0.4);
    expect(copy.onBeforeCompile).toBe(shared.onBeforeCompile);
    expect(copy.customProgramCacheKey()).toBe("hazed");

    // running again changes nothing, and a new mesh of a known kind gets the same copy
    const inst2 = new THREE.InstancedMesh(geo(), shared, 2);
    root.add(inst2);
    splitSharedMaterials(root);
    expect(inst.material).toBe(copy);
    expect(inst2.material).toBe(copy);
  });

  it("draws see-through two-sided materials in one pass", () => {
    const glass = new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide });
    const solid = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
    const root = new THREE.Group().add(new THREE.Mesh(geo(), glass), new THREE.Mesh(geo(), solid));
    splitSharedMaterials(root);
    expect(glass.forceSinglePass).toBe(true);
    expect(solid.forceSinglePass).toBe(false);
  });

  it("gives each kind of shadow caster its own depth material", () => {
    const m = new THREE.MeshStandardMaterial();
    const a = Object.assign(new THREE.Mesh(geo(), m), { castShadow: true });
    const b = Object.assign(new THREE.Mesh(geo(), m), { castShadow: true });
    const c = Object.assign(new THREE.InstancedMesh(geo(), m, 2), { castShadow: true });
    const noShadow = new THREE.Mesh(geo(), m);
    const cutout = Object.assign(new THREE.Mesh(geo(), new THREE.MeshStandardMaterial({ alphaTest: 0.5 })), { castShadow: true });
    splitSharedMaterials(new THREE.Group().add(a, b, c, noShadow, cutout));
    expect(a.customDepthMaterial).toBeInstanceOf(THREE.MeshDepthMaterial);
    expect(b.customDepthMaterial).toBe(a.customDepthMaterial);
    expect(c.customDepthMaterial).not.toBe(a.customDepthMaterial);
    expect(noShadow.customDepthMaterial).toBeUndefined();
    // three.js keeps its own per-material depth material for cut-outs
    expect(cutout.customDepthMaterial).toBeUndefined();
  });

  it("fixes the matrices of what never moves, and keeps them right under a moving parent", () => {
    const root = new THREE.Group();
    const rotor = new THREE.Group();
    const blade = new THREE.Mesh(geo());
    blade.position.set(1, 0, 0);
    rotor.add(blade);
    const house = new THREE.Mesh(geo());
    house.position.set(5, 0, 0);
    root.add(rotor, house);
    freezeStatic(root, [rotor]);
    expect(house.matrixAutoUpdate).toBe(false);
    expect(blade.matrixAutoUpdate).toBe(false);
    expect(rotor.matrixAutoUpdate).toBe(true);
    expect(new THREE.Vector3().setFromMatrixPosition(house.matrixWorld).x).toBe(5);

    rotor.rotation.y = Math.PI / 2;
    root.updateMatrixWorld();
    const p = new THREE.Vector3().setFromMatrixPosition(blade.matrixWorld);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1);
  });
});

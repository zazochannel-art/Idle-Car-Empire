"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useGame } from "@/store/game-store";
import type { CustomGarageDesign } from "@/game/types";

type Kit = "stock" | "street" | "widebody" | "track";
type Wheels = "five-spoke" | "mesh" | "deep-dish";
type Design = CustomGarageDesign;
const KEY = "ice.customGarage.design.v1";
const initial: Design = { version: 1, name: "My Custom Build", paint: "#1687ff", kit: "street", wheels: "deep-dish", lowered: true, spoiler: true, prompt: "", updatedAt: Date.now() };

function preview(host: HTMLDivElement, d: Design) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#10151d");
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(5.5, 3.6, 7.5); camera.lookAt(0, 0.6, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.replaceChildren(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block", touchAction: "pan-y" });
  scene.add(new THREE.HemisphereLight("#dceaff", "#252a31", 2));
  const key = new THREE.DirectionalLight("#fff", 3); key.position.set(4, 8, 5); key.castShadow = true; scene.add(key);
  const rim = new THREE.DirectionalLight("#54aaff", 2); rim.position.set(-5, 3, -4); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: "#171d25", roughness: .8 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.04; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, "#354252", "#202a36"); grid.position.y = -.025; scene.add(grid);
  const car = new THREE.Group(); scene.add(car);
  const paint = new THREE.MeshPhysicalMaterial({ color: d.paint, metalness: .62, roughness: .25, clearcoat: .9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#101a26", metalness: .3, roughness: .15 });
  const trim = new THREE.MeshStandardMaterial({ color: "#111318", metalness: .65, roughness: .32 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#08090b", roughness: .8 });
  const rimMat = new THREE.MeshStandardMaterial({ color: d.wheels === "deep-dish" ? "#d6a76b" : "#bdc9d5", metalness: .9, roughness: .2 });
  const box = (w: number, h: number, l: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; car.add(m); return m;
  };
  // Safe placeholder geometry; swap for licensed GLB assets with named attachment points.
  box(2.25, .52, 4.35, paint, 0, .68, 0);
  box(1.86, .57, 2.1, glass, 0, 1.17, -.15);
  box(1.68, .16, 1.48, paint, 0, 1.48, -.22);
  box(1.95, .12, .12, trim, 0, .93, 2.18); box(1.82, .12, .12, trim, 0, .93, -2.18);
  box(.44, .12, .08, new THREE.MeshStandardMaterial({ color: "#dff4ff", emissive: "#91d9ff" }), -.72, .79, 2.22);
  box(.44, .12, .08, new THREE.MeshStandardMaterial({ color: "#d92f3d", emissive: "#5a080e" }), .72, .79, -2.22);
  const wx = d.kit === "widebody" ? 1.18 : 1.08, wy = d.lowered ? .43 : .5;
  for (const x of [-wx, wx]) for (const z of [-1.42, 1.42]) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .28, 32), rubber); tire.rotation.z = Math.PI / 2; tire.position.set(x, wy, z); tire.castShadow = true; car.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .295, d.wheels === "mesh" ? 24 : 5), rimMat); rim.rotation.z = Math.PI / 2; rim.position.set(x * 1.006, wy, z); car.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .31, 16), trim); hub.rotation.z = Math.PI / 2; hub.position.set(x * 1.01, wy, z); car.add(hub);
  }
  if (d.kit !== "stock") {
    const w = d.kit === "widebody" ? 2.62 : 2.36;
    box(w, .12, .42, trim, 0, .49, 1.95); box(w, .12, .38, trim, 0, .49, -1.95);
    box(w, .1, .28, paint, 0, .48, .55); box(w, .1, .28, paint, 0, .48, -.55);
  }
  if (d.kit === "track") {
    box(2.3, .1, .65, trim, 0, .36, 2.1); box(.09, .5, .09, trim, -.7, 1.36, -1.72); box(.09, .5, .09, trim, .7, 1.36, -1.72); box(2.45, .1, .42, trim, 0, 1.62, -1.72);
  } else if (d.spoiler) {
    box(1.95, .09, .28, trim, 0, 1.44, -1.72); box(.09, .25, .09, trim, -.7, 1.32, -1.72); box(.09, .25, .09, trim, .7, 1.32, -1.72);
  }
  if (d.kit === "widebody") for (const z of [-1.42, 1.42]) { box(.18, .34, .92, paint, -1.17, .68, z); box(.18, .34, .92, paint, 1.17, .68, z); }
  let dragging = false, lastX = 0, rotation = -.35, frame = 0;
  const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; };
  const move = (e: PointerEvent) => { if (dragging) { rotation += (e.clientX - lastX) * .008; lastX = e.clientX; } };
  const up = () => { dragging = false; };
  renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointermove", move); renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("pointercancel", up);
  const resize = () => { const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const clock = new THREE.Clock();
  const animate = () => { frame = requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), .05); if (!dragging) rotation += dt * .09; car.rotation.y = rotation; renderer.render(scene, camera); };
  animate();
  return () => {
    cancelAnimationFrame(frame); observer.disconnect();
    renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("pointercancel", up);
    scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose()); } });
    renderer.dispose(); renderer.domElement.remove();
  };
}

function interpret(text: string, old: Design): Design {
  const s = text.toLowerCase(), d = { ...old, prompt: text };
  if (/wide.?body|aripi late|aripi evazate/.test(s)) d.kit = "widebody";
  else if (/track|circuit|pistă|pista|racing/.test(s)) d.kit = "track";
  else if (/stock|original|standard|fără kit|fara kit/.test(s)) d.kit = "stock";
  else if (/body.?kit|bară|bara|splitter|street|agresiv/.test(s)) d.kit = "street";
  if (/mesh/.test(s)) d.wheels = "mesh"; else if (/concave|deep.?dish|jante adânci|jante adanci/.test(s)) d.wheels = "deep-dish"; else if (/cinci spițe|cinci spite|five.?spoke/.test(s)) d.wheels = "five-spoke";
  if (/coborât|coborata|lowered|stance/.test(s)) d.lowered = true; if (/ridicat|înalt|inalt|raised/.test(s)) d.lowered = false;
  if (/fără eleron|fara eleron|no spoiler/.test(s)) d.spoiler = false; else if (/eleron|spoiler|wing/.test(s)) d.spoiler = true;
  const colors: [RegExp, string][] = [[/negru|black/,"#17191e"],[/alb|white/,"#e8edf2"],[/roșu|rosu|red/,"#d42c38"],[/verde|green/,"#22835a"],[/galben|yellow/,"#f2bd26"],[/portocaliu|orange/,"#f07822"],[/mov|purple/,"#7a4ce0"],[/gri|argintiu|silver|grey|gray/,"#9ca8b5"],[/albastru|blue/,"#1687ff"]];
  for (const [pattern, color] of colors) if (pattern.test(s)) { d.paint = color; break; }
  return d;
}

export function CustomGarage() {
  const host = useRef<HTMLDivElement>(null);
  const importFile = useRef<HTMLInputElement>(null);
  const gameReady = useGame((s) => s.ready);
  const savedDesignJson = useGame((s) => s.state.customGarageDesign ? JSON.stringify(s.state.customGarageDesign) : "");
  const saveToGame = useGame((s) => s.setCustomGarageDesign);
  const [design, setDesign] = useState<Design>(initial);
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState("Alege piese sau descrie modificarea dorită.");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!gameReady) return;
    // Game saves are authoritative; localStorage remains a migration fallback for old prototype builds.
    const timer = window.setTimeout(() => {
      try {
        const raw = savedDesignJson || localStorage.getItem(KEY);
        if (raw) {
          const p = JSON.parse(raw) as Partial<Design>;
          const safePaint = typeof p.paint === "string" && /^#[0-9a-f]{6}$/i.test(p.paint) ? p.paint : initial.paint;
          const safeKit: Kit = ["stock", "street", "widebody", "track"].includes(String(p.kit)) ? p.kit as Kit : initial.kit;
          const safeWheels: Wheels = ["five-spoke", "mesh", "deep-dish"].includes(String(p.wheels)) ? p.wheels as Wheels : initial.wheels;
          setDesign({ ...initial, ...p, version: 1, name: typeof p.name === "string" ? p.name.slice(0, 48) : initial.name, paint: safePaint, kit: safeKit, wheels: safeWheels, lowered: typeof p.lowered === "boolean" ? p.lowered : initial.lowered, spoiler: typeof p.spoiler === "boolean" ? p.spoiler : initial.spoiler, prompt: typeof p.prompt === "string" ? p.prompt.slice(0, 500) : "" });
        }
      } catch { /* corrupted save: keep safe defaults */ }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [gameReady, savedDesignJson]);
  useEffect(() => { if (!ready || !host.current) return; return preview(host.current, design); }, [design, ready]);
  const update = <K extends keyof Design>(key: K, value: Design[K]) => setDesign((d) => ({ ...d, [key]: value }));
  const field: React.CSSProperties = { width: "100%", background: "#111720", color: "#edf3fa", border: "1px solid #303b4b", borderRadius: 10, padding: "10px 12px", fontSize: 14 };
  const label: React.CSSProperties = { display: "block", color: "#aebdd0", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 7 };
  const button: React.CSSProperties = { border: "1px solid #3a485b", borderRadius: 10, padding: "11px 12px", background: "#1766bd", color: "#fff", fontWeight: 800, cursor: "pointer", width: "100%" };
  function save() { try { const next = { ...design, updatedAt: Date.now() }; saveToGame(next); localStorage.setItem(KEY, JSON.stringify(next)); setNotice("Design salvat în progresul jocului și sincronizat conform setărilor contului."); } catch { setNotice("Nu am putut salva designul."); } }
  function exportDesign() {
    const payload = JSON.stringify({ ...design, version: 1, updatedAt: Date.now() }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(design.name || "custom-build").trim().replace(/[^a-z0-9-_]+/gi, "-").slice(0, 40) || "custom-build"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Design exportat ca fișier JSON. Îl poți păstra ca backup sau transfera pe alt dispozitiv.");
  }
  async function importDesign(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error("Fișier prea mare.");
      const raw: unknown = JSON.parse(await file.text());
      if (!raw || typeof raw !== "object") throw new Error("Format invalid.");
      const p = raw as Partial<Design>;
      const safePaint = typeof p.paint === "string" && /^#[0-9a-f]{6}$/i.test(p.paint) ? p.paint : initial.paint;
      const safeKit: Kit = ["stock", "street", "widebody", "track"].includes(String(p.kit)) ? p.kit as Kit : initial.kit;
      const safeWheels: Wheels = ["five-spoke", "mesh", "deep-dish"].includes(String(p.wheels)) ? p.wheels as Wheels : initial.wheels;
      const imported: Design = {
        version: 1,
        name: typeof p.name === "string" ? p.name.slice(0, 48) : initial.name,
        paint: safePaint,
        kit: safeKit,
        wheels: safeWheels,
        lowered: typeof p.lowered === "boolean" ? p.lowered : initial.lowered,
        spoiler: typeof p.spoiler === "boolean" ? p.spoiler : initial.spoiler,
        prompt: typeof p.prompt === "string" ? p.prompt.slice(0, 500) : "",
        updatedAt: Date.now(),
      };
      setDesign(imported);
      saveToGame(imported);
      localStorage.setItem(KEY, JSON.stringify(imported));
      setNotice("Design importat și salvat în progresul jocului. Doar opțiunile acceptate au fost încărcate.");
    } catch {
      setNotice("Nu am putut importa fișierul. Alege un JSON Custom Garage valid.");
    } finally {
      if (importFile.current) importFile.current.value = "";
    }
  }
  function generate() { if (!prompt.trim()) { setNotice("Scrie întâi o descriere."); return; } setDesign((d) => interpret(prompt.trim(), d)); setNotice("Previzualizare actualizată cu opțiunile recunoscute. Acesta este un prototip, nu generare AI reală de mesh 3D."); }
  return <main style={{ minHeight: "100dvh", background: "#090c11", color: "#f3f6fb", padding: "clamp(14px, 3vw, 32px)", fontFamily: "Arial, sans-serif" }}>
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <a href="../" style={{ color: "#8ca7c7", textDecoration: "none", fontSize: 13 }}>← Înapoi la Idle Car Empire</a>
      <header style={{ margin: "18px 0 22px" }}><div style={{ color: "#54aaff", fontSize: 12, fontWeight: 900, letterSpacing: ".16em" }}>PLAYER CREATION STUDIO</div><h1 style={{ fontSize: "clamp(28px, 5vw, 46px)", lineHeight: 1, margin: "8px 0", fontWeight: 900 }}>CUSTOM GARAGE</h1><p style={{ color: "#aab7c8", maxWidth: 700, lineHeight: 1.6 }}>Configurează un hatchback în previzualizare 3D. Piesele funcționează local; generarea AI de geometrie nouă necesită un serviciu separat.</p></header>
      <div className="garage-layout" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, .9fr)", gap: 18, alignItems: "start" }}>
        <section style={{ minWidth: 0, border: "1px solid #273241", borderRadius: 18, overflow: "hidden", background: "#10151d" }}><div style={{ display: "flex", justifyContent: "space-between", padding: 14, borderBottom: "1px solid #273241", fontSize: 12, fontWeight: 800, letterSpacing: ".1em" }}><span>3D LIVE PREVIEW</span><span style={{ color: "#8da2bb" }}>TRAGE PENTRU ROTIRE</span></div><div ref={host} style={{ width: "100%", height: "clamp(300px, 48vw, 560px)", touchAction: "pan-y" }} /><div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 12, borderTop: "1px solid #273241", color: "#b9c7d8", fontSize: 11 }}><span>{design.kit.toUpperCase()}</span><span>• {design.wheels.toUpperCase()}</span><span>• {design.lowered ? "LOWERED" : "STANDARD HEIGHT"}</span></div></section>
        <section style={{ display: "grid", gap: 14 }}>
          <div style={{ border: "1px solid #273241", borderRadius: 16, background: "#10151d", padding: 16 }}><h2 style={{ margin: "0 0 14px", fontSize: 17 }}>AI DESIGN BRIEF</h2><label style={label} htmlFor="build-name">Numele mașinii</label><input id="build-name" value={design.name} onChange={(e) => update("name", e.target.value)} maxLength={48} style={{ ...field, marginBottom: 12 }} /><label style={label} htmlFor="design-prompt">Descrie modificarea</label><textarea id="design-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ex.: Golf albastru, widebody, jante concave, suspensie coborâtă și eleron..." rows={4} maxLength={500} style={{ ...field, resize: "vertical", lineHeight: 1.5 }} /><button type="button" onClick={generate} style={{ ...button, marginTop: 10 }}>Generează previzualizarea</button><p style={{ color: "#8192a7", fontSize: 11, lineHeight: 1.5 }}>Prototip: descrierea selectează opțiunile recunoscute. Nu trimite promptul către un serviciu AI și nu generează mesh-uri noi.</p></div>
          <div style={{ border: "1px solid #273241", borderRadius: 16, background: "#10151d", padding: 16 }}><h2 style={{ margin: "0 0 14px", fontSize: 17 }}>PIESE ȘI SETĂRI</h2><label style={label} htmlFor="paint">Culoare</label><div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><input id="paint" type="color" value={design.paint} onChange={(e) => update("paint", e.target.value)} style={{ width: 44, height: 38, border: 0, background: "transparent" }} /><code>{design.paint.toUpperCase()}</code></div><label style={label} htmlFor="kit">Body kit</label><select id="kit" value={design.kit} onChange={(e) => update("kit", e.target.value as Kit)} style={{ ...field, marginBottom: 12 }}><option value="stock">Original</option><option value="street">Street kit</option><option value="widebody">Widebody</option><option value="track">Track / racing</option></select><label style={label} htmlFor="wheels">Jante</label><select id="wheels" value={design.wheels} onChange={(e) => update("wheels", e.target.value as Wheels)} style={{ ...field, marginBottom: 12 }}><option value="five-spoke">Five-spoke</option><option value="mesh">Mesh</option><option value="deep-dish">Deep dish</option></select><label style={{ display: "flex", alignItems: "center", gap: 9, margin: "10px 0", fontSize: 14 }}><input type="checkbox" checked={design.lowered} onChange={(e) => update("lowered", e.target.checked)} /> Suspensie coborâtă</label><label style={{ display: "flex", alignItems: "center", gap: 9, margin: "10px 0 16px", fontSize: 14 }}><input type="checkbox" checked={design.spoiler} onChange={(e) => update("spoiler", e.target.checked)} /> Eleron spate</label><button type="button" onClick={save} style={{ ...button, background: "#18764d", borderColor: "#299566" }}>Salvează designul pe dispozitiv</button><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 9 }}><button type="button" onClick={exportDesign} style={{ ...button, background: "#182331" }}>Exportă JSON</button><button type="button" onClick={() => importFile.current?.click()} style={{ ...button, background: "#182331" }}>Importă JSON</button></div><input ref={importFile} type="file" accept="application/json,.json" aria-label="Importă fișierul de design" onChange={(e) => void importDesign(e.target.files?.[0])} style={{ display: "none" }} /></div>
          <div role="status" aria-live="polite" style={{ border: "1px solid #293748", borderRadius: 12, padding: 12, background: "#0e141c", color: "#b8c9dc", fontSize: 12, lineHeight: 1.5 }}>{notice}</div>
        </section>
      </div>
      <p style={{ color: "#66778d", fontSize: 11, lineHeight: 1.6, marginTop: 18 }}>Notă tehnică: model procedural temporar, salvare locală. Integrarea finală necesită modele GLB cu puncte de montare, furnizor AI server-side și validare a pieselor înainte de folosirea lor pe hartă și în curse.</p>
    </div>
    <style>{".garage-layout{grid-template-columns:minmax(0,1.6fr) minmax(280px,.9fr)}@media(max-width:760px){.garage-layout{grid-template-columns:minmax(0,1fr)!important}}"}</style>
  </main>;
}

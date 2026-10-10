"use client";

// The showroom: tap a car or truck on the map and the camera glides after it
// while this card shows the same 3D model live on a turntable, with what it
// is, how far it was built and the components fitted on the assembly line.
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { CAR_BY_ID } from "@/game/config/cars";
import { BASE_RECIPE, COMPONENT_BY_ID } from "@/game/config/chain";
import type { CarId, ComponentId } from "@/game/types";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { itemName } from "../panels/plant-panel";
import type { VehiclePick } from "./map-types";
import { CAR_MODEL_FOR, type CarModel } from "./vehicles";

const CAR_OF_MODEL = Object.fromEntries(Object.entries(CAR_MODEL_FOR).map(([id, m]) => [m, id])) as Record<CarModel, CarId>;
const STATIONS = 9;

export function Showcase() {
  const v = useUi((u) => u.showcase);
  const close = useUi((u) => u.setShowcase);
  const { t, lang } = useT();
  const n = useContent(lang);
  const designs = useGame((g) => g.state.designs);
  if (!v) return null;

  const car = v.kind === "car" ? CAR_BY_ID[CAR_OF_MODEL[v.model]] : null;
  const parts: ComponentId[] = car ? [...BASE_RECIPE, ...car.extras] : [];
  const title = car ? `${designs[car.id].name} · ${n.car(car)}` : t(`showcase.v.${v.kind as "van" | "truck" | "semi" | "trailer" | "carrier"}`);
  const sub = car
    ? n.carTagline(car)
    : v.kind === "carrier"
      ? v.models?.length
        ? t("showcase.load", { n: v.models.length })
        : t("showcase.empty")
      : v.empty || !v.item
        ? t("showcase.empty")
        : `${t("showcase.cargo")}: ${v.item === "raw" ? t("showcase.raw") : v.item === "car" ? t("item.car") : `${COMPONENT_BY_ID[v.item as ComponentId]?.emoji ?? "📦"} ${itemName(v.item as ComponentId, t)}`}`;

  return (
    <div className="pointer-events-auto absolute bottom-[6.5rem] left-2 z-30 w-[min(21rem,calc(100%-1rem))] overflow-hidden rounded-3xl border border-white/10 bg-ink/85 shadow-2xl backdrop-blur-xl md:bottom-6 md:left-24">
      <div className="relative">
        <Turntable v={v} />
        <div className="absolute left-3 top-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">{t("showcase.title")}</div>
        <button onClick={() => close(null)} aria-label={t("showcase.close")} className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60">
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-2.5 p-3 pt-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-base font-black">
              {car?.emoji ?? (v.kind === "carrier" ? "🚛" : "🚚")} {title}
            </div>
            <div className="truncate text-xs text-white/55">{sub}</div>
          </div>
          {car && <Badge variant="gold">{t("cars.tier", { tier: car.tier })}</Badge>}
        </div>
        {car && (
          <>
            <div>
              <div className="mb-1 flex justify-between text-[11px] font-semibold text-white/60">
                <span>{t("showcase.build")}</span>
                <span>{t("showcase.stations", { done: STATIONS, total: STATIONS })}</span>
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: STATIONS }, (_, i) => (
                  <span key={i} className="h-1.5 flex-1 rounded-full bg-emerald-400" />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold text-white/60">{t("showcase.parts")}</div>
              <div className="flex flex-wrap gap-1">
                {parts.map((c) => (
                  <span key={c} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] ring-1 ring-white/10">
                    {COMPONENT_BY_ID[c].emoji} {itemName(c, t)} <span className="text-emerald-400">✓</span>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
        {v.kind === "carrier" && !!v.models?.length && (
          <div className="flex flex-wrap gap-1">
            {v.models.map((m, i) => {
              const c = CAR_BY_ID[CAR_OF_MODEL[m]];
              return (
                <span key={i} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] ring-1 ring-white/10">
                  {c.emoji} {designs[c.id].name}
                </span>
              );
            })}
          </div>
        )}
        <div className="text-[10px] text-white/35">{t("showcase.hint")}</div>
      </div>
    </div>
  );
}

/** The live 3D model on a slowly turning platform. */
function Turntable({ v }: { v: VehiclePick }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    let dead = false;
    let cleanup = () => {};
    void (async () => {
      try {
        const T = await import("three");
        const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
        const models = await import("../three/car-models");
        if (dead) return;
        const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.NeutralToneMapping;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFShadowMap;
        const scene = new T.Scene();
        const pmrem = new T.PMREMGenerator(renderer);
        const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = env;
        const sun = new T.DirectionalLight("#fff4e2", 2.2);
        sun.position.set(-4, 7, 4);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.radius = 5;
        Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
        scene.add(sun, new T.HemisphereLight("#cfe6ff", "#3b4250", 0.8));
        // a polished turntable with a light ring
        const deck = new T.Mesh(new T.CylinderGeometry(1, 1, 0.08, 64), new T.MeshPhysicalMaterial({ color: "#1f2633", metalness: 0.6, roughness: 0.25, clearcoat: 1 }));
        deck.receiveShadow = true;
        deck.position.y = -0.04;
        const ring = new T.Mesh(new T.TorusGeometry(1, 0.012, 8, 96), new T.MeshBasicMaterial({ color: "#7dd3fc" }));
        ring.rotation.x = Math.PI / 2;
        const turn = new T.Group();
        turn.add(deck, ring);
        scene.add(turn);

        await models.loadShapes();
        await models.loadHeroes(T);
        const kit = models.materialKit(T);
        const finish = (c: string) => (/^#(f8fafc|ffffff|111827|0f172a)$/i.test(c) ? "gloss" : "metallic") as "gloss" | "metallic";
        const obj =
          v.kind === "car"
            ? models.buildCar(T, { model: v.model, color: v.color, finish: finish(v.color), steer: 0, spin: 0, stage: { station: 8 } })
            : v.kind === "carrier"
              ? models.buildCarrier(
                  T,
                  kit,
                  (v.models ?? []).map((m, i) => ({ model: m, color: i % 2 ? "#e2e8f0" : v.color, finish: "metallic" as const, steer: 0, spin: 0, stage: { station: 8 } })),
                  0,
                )
              : models.buildTruck(T, kit, { kind: v.kind, cargo: v.color, empty: !!v.empty });
        obj.traverse((o) => {
          const m = o as import("three").Mesh;
          if (m.isMesh) m.castShadow = true;
        });
        const box = new T.Box3().setFromObject(obj);
        const size = box.getSize(new T.Vector3());
        const r = Math.max(size.x, size.z) / 2;
        deck.scale.set(r * 1.15, 1, r * 1.15);
        ring.scale.set(r * 1.15, r * 1.15, 1);
        turn.add(obj);

        const camera = new T.PerspectiveCamera(30, 1, 0.1, 200);
        const fit = () => {
          const w = canvas.clientWidth || 320;
          const h = canvas.clientHeight || 180;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          const dist = (r * 1.25) / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1.5, camera.aspect);
          camera.position.set(dist * 0.78, dist * 0.42, dist * 0.78);
          camera.lookAt(0, size.y * 0.35, 0);
          camera.updateProjectionMatrix();
        };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(canvas);
        let last = performance.now();
        const loop = (now: number) => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          turn.rotation.y += dt * 0.55;
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        cleanup = () => {
          ro.disconnect();
          scene.traverse((o) => {
            const m = o as import("three").Mesh;
            if (!m.isMesh) return;
            m.geometry.dispose();
            for (const mm of Array.isArray(m.material) ? m.material : [m.material]) if (!mm.userData.keep) mm.dispose();
          });
          env.dispose();
          pmrem.dispose();
          renderer.dispose();
        };
      } catch {
        /* no WebGL: the card still shows the details */
      }
    })();
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      cleanup();
    };
  }, [v]);
  return <canvas ref={ref} className="block h-36 w-full md:h-44 bg-[radial-gradient(ellipse_at_center,#243044_0%,#0b1220_75%)]" />;
}

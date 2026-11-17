// A short clip of the player's empire to share (account.tsx → map/clip.ts): the camera sweeps
// round the company's lots while the map's own frames are copied into a vertical picture with
// the company's name on it, ending on a card with the invite code and the store. Recorded with the
// browser's MediaRecorder from that picture, so nothing leaves the phone until the player shares.
import { WORLD_MAP } from "@/game/city/layout";
import type { MapEngine } from "./engine";

export interface ClipText {
  company: string;
  logo: string;
  color: string;
  /** "Use my code" and the code ("" for none). */
  useCode: string;
  code: string;
  /** "Get it on Google Play". */
  get: string;
}

export const CLIP = {
  seconds: 8,
  /** The last seconds show the end card over the map. */
  endCard: 2,
  fps: 30,
  /** The picture's long side, px. */
  long: 1280,
  /** Video bits per second. */
  bitrate: 4_000_000,
  /** The camera turns this far round the empire (radians) and comes this much closer. */
  turn: 1.3,
  zoomIn: 2.2,
};

/** The first format this phone can record, mp4 first (every app takes it), else webm; null: none. */
export function clipMime(isSupported: (t: string) => boolean): string | null {
  for (const t of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (isSupported(t)) return t;
  }
  return null;
}

/** The clip's size: vertical like the phone's screen (16:9 at most), or 16:9 when the screen is wide. */
export function clipSize(w: number, h: number): { w: number; h: number } {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  if (w >= h) return { w: CLIP.long, h: even((CLIP.long * 9) / 16) };
  const ratio = Math.min(16 / 9, h / w);
  return { w: even(CLIP.long / ratio), h: CLIP.long };
}

/** The middle of the company's lots and how far they spread (world units), for the camera's path. */
export function empireCenter(plotIds: string[]): { x: number; z: number; spread: number } | null {
  const ps = plotIds.map((id) => WORLD_MAP.plotById[id]).filter(Boolean);
  if (!ps.length) return null;
  const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
  const z = ps.reduce((a, p) => a + p.y, 0) / ps.length;
  const spread = Math.max(40, ...ps.map((p) => Math.hypot(p.x - x, p.y - z)));
  return { x, z, spread };
}

const easeInOut = (k: number) => k * k * (3 - 2 * k);

/** Records the clip; null when this phone can't record video, the map isn't drawing, or it failed. */
export async function recordClip(eng: MapEngine, text: ClipText, onProgress?: (k: number) => void): Promise<Blob | null> {
  if (eng.clip || typeof MediaRecorder === "undefined") return null;
  const mime = clipMime((t) => MediaRecorder.isTypeSupported(t));
  const size = clipSize(eng.canvas.width, eng.canvas.height);
  const out = document.createElement("canvas");
  out.width = size.w;
  out.height = size.h;
  const c = out.getContext("2d");
  if (!mime || !c || typeof out.captureStream !== "function") return null;

  const live = eng.live();
  const center = empireCenter(Object.keys(live?.state.city.buildings ?? {})) ?? { x: eng.cam.x, z: eng.cam.z, spread: 120 };
  const cam = eng.cam;
  const saved = { x: cam.x, z: cam.z, zoom: cam.zoom, az: cam.az };
  // from far enough to see every lot, to close over the middle
  const base = eng.defaultZoom();
  const zoom0 = Math.max(cam.minZoom, base * Math.max(0.25, Math.min(1, 120 / center.spread)));
  const zoom1 = Math.min(cam.maxZoom, base * 1.8, zoom0 * CLIP.zoomIn);
  eng.track(null);
  cam.stop();

  const stream = out.captureStream(CLIP.fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: CLIP.bitrate });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  // the stream's track ends only once the recorder has handed over its last data
  const done = new Promise<void>((resolve) => (rec.onstop = () => (stream.getTracks().forEach((tr) => tr.stop()), resolve())));

  // real time, not the map's steps (capped per frame): a slow phone makes a choppier clip, not a longer one
  let t = 0;
  let started = -1;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    eng.clip = null;
    cam.x = saved.x;
    cam.z = saved.z;
    cam.zoom = saved.zoom;
    cam.az = saved.az;
    if (rec.state !== "inactive") rec.stop();
  };
  eng.clip = {
    camera: () => {
      const now = performance.now();
      if (started < 0) started = now;
      t = (now - started) / 1000;
      const k = easeInOut(Math.min(1, t / CLIP.seconds));
      cam.x = center.x;
      cam.z = center.z;
      cam.zoom = Math.exp(Math.log(zoom0) + (Math.log(zoom1) - Math.log(zoom0)) * k);
      cam.az = saved.az + CLIP.turn * k;
      cam.clamp();
    },
    frame: () => {
      drawClipFrame(c, eng.canvas, size, text, Math.max(0, t - (CLIP.seconds - CLIP.endCard)) / CLIP.endCard);
      onProgress?.(Math.min(1, t / CLIP.seconds));
      if (t >= CLIP.seconds) finish();
    },
  };
  rec.start(500);
  // a map that stops drawing (the app sent to the background) ends the clip there
  const guard = setTimeout(finish, (CLIP.seconds + 6) * 1000);
  await done;
  clearTimeout(guard);
  const blob = new Blob(chunks, { type: mime.split(";")[0] });
  return t >= CLIP.seconds && blob.size > 0 ? blob : null;
}

/** One frame: the map, cropped to fill the picture, the company's name, and the end card fading in (end 0–1). */
function drawClipFrame(c: CanvasRenderingContext2D, src: HTMLCanvasElement, size: { w: number; h: number }, text: ClipText, end: number) {
  const { w: W, h: H } = size;
  // cover: the map's middle, scaled to fill
  const s = Math.max(W / src.width, H / src.height);
  const sw = W / s;
  const sh = H / s;
  c.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
  const u = W / 720;
  c.textAlign = "center";
  c.textBaseline = "middle";
  // the company, on a band at the top
  const top = c.createLinearGradient(0, 0, 0, 220 * u);
  top.addColorStop(0, "rgba(0,0,0,0.65)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = top;
  c.fillRect(0, 0, W, 220 * u);
  c.fillStyle = "#ffffff";
  c.font = `900 ${Math.round(52 * u)}px system-ui, sans-serif`;
  c.fillText(`${text.logo} ${text.company}`, W / 2, 90 * u, W - 60 * u);
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.font = `700 ${Math.round(26 * u)}px system-ui, sans-serif`;
  c.fillText("IDLE CAR EMPIRE", W / 2, 145 * u);
  if (end <= 0) return;
  // the end card
  c.globalAlpha = Math.min(1, end * 2);
  c.fillStyle = "rgba(8,10,16,0.78)";
  c.fillRect(0, 0, W, H);
  c.fillStyle = "#ffffff";
  c.font = `900 ${Math.round(64 * u)}px system-ui, sans-serif`;
  c.fillText("IDLE CAR EMPIRE", W / 2, H / 2 - 170 * u, W - 60 * u);
  if (text.code) {
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.font = `700 ${Math.round(30 * u)}px system-ui, sans-serif`;
    c.fillText(text.useCode, W / 2, H / 2 - 50 * u, W - 60 * u);
    c.fillStyle = text.color;
    c.beginPath();
    c.roundRect(W / 2 - 230 * u, H / 2 - 5 * u, 460 * u, 110 * u, 24 * u);
    c.fill();
    c.fillStyle = "#0b0b0e";
    c.font = `900 ${Math.round(66 * u)}px ui-monospace, Menlo, monospace`;
    c.fillText(text.code.split("").join(" "), W / 2, H / 2 + 52 * u);
  }
  c.fillStyle = "#fbbf24";
  c.font = `800 ${Math.round(34 * u)}px system-ui, sans-serif`;
  c.fillText(text.get, W / 2, H / 2 + 190 * u, W - 60 * u);
  c.globalAlpha = 1;
}

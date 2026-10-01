export type Stage = "chassis" | "weld" | "paint" | "assembly" | "qc" | "delivery";

/** Build stages along a batch's progress — matches partOpacities in car-sprite. */
export function stageOf(p: number): Stage {
  if (p < 0.16) return "chassis";
  if (p < 0.42) return "weld";
  if (p < 0.62) return "paint";
  if (p < 0.82) return "assembly";
  if (p < 0.9) return "qc";
  return "delivery";
}

export const STAGE_LABEL: Record<Stage, string> = {
  chassis: "Chassis & frame",
  weld: "Body welding",
  paint: "Paint shop",
  assembly: "Wheels & interior",
  qc: "Quality check",
  delivery: "Off to the dealer",
};

type Fx = "weld" | "paint" | "assembly" | "qc" | "helper" | "label" | "line" | "robots";

/**
 * Toggles each station's effects (sparks, paint mist, QC lights…) only when
 * the stage changes, so the per-frame cost stays tiny. Effect groups are
 * marked with data-fx="…" inside the scene's <svg>.
 */
export function applyStage(svg: SVGSVGElement | null, stage: Stage, active: boolean) {
  if (!svg) return;
  const key = `${stage}:${active}`;
  if (svg.dataset.stage === key) return;
  svg.dataset.stage = key;
  const scope: Element = svg.closest("[data-scene]") ?? svg;
  const el = (k: Fx) => scope.querySelector<HTMLElement | SVGElement>(`[data-fx="${k}"]`);
  const show = (k: Fx, on: boolean) => {
    const e = el(k);
    if (e) e.style.display = on ? "" : "none";
  };
  show("weld", active && stage === "weld");
  show("paint", active && stage === "paint");
  show("assembly", active && stage === "assembly");
  show("qc", active && stage === "qc");
  el("helper")?.classList.toggle("is-idle", !active);
  el("line")?.classList.toggle("is-running", active);
  el("robots")?.classList.toggle("is-welding", active && stage === "weld");
  el("robots")?.classList.toggle("is-running", active);
  const label = el("label");
  if (label) label.textContent = active ? STAGE_LABEL[stage] : "Idle — tap BUILD";
}

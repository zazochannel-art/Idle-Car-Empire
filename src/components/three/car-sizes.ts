// The car bodies and their sizes, apart from the 3D builders: the 2D map and the panels need
// them without loading the models (or three.js) up front.

export type BodyModel = "city" | "sedan" | "suv" | "sports" | "muscle" | "luxury" | "supercar" | "hypercar" | "electric" | "compact" | "minivan" | "offroad" | "pickup" | "wagon" | "robotaxi";

/** Bumper-to-bumper length of each body, metres: its ready-made model is scaled to it. */
export const CAR_LENGTH: Record<BodyModel, number> = {
  city: 3.98,
  sedan: 4.35,
  suv: 4.8,
  sports: 4.25,
  muscle: 4.65,
  luxury: 4.5,
  supercar: 4.55,
  hypercar: 4.6,
  electric: 4.5,
  compact: 3.9,
  minivan: 4.9,
  offroad: 4.3,
  pickup: 5.3,
  wagon: 4.6,
  robotaxi: 4.7,
};

// The factory paint of every model, as in the reference line-up: each class
// leaves the assembly line in its own colour (no badges, no logos).
export type LiveryModel = "city" | "sedan" | "suv" | "sports" | "muscle" | "luxury" | "supercar" | "hypercar" | "electric";

export interface Livery {
  color: string;
  finish: "metallic" | "gloss" | "matte";
}

export const LIVERY: Record<LiveryModel, Livery> = {
  city: { color: "#c3141b", finish: "gloss" }, // red 80s hot hatch
  sedan: { color: "#b3b9c0", finish: "metallic" }, // silver box-flared sports sedan
  suv: { color: "#f2f2ef", finish: "gloss" }, // white SUV, black roof
  sports: { color: "#f3c014", finish: "gloss" }, // yellow classic rear-engine coupe
  muscle: { color: "#1b46b8", finish: "gloss" }, // blue 60s muscle coupe, white stripes
  luxury: { color: "#121418", finish: "gloss" }, // black classic coupe, chrome
  supercar: { color: "#f2681c", finish: "gloss" }, // orange track coupe, big wing
  hypercar: { color: "#6a2fd6", finish: "metallic" }, // purple mid-engine, carbon top
  electric: { color: "#1c9a3c", finish: "gloss" }, // green classic coupe, black roof, stripes
};

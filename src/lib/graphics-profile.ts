// The graphics profile of THIS device: LOW, MEDIUM, HIGH or ULTRA (components/map/quality.ts says what each
// does). It belongs to the phone, not to the player: a profile chosen on a weak phone must not follow the
// account to a strong tablet, so it lives in the device's own storage (never in the save, never in the cloud,
// no SAVE_VERSION). With nothing stored yet, an old save's "low graphics" switch decides once (LOW, else HIGH:
// what the game did until now), so nobody's picture changes by updating.
import { create } from "zustand";
import { GRAPHICS_PROFILES, type GraphicsProfile } from "@/components/map/quality";
import { useGame } from "@/store/game-store";

export type { GraphicsProfile };
export { GRAPHICS_PROFILES };

const KEY = "ice.graphics";

export function readStoredProfile(storage: Pick<Storage, "getItem"> | null = browserStorage()): GraphicsProfile | null {
  try {
    const v = storage?.getItem(KEY);
    return GRAPHICS_PROFILES.includes(v as GraphicsProfile) ? (v as GraphicsProfile) : null;
  } catch {
    return null;
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The profile in force: the one chosen on this device, else what an older save's "low graphics" switch said. */
export function resolveProfile(stored: GraphicsProfile | null, savedLow: boolean): GraphicsProfile {
  return stored ?? (savedLow ? "low" : "high");
}

interface GraphicsStore {
  /** Chosen on this device (null: not chosen yet). */
  profile: GraphicsProfile | null;
  set: (p: GraphicsProfile) => void;
}

export const useGraphics = create<GraphicsStore>((set) => ({
  profile: readStoredProfile(),
  set: (p) => {
    try {
      window.localStorage.setItem(KEY, p);
    } catch {
      // storage blocked: the choice lasts until the app is closed
    }
    set({ profile: p });
  },
}));

/** The profile in force now, outside React (the 3D views read it when they open). */
export function currentProfile(): GraphicsProfile {
  return resolveProfile(useGraphics.getState().profile, useGame.getState().state.settings.lowGraphics);
}

/** Whether the "low graphics" mode is in force (the LOW profile). */
export const isLowGraphics = () => currentProfile() === "low";

/** The profile in force, for React. */
export function useProfile(): GraphicsProfile {
  const stored = useGraphics((g) => g.profile);
  const savedLow = useGame((g) => g.state.settings.lowGraphics);
  return resolveProfile(stored, savedLow);
}

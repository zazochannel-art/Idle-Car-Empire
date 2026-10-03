// Seasons decorate the map and add a small income bonus while they last.
export type Season = "halloween" | "winter";

/** Income bonus while a season runs. */
export const SEASON_BONUS = 0.1;

export function seasonAt(now: number): Season | null {
  const d = new Date(now);
  const m = d.getMonth();
  const day = d.getDate();
  if ((m === 9 && day >= 10) || (m === 10 && day <= 2)) return "halloween";
  if ((m === 11 && day >= 10) || (m === 0 && day <= 6)) return "winter";
  return null;
}

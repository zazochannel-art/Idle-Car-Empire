/**
 * The names other players see (player names, company names, alliance names and
 * tags) are kept free of slurs, obscenities and staff impersonation: the game
 * checks them before sending, and the server checks them again with the same
 * lists (supabase/migrations/0008_player_safety.sql, kept equal by names.test.ts).
 *
 * A name is folded first: lower case, diacritics off, digits and symbols read as
 * the letters they stand for (0 → o, 4 → a, $ → s…). Then a "part" may not appear
 * anywhere in its letters run together (so "f.u.c.k" or "$h1t" inside a longer
 * name count), and a "word" may not be one of its words (short stems that sit inside
 * innocent words, like "ass" in "class", count only on their own).
 */

/** Characters folded one for one (equal to the SQL translate() in migration 0008). */
export const FOLD_FROM = "ăâîșşțţéèêëáàäåíìïóòöôõúùüûñçýÿёй013457@$!8";
export const FOLD_TO = "aaisstteeeeaaaaiiiooooouuuuncyyеиoieastasib";

/** Never inside a name, wherever they stand (letters run together). */
export const NAME_PARTS = [
  // English
  "fuck",
  "motherf",
  "shit",
  "bitch",
  "nigger",
  "nigga",
  "faggot",
  "whore",
  "slut",
  "asshole",
  "dickhead",
  "retard",
  "pussy",
  "penis",
  "vagina",
  "porn",
  "hitler",
  "rapist",
  "wanker",
  "twat",
  "jizz",
  "bollock",
  "kkk",
  // Romanian
  "pizd",
  "cacat",
  "labagiu",
  "bulangiu",
  "poponar",
  "sugipula",
  // Russian, and its common spellings in Latin letters
  "хуи",
  "хуе",
  "хуя",
  "хую",
  "пизд",
  "ебат",
  "ебан",
  "ебал",
  "ебло",
  "ебну",
  "уеб",
  "заеб",
  "выеб",
  "въеб",
  "бля",
  "сука",
  "мудак",
  "мудил",
  "пидор",
  "пидар",
  "пидр",
  "гандон",
  "шлюх",
  "залуп",
  "дроч",
  "гитлер",
  "нацист",
  "blyat",
  "blyad",
  "eblan",
  "mudak",
  "pidor",
  "pidar",
  "gandon",
] as const;

/** Never a whole word of a name (they hide inside harmless words otherwise). */
export const NAME_WORDS = [
  // English
  "ass",
  "cunt",
  "dick",
  "cock",
  "fag",
  "rape",
  "cum",
  "nazi",
  "nazis",
  "sex",
  "anal",
  "anus",
  "tits",
  "boobs",
  "kike",
  "spic",
  "chink",
  "gook",
  "tranny",
  "wank",
  // Romanian
  "pula",
  "pule",
  "curva",
  "muie",
  "javra",
  "tigan",
  "tigani",
  "bozgor",
  "futu",
  "futut",
  "fututi",
  "jidan",
  // Russian
  "жид",
  "жиды",
  "хохол",
  "чурка",
  "чурки",
  "суки",
  "хер",
  "suka",
  "ebat",
  "suki",
  "huy",
  "huj",
  "xuy",
  "blya",
  // posing as the game's staff
  "admin",
  "administrator",
  "moderator",
  "администратор",
  "модератор",
] as const;

const FOLD = new Map([...FOLD_FROM].map((c, i) => [c, [...FOLD_TO][i]]));

/** A name folded for the checks: lower case, diacritics off, look-alike digits and symbols as letters. */
export function foldName(name: string): string {
  return [...name.toLowerCase()].map((c) => FOLD.get(c) ?? c).join("");
}

/** True when the name has no word or part from the lists above. */
export function isCleanName(name: string): boolean {
  const folded = foldName(name);
  const letters = folded.replace(/[^a-zа-я]/g, "");
  if (NAME_PARTS.some((p) => letters.includes(p))) return false;
  const words = new Set(folded.split(/[^a-zа-я]+/));
  return !NAME_WORDS.some((w) => words.has(w));
}

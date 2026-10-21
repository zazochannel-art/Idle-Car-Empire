// What a new password must be: at least 8 characters, with a letter and a digit, not one of the
// passwords everyone tries first, and not the player's email or name. The game's forms check it
// as the player types; the site's reset page (site/reset-password/) checks the same rule. Signing
// in takes any password, so older accounts keep theirs. The server holds the length too once the
// owner sets it in Supabase (docs/captcha.md).

export const PASSWORD_MIN = 8;

export type PasswordIssue = "short" | "simple" | "common" | "personal";

/** The first passwords guessed (lowercase), among those with 8+ characters, a letter and a digit. */
const COMMON = new Set([
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd",
  "p4ssw0rd",
  "qwerty123",
  "qwerty12",
  "qwerty1234",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "q1w2e3r4",
  "q1w2e3r4t5",
  "1qaz2wsx",
  "zaq12wsx",
  "abc12345",
  "abcd1234",
  "a1b2c3d4",
  "asdf1234",
  "qwer1234",
  "1234qwer",
  "12345678a",
  "123456789a",
  "a12345678",
  "a123456789",
  "iloveyou1",
  "welcome1",
  "welcome123",
  "letmein1",
  "football1",
  "baseball1",
  "monkey123",
  "dragon123",
  "sunshine1",
  "princess1",
  "test1234",
  "admin123",
  "admin1234",
  "user1234",
  "idlecar1",
  "idlecar123",
  "idlecarempire1",
]);

/** What is wrong with a new password (null: nothing). */
export function passwordIssue(pw: string, about: { email?: string; name?: string } = {}): PasswordIssue | null {
  if ([...pw].length < PASSWORD_MIN) return "short";
  if (!/\p{L}/u.test(pw) || !/\p{Nd}/u.test(pw)) return "simple";
  const low = pw.toLowerCase();
  // one character over and over but a digit ("aaaaaaa1"), or a common password with a "!" after it
  if (COMMON.has(low) || COMMON.has(low.replace(/[!.?]+$/, "")) || new Set(low.replace(/\p{Nd}/gu, "")).size <= 1) return "common";
  const mine = [about.email?.split("@")[0], about.name].map((x) => x?.trim().toLowerCase() ?? "").filter((x) => [...x].length >= 4);
  if (mine.some((x) => low.includes(x))) return "personal";
  return null;
}

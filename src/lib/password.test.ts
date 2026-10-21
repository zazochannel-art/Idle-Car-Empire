import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authError } from "@/game/save/supabase";
import { captchaFailed, captchaOn, CaptchaError } from "./captcha";
import { PASSWORD_MIN, passwordIssue } from "./password";

describe("new passwords", () => {
  it("need 8 characters, a letter and a digit", () => {
    expect(passwordIssue("ab12")).toBe("short");
    expect(passwordIssue("abcdefghij")).toBe("simple");
    expect(passwordIssue("1234567890")).toBe("simple");
    expect(passwordIssue("Garage-2026")).toBeNull();
    // any alphabet counts as letters, and characters (not bytes) as length
    expect(passwordIssue("пароль2026")).toBeNull();
    expect(passwordIssue("ăîșț1234")).toBeNull();
    expect(passwordIssue("ăîș12")).toBe("short");
  });

  it("aren't the ones everyone tries first", () => {
    for (const pw of ["password1", "Password123", "QWERTY123", "1q2w3e4r", "abcd1234", "iloveyou1", "password1!", "aaaaaaa1", "zzzz9999"]) expect(passwordIssue(pw), pw).toBe("common");
    expect(passwordIssue("turbo-garage-7")).toBeNull();
  });

  it("don't hold the player's email or name", () => {
    expect(passwordIssue("ana.dragomir99", { email: "ana.dragomir@example.com" })).toBe("personal");
    expect(passwordIssue("KartKaiser1", { name: "kartkaiser" })).toBe("personal");
    // a short name or email part isn't counted (it would match too much)
    expect(passwordIssue("bob-garage-1", { email: "bob@example.com", name: "Bo" })).toBeNull();
  });

  it("the site's reset page holds the same rule", () => {
    const page = readFileSync(join(__dirname, "../../site/reset-password/index.html"), "utf8");
    expect(page).toContain(`Array.from(pw).length < ${PASSWORD_MIN}`);
    expect(page).toContain(String.raw`!/\p{L}/u.test(pw) || !/\p{Nd}/u.test(pw)`);
    expect(page.match(/minlength="(\d+)"/g)).toEqual([`minlength="${PASSWORD_MIN}"`, `minlength="${PASSWORD_MIN}"`]);
  });
});

describe("the robot check", () => {
  it("is off without the build's site key", () => {
    expect(captchaOn()).toBe(false);
  });

  it("tells a failed check from other errors", () => {
    expect(captchaFailed(new CaptchaError("timed out"))).toBe(true);
    expect(captchaFailed({ code: "captcha_failed", message: "captcha protection: request disallowed (timeout-or-duplicate)" })).toBe(true);
    expect(captchaFailed(new Error("Failed to fetch"))).toBe(false);
    expect(captchaFailed(null)).toBe(false);
    // Supabase's answer reads as the game's "captcha" error, not "invalid"
    expect(authError({ code: "captcha_failed", message: "captcha protection: request disallowed (invalid-input-response)", status: 400 })).toBe("captcha");
    expect(authError({ code: "invalid_credentials", message: "Invalid login credentials", status: 400 })).toBe("credentials");
  });
});

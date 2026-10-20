// The push sender (supabase/functions/push/lib.ts), run in Node with a fake database and a
// fake Firebase: what it signs, what it sends to which phone, and what it forgets.
import { describe, expect, it } from "vitest";
import { EVENTS as GAME_EVENTS } from "@/game/config/events";
import { deContent } from "@/i18n/de";
import { esContent } from "@/i18n/es";
import { LANGS } from "@/i18n";
import { ptContent } from "@/i18n/pt";
import { roContent } from "@/i18n/ro";
import { ruContent } from "@/i18n/ru";
import { BATCH, EVENTS, noteText, parseServiceAccount, runPush, TEXTS, type Env } from "../../supabase/functions/push/lib";

const b64 = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64");
const unb64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

async function serviceAccount() {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;
  const json = JSON.stringify({ type: "service_account", project_id: "idle-car-empire", client_email: "push@idle-car-empire.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" });
  return { json, publicKey: keys.publicKey };
}

interface Call {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** A fake project and Firebase: answers by URL, and keeps every call. */
function fakeServer(answers: { take?: unknown[]; fcm?: (token: string) => Response; token?: Response } = {}) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const call = { url, headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? "") };
    calls.push(call);
    if (url.endsWith("/rpc/push_collect")) return Response.json(1);
    if (url.endsWith("/rpc/push_waiting")) return Response.json(3);
    if (url.endsWith("/rpc/push_take")) return Response.json(answers.take ?? []);
    if (url.endsWith("/rpc/push_forget")) return Response.json((JSON.parse(call.body) as { p_tokens: string[] }).p_tokens.length);
    if (url === "https://oauth2.googleapis.com/token") return answers.token ?? Response.json({ access_token: "ya29.test", expires_in: 3599 });
    if (url.startsWith("https://fcm.googleapis.com/")) {
      const token = (JSON.parse(call.body) as { message: { token: string } }).message.token;
      return answers.fcm?.(token) ?? Response.json({ name: `projects/idle-car-empire/messages/${token}` });
    }
    return new Response("not found", { status: 404 });
  };
  return { calls, fetch };
}

const env = (serviceAccount?: string): Env => ({ supabaseUrl: "https://orffhhsogoymalyogfzl.supabase.co/", serviceKey: "service-key", serviceAccount });

describe("push sender", () => {
  it("until Firebase is set up: queues, counts what waits, sends nothing", async () => {
    const server = fakeServer({ take: [{ token: "t1", lang: "en", kind: "cup", args: {} }] });
    const report = await runPush(env(), server.fetch);
    expect(report).toEqual({ configured: false, queued: 1, waiting: 3, sent: 0, failed: 0, forgotten: 0 });
    expect(server.calls.map((c) => c.url.split("/").pop())).toEqual(["push_collect", "push_waiting"]);
    // the database with the service key, which goes nowhere else
    for (const c of server.calls) expect(c.headers).toMatchObject({ apikey: "service-key", Authorization: "Bearer service-key" });
    // a secret that isn't a service account key says so
    expect((await runPush(env('{"project_id":"x"}'), fakeServer().fetch)).error).toMatch(/not a service account/);
    expect(parseServiceAccount("not json")).toBeNull();
  });

  it("signs the token request with the service account's key", async () => {
    const sa = await serviceAccount();
    const server = fakeServer();
    const now = Date.UTC(2026, 9, 20, 12);
    await runPush(env(sa.json), server.fetch, now);
    const req = server.calls.find((c) => c.url === "https://oauth2.googleapis.com/token")!;
    const form = new URLSearchParams(req.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [head, claims, sig] = form.get("assertion")!.split(".");
    expect(JSON.parse(unb64url(head).toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(unb64url(claims).toString())).toEqual({
      iss: "push@idle-car-empire.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now / 1000,
      exp: now / 1000 + 3600,
    });
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", sa.publicKey, unb64url(sig), new TextEncoder().encode(`${head}.${claims}`));
    expect(ok).toBe(true);
  });

  it("sends each note to its phone in its language, and forgets the phones that are gone", async () => {
    const sa = await serviceAccount();
    const server = fakeServer({
      take: [
        { token: "t-gift", lang: "ro", kind: "gift", args: { name: "Ana" } },
        { token: "t-event", lang: "xx", kind: "event", args: { event: "carShow" } },
        { token: "t-gone", lang: "de", kind: "cup", args: { week: 2963 } },
        { token: "t-bad", lang: "es", kind: "invite", args: {} },
        { token: "t-busy", lang: "pt", kind: "invite", args: {} },
        { token: "t-odd", lang: "en", kind: "event", args: { event: "noSuchEvent" } },
      ],
      fcm: (token) =>
        token === "t-gone"
          ? Response.json({ error: { code: 404, status: "NOT_FOUND", details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }] } }, { status: 404 })
          : token === "t-bad"
            ? Response.json({ error: { code: 400, status: "INVALID_ARGUMENT" } }, { status: 400 })
            : token === "t-busy"
              ? Response.json({ error: { code: 503, status: "UNAVAILABLE" } }, { status: 503 })
              : (undefined as unknown as Response),
    });
    const report = await runPush(env(sa.json), server.fetch);
    expect(report).toEqual({ configured: true, queued: 1, sent: 2, failed: 4, forgotten: 2 });
    const take = server.calls.find((c) => c.url.endsWith("/push_take"))!;
    expect(JSON.parse(take.body)).toEqual({ p_limit: BATCH });

    const sent = server.calls.filter((c) => c.url.startsWith("https://fcm.googleapis.com/"));
    expect(new Set(sent.map((c) => c.url))).toEqual(new Set(["https://fcm.googleapis.com/v1/projects/idle-car-empire/messages:send"]));
    for (const c of sent) expect(c.headers.Authorization).toBe("Bearer ya29.test");
    const msg = (token: string) => (JSON.parse(sent.find((c) => c.body.includes(`"${token}"`))!.body) as { message: Record<string, unknown> }).message;
    expect(msg("t-gift")).toEqual({
      token: "t-gift",
      notification: { title: "🎁 Un cadou pentru tine", body: "Ana ți-a trimis un cadou. Intră în joc să-l iei." },
      data: { kind: "gift" },
      android: { collapse_key: "gift", ttl: "43200s", notification: { channel_id: "game", icon: "ic_stat_notify", tag: "gift" } },
    });
    // an unknown language reads English; the event by its name
    expect(msg("t-event").notification).toEqual({ title: "🎪 International Car Show", body: "The event has started. Don't miss it!" });
    // an event this sender doesn't know isn't sent at all
    expect(sent.some((c) => c.body.includes("t-odd"))).toBe(false);
    // the uninstalled and the invalid phones are forgotten; the busy one is only a failure
    const forget = server.calls.find((c) => c.url.endsWith("/push_forget"))!;
    expect((JSON.parse(forget.body) as { p_tokens: string[] }).p_tokens.sort()).toEqual(["t-bad", "t-gone"]);
  });

  it("without an access token takes nothing (the notes wait for the next run)", async () => {
    const sa = await serviceAccount();
    const server = fakeServer({ token: Response.json({ error: "invalid_grant" }, { status: 400 }), take: [{ token: "t1", lang: "en", kind: "cup", args: {} }] });
    const report = await runPush(env(sa.json), server.fetch);
    expect(report).toMatchObject({ configured: true, sent: 0, error: "access token: 400" });
    expect(server.calls.some((c) => c.url.endsWith("/push_take"))).toBe(false);
  });

  it("speaks every game language, and names the game's events as the game does", () => {
    expect(Object.keys(TEXTS).sort()).toEqual(LANGS.map((l) => l.id).sort());
    const content = { ro: roContent, ru: ruContent, es: esContent, pt: ptContent, de: deContent };
    expect(Object.keys(EVENTS).sort()).toEqual(GAME_EVENTS.map((e) => e.id).sort());
    for (const e of GAME_EVENTS) {
      expect(EVENTS[e.id]).toMatchObject({ emoji: e.emoji, en: e.name });
      for (const [lang, texts] of Object.entries(content)) expect(EVENTS[e.id][lang as keyof typeof content]).toBe(texts[`event.${e.id}.name`]);
    }
    // a gift without a name still reads well; a long name is cut
    expect(noteText("en", "gift", {})?.body).toBe("A player sent you a gift. Open the game to collect it.");
    expect(noteText("en", "gift", { name: "x".repeat(40) })?.body.startsWith(`${"x".repeat(20)} sent`)).toBe(true);
    for (const lang of Object.keys(TEXTS)) for (const kind of ["gift", "invite", "cup"]) expect(noteText(lang, kind, { name: "Ana" })?.title.length).toBeGreaterThan(3);
  });
});

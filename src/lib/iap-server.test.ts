// The purchases check (supabase/functions/iap/lib.ts), run in Node with a fake Google Play, a
// fake sign-in and a fake ledger that answers like supabase/migrations/0019_purchases.sql.
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { IAP_PRODUCTS } from "@/game/config/iap";
import { accountMark, handle, PRODUCTS, productsFrom, readVoided, verifyPurchase, type Deps, type Env } from "../../supabase/functions/iap/lib";

const env: Env = { supabaseUrl: "https://db.test", serviceKey: "service-key", packageName: "com.zazochannel.idlecarempire", products: productsFrom(undefined, undefined) };
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const markOf = (user: string) => sha(`idle-car-empire:${user}`);

interface PlayPurchase {
  productId: string;
  purchaseState: number;
  orderId?: string;
  obfuscatedExternalAccountId?: string;
  purchaseType?: number;
}
interface Row {
  user: string;
  product: string;
  state: "purchased" | "pending" | "refunded";
  test: boolean;
}

let play: Record<string, PlayPurchase>;
let playDown: number | null;
let voided: { purchaseToken: string }[][];
let ledger: Map<string, Row>;
let voidedMark: string | null;
let sessions: Record<string, string>;
let configured: boolean;
const calls: string[] = [];

/** The fake world behind fetch: Google Play, Supabase's sign-in, and the ledger's functions. */
const fakeFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const u = new URL(url);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  if (u.hostname === "androidpublisher.googleapis.com") {
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer play-access");
    if (playDown) return reply({ error: {} }, playDown);
    const voidedPath = `/androidpublisher/v3/applications/${env.packageName}/purchases/voidedpurchases`;
    if (u.pathname === voidedPath) {
      calls.push(`voided ${u.searchParams.get("token") ?? "-"}`);
      const page = Number(u.searchParams.get("token") ?? 0);
      return reply({ voidedPurchases: voided[page] ?? [], ...(page + 1 < voided.length ? { tokenPagination: { nextPageToken: String(page + 1) } } : {}) });
    }
    const m = u.pathname.match(/\/purchases\/products\/([^/]+)\/tokens\/([^/]+)$/);
    const p = m ? play[decodeURIComponent(m[2])] : undefined;
    if (!m || !p || p.productId !== decodeURIComponent(m[1])) return reply({ error: { code: 400 } }, 400);
    return reply(p);
  }
  if (u.pathname === "/auth/v1/user") {
    const user = sessions[new Headers(init?.headers).get("Authorization") ?? ""];
    return user ? reply({ id: user }) : reply({ msg: "invalid" }, 401);
  }
  const fn = u.pathname.replace("/rest/v1/rpc/", "");
  const a = JSON.parse(String(init?.body ?? "{}"));
  calls.push(fn);
  if (fn === "iap_record") {
    const r = ledger.get(a.p_token_hash);
    if (!r) {
      ledger.set(a.p_token_hash, { user: a.p_user, product: a.p_product, state: a.p_state, test: a.p_test });
      return reply("new");
    }
    if (r.user !== a.p_user) return reply("taken");
    if (r.state === "refunded") return reply("refunded");
    r.state = a.p_state;
    return reply("known");
  }
  if (fn === "iap_refunded") {
    let n = 0;
    for (const h of a.p_token_hashes as string[]) {
      const r = ledger.get(h);
      if (r && r.state !== "refunded") {
        r.state = "refunded";
        n++;
      }
    }
    if (a.p_mark) voidedMark = a.p_mark;
    return reply(n);
  }
  if (fn === "iap_voided_mark") return reply(voidedMark);
  return reply({ message: "no such function" }, 404);
};

const deps: Deps = { fetch: fakeFetch, accessToken: async () => (configured ? "play-access" : null), now: () => Date.UTC(2026, 9, 27, 12) };

beforeEach(() => {
  play = {};
  playDown = null;
  voided = [];
  ledger = new Map();
  voidedMark = null;
  sessions = { "Bearer jwt-a": "user-a", "Bearer jwt-b": "user-b" };
  configured = true;
  calls.length = 0;
});

describe("the purchases check (functions/iap)", () => {
  it("knows the game's products, and marks accounts the way the app does", async () => {
    expect([...PRODUCTS]).toEqual(IAP_PRODUCTS);
    expect(productsFrom(undefined, undefined)).toEqual({ starter_pack: "starter", ad_free_rewards: "adFree" });
    expect(productsFrom(" my_starter ", "my_ad_free")).toEqual({ my_starter: "starter", my_ad_free: "adFree" });
    // lib/native-iap.ts: sha256("idle-car-empire:" + the account id), as hex
    expect(await accountMark("user-a")).toBe(markOf("user-a"));
  });

  it("a paid purchase for this account is valid, and kept for it (a license tester's marked as a test)", async () => {
    play["tok-1"] = { productId: "starter_pack", purchaseState: 0, orderId: "GPA.1", obfuscatedExternalAccountId: markOf("user-a"), purchaseType: 0 };
    expect(await verifyPurchase(env, deps, "user-a", "starter_pack", "tok-1")).toBe("valid");
    expect(ledger.get(sha("tok-1"))).toEqual({ user: "user-a", product: "starter", state: "purchased", test: true });
    // the same account again (a reinstall): still valid
    expect(await verifyPurchase(env, deps, "user-a", "starter_pack", "tok-1")).toBe("valid");
  });

  it("a purchase belongs to one account", async () => {
    // a promo code redeemed in the Play Store has no account: the first account to report it keeps it
    play["tok-2"] = { productId: "ad_free_rewards", purchaseState: 0 };
    expect(await verifyPurchase(env, deps, "user-a", "ad_free_rewards", "tok-2")).toBe("valid");
    expect(await verifyPurchase(env, deps, "user-b", "ad_free_rewards", "tok-2")).toBe("taken");
    // bought for another account
    play["tok-3"] = { productId: "ad_free_rewards", purchaseState: 0, obfuscatedExternalAccountId: markOf("user-a") };
    expect(await verifyPurchase(env, deps, "user-b", "ad_free_rewards", "tok-3")).toBe("other_account");
    expect(ledger.has(sha("tok-3"))).toBe(false);
  });

  it("forged purchases, unknown products and odd tokens are invalid", async () => {
    expect(await verifyPurchase(env, deps, "user-a", "starter_pack", "made-up-token")).toBe("invalid");
    play["tok-4"] = { productId: "starter_pack", purchaseState: 0 };
    // the right token for another product
    expect(await verifyPurchase(env, deps, "user-a", "ad_free_rewards", "tok-4")).toBe("invalid");
    expect(await verifyPurchase(env, deps, "user-a", "gems_1000", "tok-4")).toBe("invalid");
    expect(await verifyPurchase(env, deps, "user-a", "starter_pack", "")).toBe("invalid");
    expect(await verifyPurchase(env, deps, "user-a", "starter_pack", "tok 4 with spaces")).toBe("invalid");
    expect(ledger.size).toBe(0);
  });

  it("pending until paid; a cancelled purchase is refunded", async () => {
    play["tok-5"] = { productId: "starter_pack", purchaseState: 2 };
    expect(await verifyPurchase(env, deps, "user-a", "starter_pack", "tok-5")).toBe("pending");
    expect(ledger.get(sha("tok-5"))?.state).toBe("pending");
    play["tok-5"].purchaseState = 0;
    expect(await verifyPurchase(env, deps, "user-a", "starter_pack", "tok-5")).toBe("valid");
    play["tok-5"].purchaseState = 1;
    expect(await verifyPurchase(env, deps, "user-a", "starter_pack", "tok-5")).toBe("refunded");
    expect(ledger.get(sha("tok-5"))?.state).toBe("refunded");
    // refunded stays refunded, whatever Google answers later
    play["tok-5"].purchaseState = 0;
    expect(await verifyPurchase(env, deps, "user-a", "starter_pack", "tok-5")).toBe("refunded");
  });

  it("when Google Play can't answer, it says nothing about the purchase (the phone tries again)", async () => {
    play["tok-6"] = { productId: "starter_pack", purchaseState: 0 };
    for (const status of [401, 403, 429, 500, 503]) {
      playDown = status;
      await expect(verifyPurchase(env, deps, "user-a", "starter_pack", "tok-6")).rejects.toThrow(`play: ${status}`);
    }
    expect(ledger.size).toBe(0);
  });

  it("reads Google's voided purchases page by page, marks them refunded, and moves its mark", async () => {
    for (const t of ["tok-7", "tok-8", "tok-9"]) {
      play[t] = { productId: "ad_free_rewards", purchaseState: 0 };
      await verifyPurchase(env, deps, "user-a", "ad_free_rewards", t);
    }
    calls.length = 0;
    voided = [[{ purchaseToken: "tok-7" }, { purchaseToken: "someone-elses-tok" }], [{ purchaseToken: "tok-9" }]];
    expect(await readVoided(env, deps)).toEqual({ configured: true, read: 3, refunded: 2 });
    expect(calls).toEqual(["iap_voided_mark", "voided -", "voided 1", "iap_refunded"]);
    expect([...ledger.values()].map((r) => r.state)).toEqual(["refunded", "purchased", "refunded"]);
    expect(voidedMark).toBe(new Date(deps.now!()).toISOString());
    // read again: nothing new
    expect((await readVoided(env, deps)).refunded).toBe(0);
  });

  it("a voided read that fails keeps its mark (the next run reads the same days)", async () => {
    playDown = 500;
    expect(await readVoided(env, deps)).toEqual({ configured: true, read: 0, refunded: 0, error: "play: 500" });
    expect(voidedMark).toBeNull();
    configured = false;
    expect(await readVoided(env, deps)).toEqual({ configured: false, read: 0, refunded: 0 });
  });

  it("the function's calls: signed-in players only, and nothing checked before the key is set", async () => {
    const post = (body: unknown, auth?: string) =>
      handle(new Request("https://fn.test/iap", { method: "POST", headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(body) }), env, deps);
    play["tok-10"] = { productId: "starter_pack", purchaseState: 0, obfuscatedExternalAccountId: markOf("user-b") };

    let res = await post({ productId: "starter_pack", token: "tok-10" }, "Bearer jwt-b");
    expect([res.status, await res.json()]).toEqual([200, { verdict: "valid" }]);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    // no session, or only the public key
    res = await post({ productId: "starter_pack", token: "tok-10" });
    expect(res.status).toBe(401);
    res = await post({ productId: "starter_pack", token: "tok-10" }, "Bearer anon-key");
    expect(res.status).toBe(401);
    // Google Play down: an error, not a verdict
    playDown = 500;
    res = await post({ productId: "starter_pack", token: "tok-10" }, "Bearer jwt-b");
    expect(res.status).toBe(502);
    playDown = null;
    // the schedule's call
    res = await post({ action: "voided" }, "Bearer anon-key");
    expect(((await res.json()) as { configured: boolean }).configured).toBe(true);
    // the browser's preflight, and the owner's check
    expect((await handle(new Request("https://fn.test/iap", { method: "OPTIONS" }), env, deps)).status).toBe(204);
    expect(await (await handle(new Request("https://fn.test/iap"), env, deps)).json()).toEqual({ configured: true });

    configured = false;
    expect(await (await handle(new Request("https://fn.test/iap"), env, deps)).json()).toEqual({ configured: false });
    res = await post({ productId: "starter_pack", token: "tok-10" }, "Bearer jwt-b");
    expect(res.status).toBe(503);
  });
});

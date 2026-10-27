// The purchases check's work (index.ts runs it: docs/android/iap.md, "Checking purchases on
// the server"). Two calls:
//   - POST {"productId", "token"} with a player's session: asks Google Play about one purchase
//     the phone reports, keeps it for that account (supabase/migrations/0019_purchases.sql) and
//     answers whether the game may give it;
//   - POST {"action": "voided"} (the database's schedule): reads the purchases Google refunded or
//     cancelled, and marks them refunded.
// GET answers whether the check is set up ({"configured": true}).
//
// Plain TypeScript with fetch and Web Crypto only, so the game's tests run it in Node
// (src/lib/iap-server.test.ts) and Supabase runs it in Deno.

/** The game's products (src/game/config/iap.ts; a test keeps them the same). */
export const PRODUCTS = ["starter", "adFree"] as const;
export type IapProduct = (typeof PRODUCTS)[number];

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface Env {
  /** The project's API (SUPABASE_URL in an Edge Function). */
  supabaseUrl: string;
  /** The service key (SUPABASE_SERVICE_ROLE_KEY): it never leaves the server. */
  serviceKey: string;
  /** The app's package name on Google Play. */
  packageName: string;
  /** The game's products by their Google Play product id. */
  products: Record<string, IapProduct>;
}

export interface Deps {
  fetch: Fetch;
  /**
   * An access token for the Google Play Developer API, signed with the owner's service account
   * key (PLAY_SERVICE_ACCOUNT); null: the key isn't set (or isn't a key), so nothing is checked.
   */
  accessToken: () => Promise<string | null>;
  now?: () => number;
}

/**
 * What the game does with a purchase the phone reported:
 *   valid          paid, and this account's: give it (once) and acknowledge it
 *   pending        not paid yet: wait (it comes back once paid)
 *   refunded       refunded or cancelled: don't give it
 *   invalid        Google Play doesn't know it (a forged purchase): don't give it
 *   taken          another game account's already: don't give it
 *   other_account  bought for another game account: don't give it
 */
export type Verdict = "valid" | "pending" | "refunded" | "invalid" | "taken" | "other_account";

const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

/** Google Play's scope for the Developer API. */
export const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

/** Product ids from the secrets, or the ones docs/android/iap.md suggests. */
export function productsFrom(starter: string | undefined, adFree: string | undefined): Record<string, IapProduct> {
  return { [starter?.trim() || "starter_pack"]: "starter", [adFree?.trim() || "ad_free_rewards"]: "adFree" };
}

export async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The account's mark on its purchases (the app sends it as Google's obfuscatedAccountId: lib/native-iap.ts). */
export const accountMark = (user: string) => sha256(`idle-car-empire:${user}`);

/** Google Play's purchase tokens are printable ASCII, without spaces. */
const validToken = (t: unknown): t is string => typeof t === "string" && /^[\x21-\x7e]{1,4096}$/.test(t);

async function rpc<T>(env: Env, f: Fetch, name: string, body: Record<string, unknown>): Promise<T> {
  const res = await f(`${env.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return (await res.json()) as T;
}

/** The signed-in player calling (their session's user id), or null (no session, or only the public key). */
export async function userOf(env: Env, f: Fetch, authorization: string | null): Promise<string | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const res = await f(`${env.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, { headers: { apikey: env.serviceKey, Authorization: authorization } }).catch(() => null);
  if (!res?.ok) return null;
  const u = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return typeof u?.id === "string" && u.id ? u.id : null;
}

/** Google Play's answer about a one-time purchase (the fields the check reads). */
interface ProductPurchase {
  /** 0 purchased, 1 cancelled, 2 pending */
  purchaseState?: number;
  orderId?: string;
  obfuscatedExternalAccountId?: string;
  purchaseTimeMillis?: string;
  /** 0: a license tester's purchase (free); 1 promo code; 2 rewarded; absent: a real payment */
  purchaseType?: number;
}

/** One purchase, for one account: Google Play's answer, kept in the ledger. Throws when it can't tell (try again later). */
export async function verifyPurchase(env: Env, deps: Deps, user: string, productId: unknown, token: unknown): Promise<Verdict> {
  const product = typeof productId === "string" ? env.products[productId] : undefined;
  if (!product || !validToken(token)) return "invalid";
  const access = await deps.accessToken();
  if (!access) throw new Error("not configured");
  const url = `${API}/${encodeURIComponent(env.packageName)}/purchases/products/${encodeURIComponent(productId as string)}/tokens/${encodeURIComponent(token)}`;
  const res = await deps.fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  // Google Play doesn't know this purchase (for this app and product)
  if (res.status === 400 || res.status === 404 || res.status === 410) return "invalid";
  // anything else (the key's rights, Google's own errors) says nothing about the purchase
  if (!res.ok) throw new Error(`play: ${res.status}`);
  const p = (await res.json()) as ProductPurchase;
  const hash = await sha256(token);
  if (p.purchaseState === 1) {
    await rpc<number>(env, deps.fetch, "iap_refunded", { p_token_hashes: [hash] });
    return "refunded";
  }
  if (p.purchaseState !== 0 && p.purchaseState !== 2) return "invalid";
  // a purchase made for another account (a promo code redeemed in the Play Store has none: it is this player's)
  if (p.obfuscatedExternalAccountId && p.obfuscatedExternalAccountId !== (await accountMark(user))) return "other_account";
  const ms = Number(p.purchaseTimeMillis);
  const kept = await rpc<string>(env, deps.fetch, "iap_record", {
    p_token_hash: hash,
    p_user: user,
    p_product: product,
    p_state: p.purchaseState === 0 ? "purchased" : "pending",
    p_order: typeof p.orderId === "string" ? p.orderId : null,
    p_bought_at: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null,
    p_test: p.purchaseType === 0,
  });
  if (kept === "taken") return "taken";
  if (kept === "refunded") return "refunded";
  if (kept !== "new" && kept !== "known") throw new Error(`iap_record: ${kept}`);
  return p.purchaseState === 0 ? "valid" : "pending";
}

/** Google keeps voided purchases 30 days. */
const VOIDED_DAYS = 30;
/** Each read starts an hour before the last one ended (a purchase voided at the edge is read twice, harmlessly). */
const OVERLAP = 3600_000;
const PAGES = 20;

export interface VoidedReport {
  configured: boolean;
  /** Voided purchases Google listed (this app's one-time products). */
  read: number;
  /** Purchases in the ledger marked refunded now. */
  refunded: number;
  error?: string;
}

/** Reads Google's voided purchases since the last read, and marks them refunded. */
export async function readVoided(env: Env, deps: Deps): Promise<VoidedReport> {
  const report: VoidedReport = { configured: false, read: 0, refunded: 0 };
  const access = await deps.accessToken();
  if (!access) return report;
  report.configured = true;
  const now = deps.now?.() ?? Date.now();
  const mark = await rpc<string | null>(env, deps.fetch, "iap_voided_mark", {});
  const from = Math.max(now - VOIDED_DAYS * 86400_000 + 60_000, mark ? Date.parse(mark) - OVERLAP : 0);
  const hashes: string[] = [];
  let page: string | undefined;
  for (let i = 0; i < PAGES; i++) {
    const q = new URLSearchParams({ startTime: String(Math.floor(from)), endTime: String(now), maxResults: "1000", type: "0" });
    if (page) q.set("token", page);
    const res = await deps.fetch(`${API}/${encodeURIComponent(env.packageName)}/purchases/voidedpurchases?${q}`, { headers: { Authorization: `Bearer ${access}` } });
    if (!res.ok) {
      // nothing is marked: the next run reads the same days again
      report.error = `play: ${res.status}`;
      return report;
    }
    const body = (await res.json()) as { voidedPurchases?: { purchaseToken?: string }[]; tokenPagination?: { nextPageToken?: string } };
    for (const v of body.voidedPurchases ?? []) {
      report.read++;
      if (validToken(v.purchaseToken)) hashes.push(await sha256(v.purchaseToken));
    }
    page = body.tokenPagination?.nextPageToken;
    if (!page) break;
  }
  // the mark moves on only once every page was read
  report.refunded = await rpc<number>(env, deps.fetch, "iap_refunded", { p_token_hashes: hashes, p_mark: page ? null : new Date(now).toISOString() });
  return report;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** One call to the function. */
export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return json({ configured: !!(await deps.accessToken().catch(() => null)) });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = (await req.json().catch(() => null)) as { action?: unknown; productId?: unknown; token?: unknown } | null;
  try {
    if (body?.action === "voided") return json(await readVoided(env, deps));
    const user = await userOf(env, deps.fetch, req.headers.get("Authorization"));
    if (!user) return json({ error: "not signed in" }, 401);
    if (!(await deps.accessToken())) return json({ error: "not configured" }, 503);
    return json({ verdict: await verifyPurchase(env, deps, user, body?.productId, body?.token) });
  } catch (e) {
    // the phone tries again later (Google Play refunds only after three days)
    return json({ error: e instanceof Error ? e.message : "failed" }, 502);
  }
}

// The "iap" Edge Function: checks the game's in-app purchases with Google Play (lib.ts,
// docs/android/iap.md). Until the owner sets the PLAY_SERVICE_ACCOUNT secret it checks nothing:
// GET answers {"configured": false} and a player's check answers 503.
import { parseServiceAccount, signedAssertion } from "../push/lib.ts";
import { handle, PLAY_SCOPE, productsFrom } from "./lib.ts";

const env = {
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  packageName: Deno.env.get("PLAY_PACKAGE_NAME")?.trim() || "com.zazochannel.idlecarempire",
  products: productsFrom(Deno.env.get("IAP_STARTER_ID"), Deno.env.get("IAP_ADFREE_ID")),
};

// an access token lasts an hour: kept while this instance lives, renewed 5 minutes before
let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string | null> {
  const sa = parseServiceAccount(Deno.env.get("PLAY_SERVICE_ACCOUNT"));
  if (!sa) return null;
  const now = Date.now();
  if (cached && cached.until > now) return cached.token;
  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${await signedAssertion(sa, now, PLAY_SCOPE)}`,
  });
  if (!res.ok) throw new Error(`access token: ${res.status}`);
  const { access_token, expires_in } = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!access_token) throw new Error("access token: none");
  cached = { token: access_token, until: now + Math.max(60, (expires_in ?? 3600) - 300) * 1000 };
  return access_token;
}

Deno.serve((req) => handle(req, env, { fetch, accessToken }));

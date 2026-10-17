// The cloud on Supabase (schema and rules in supabase/migrations): accounts
// through Supabase Auth, a profile per player, and the save written only
// through the save_game() function, which checks revisions on the server.
// Row Level Security keeps every row to its owner; this file holds only the
// project's public (publishable) key.
import type { AuthError as SbAuthError, SupabaseClient, User } from "@supabase/supabase-js";
import type { GameState } from "../types";
import { Social } from "./social";
import type { Account, AuthError, AuthResult, CloudBackend, CloudCopy, Profile } from "./types";

function account(u: User | null | undefined): Account | null {
  if (!u) return null;
  return { id: u.id, email: u.email || null, guest: !!u.is_anonymous, pendingEmail: u.new_email || null };
}

/** Supabase's error, in the few kinds the game tells apart. */
export function authError(e: Pick<SbAuthError, "message"> & { code?: string; status?: number; name?: string }): AuthError {
  const code = e.code ?? "";
  const msg = e.message?.toLowerCase() ?? "";
  if (code === "email_exists" || code === "user_already_exists" || msg.includes("already")) return "taken";
  if (code === "weak_password" || msg.includes("password should")) return "weak";
  if (code === "invalid_credentials" || msg.includes("invalid login")) return "credentials";
  if (code === "email_not_confirmed" || msg.includes("not confirmed")) return "unconfirmed";
  if (code.startsWith("over_") || e.status === 429 || msg.includes("rate limit")) return "rate";
  if (code === "validation_failed" || code === "email_address_invalid" || msg.includes("invalid")) return "invalid";
  if (e.name === "AuthRetryableFetchError" || msg.includes("fetch") || msg.includes("network")) return "network";
  return "unknown";
}

const fail = (e: Parameters<typeof authError>[0]): AuthResult => ({ ok: false, error: authError(e), detail: e.message });

/** The account of a session as supabase-js keeps it in storage ({ refresh_token, user, … }), read without the network. */
export function storedAccount(raw: string | null): Account | null {
  try {
    const s = raw ? (JSON.parse(raw) as { refresh_token?: string; user?: User } | null) : null;
    return s?.refresh_token ? account(s.user) : null;
  } catch {
    return null;
  }
}

const ms = (t: unknown) => (typeof t === "string" ? Date.parse(t) || 0 : 0);

export class SupabaseBackend implements CloudBackend {
  private client: Promise<SupabaseClient>;
  /** Where supabase-js keeps the session on this device (its default key for this project). */
  private storageKey: string;

  constructor(url: string, key: string) {
    this.storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
    this.client = import("@supabase/supabase-js").then(({ createClient }) =>
      // sessions stay on this device and refresh themselves; email links come back with tokens in the URL
      createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }),
    );
  }

  private async uid(): Promise<string> {
    const c = await this.client;
    const { data } = await c.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error("not signed in");
    return id;
  }

  async session(): Promise<Account | null> {
    const c = await this.client;
    const { data, error } = await c.auth.getSession();
    if (data.session) return account(data.session.user);
    // With no connection and an access token past its hour, supabase-js can't refresh it and
    // answers "no session", but keeps the session and refreshes it once the connection is back.
    // The player is still signed in: their own game (saved here, uploaded later), not the
    // welcome page and a new company.
    if (error?.name === "AuthRetryableFetchError") {
      try {
        return storedAccount(window.localStorage.getItem(this.storageKey));
      } catch {
        return null;
      }
    }
    return null;
  }

  async signInGuest(): Promise<Account> {
    const c = await this.client;
    const { data, error } = await c.auth.signInAnonymously();
    if (error || !data.user) throw error ?? new Error("no guest account");
    return account(data.user)!;
  }

  async register(email: string, password: string, redirectTo: string): Promise<AuthResult> {
    const c = await this.client;
    // the guest's account gets an email: same id, same save
    const { data, error } = await c.auth.updateUser({ email }, { emailRedirectTo: redirectTo });
    if (error) return fail(error);
    // the project confirms emails by link: the password comes after the confirmation
    if ((data.user?.email ?? "").toLowerCase() !== email.toLowerCase()) return { ok: true, pending: true };
    const pw = await c.auth.updateUser({ password });
    return pw.error ? fail(pw.error) : { ok: true };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const c = await this.client;
    const { error } = await c.auth.signInWithPassword({ email, password });
    return error ? fail(error) : { ok: true };
  }

  async setPassword(password: string): Promise<AuthResult> {
    const c = await this.client;
    const { error } = await c.auth.updateUser({ password });
    return error ? fail(error) : { ok: true };
  }

  async logout(): Promise<void> {
    const c = await this.client;
    // this device only: the player stays signed in elsewhere
    await c.auth.signOut({ scope: "local" });
  }

  async deleteAccount(): Promise<AuthResult> {
    const c = await this.client;
    // the server deletes the account; its save, profile, leaderboard entry, gifts and alliance
    // seat go with it (migration 0007)
    const { error } = await c.rpc("delete_my_account");
    if (error) return { ok: false, error: /fetch|network/i.test(error.message) ? "network" : "unknown", detail: error.message };
    await c.auth.signOut({ scope: "local" }).catch(() => {});
    return { ok: true };
  }

  async refreshAccount(): Promise<Account | null> {
    const c = await this.client;
    const { data, error } = await c.auth.getUser();
    if (error) throw error;
    return account(data.user);
  }

  async profile(): Promise<Profile | null> {
    const c = await this.client;
    const id = await this.uid();
    const { data, error } = await c.from("profiles").select("id, username, avatar, listed").eq("id", id).maybeSingle();
    if (error) throw error;
    if (data) return data as Profile;
    // a rare name clash at sign-up left the player without one: the server makes it
    const made = await c.rpc("ensure_profile");
    if (made.error) throw made.error;
    const row = (made.data as Profile[] | null)?.[0];
    return row ? { id: row.id, username: row.username, avatar: row.avatar, listed: row.listed } : null;
  }

  async updateProfile(p: { username?: string; avatar?: string; listed?: boolean }): Promise<AuthResult> {
    const c = await this.client;
    const id = await this.uid();
    const { error } = await c.from("profiles").update(p).eq("id", id);
    if (!error) return { ok: true };
    if (error.code === "23505") return { ok: false, error: "taken", detail: error.message };
    if (error.code === "23514" || error.code === "22001") return { ok: false, error: "invalid", detail: error.message };
    return { ok: false, error: "unknown", detail: error.message };
  }

  /** The leaderboard, visits and gifts, on this player's session. */
  social(): Social {
    return new Social(async (fn, args) => {
      const c = await this.client;
      const { data, error } = await c.rpc(fn, args);
      if (error) throw error;
      return data;
    });
  }

  async load(): Promise<CloudCopy> {
    const c = await this.client;
    const { data, error } = await c.rpc("load_game");
    if (error) throw error;
    const row = (data as { data: unknown; save_version: number | null; revision: number | string; updated_at: string | null; server_now: string }[] | null)?.[0];
    return {
      state: row?.data ?? null,
      version: row?.save_version ?? 0,
      revision: Number(row?.revision ?? 0),
      updatedAt: ms(row?.updated_at),
      serverNow: ms(row?.server_now),
    };
  }

  async save(state: GameState, version: number, baseRevision: number, device: string) {
    const c = await this.client;
    const { data, error } = await c.rpc("save_game", { p_data: state, p_save_version: version, p_base_revision: baseRevision, p_device: device });
    if (error) throw error;
    const row = (data as { ok: boolean; revision: number | string; updated_at: string | null }[] | null)?.[0];
    if (!row) throw new Error("no answer from save_game");
    return { ok: !!row.ok, revision: Number(row.revision), updatedAt: ms(row.updated_at) };
  }
}

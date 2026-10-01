import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaveAdapter, SavePayload } from "./types";

/**
 * Cloud saves in a Supabase table (see supabase/migrations). Players are
 * signed in anonymously, so progress follows the browser session and can later
 * be linked to a real account. Row Level Security keeps each row private.
 */
export class SupabaseAdapter implements SaveAdapter {
  readonly name = "supabase";
  private client: Promise<SupabaseClient>;

  constructor(url: string, anonKey: string) {
    this.client = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }),
    );
  }

  private async userId(): Promise<{ client: SupabaseClient; id: string } | null> {
    const client = await this.client;
    const { data } = await client.auth.getSession();
    if (data.session?.user) return { client, id: data.session.user.id };
    const { data: signed, error } = await client.auth.signInAnonymously();
    if (error || !signed.user) return null;
    return { client, id: signed.user.id };
  }

  async load(): Promise<SavePayload | null> {
    const who = await this.userId();
    if (!who) return null;
    const { data, error } = await who.client
      .from("game_saves")
      .select("data, saved_at")
      .eq("user_id", who.id)
      .maybeSingle();
    if (error || !data) return null;
    return { state: data.data, savedAt: new Date(data.saved_at).getTime() };
  }

  async save(payload: SavePayload): Promise<void> {
    const who = await this.userId();
    if (!who) return;
    await who.client.from("game_saves").upsert({
      user_id: who.id,
      data: payload.state,
      saved_at: new Date(payload.savedAt).toISOString(),
    });
  }

  async clear(): Promise<void> {
    const who = await this.userId();
    if (!who) return;
    await who.client.from("game_saves").delete().eq("user_id", who.id);
  }
}

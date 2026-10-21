// The "push" Edge Function: sends the game's waiting notifications (lib.ts, docs/push.md).
// Called every few minutes by the database's schedule (pg_cron); calling it more often only
// sends sooner what is already queued. Until the owner sets the FCM_SERVICE_ACCOUNT secret it
// sends nothing and reports how many notes wait.
import { runPush } from "./lib.ts";

Deno.serve(async () => {
  try {
    const report = await runPush({
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      serviceAccount: Deno.env.get("FCM_SERVICE_ACCOUNT"),
    });
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
});

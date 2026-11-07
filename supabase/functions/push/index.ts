// The "push" Edge Function: sends the game's waiting notifications (lib.ts, docs/push.md).
// Called every few minutes by the database's schedule (pg_cron); calling it more often only
// sends sooner what is already queued. Until the owner sets the FCM_SERVICE_ACCOUNT secret it
// sends nothing and reports how many notes wait. Once the CRON_SECRET secret is set, only the
// schedule's calls (with that secret in the x-cron-secret header) run it.
import { runPush, scheduleAllowed } from "./lib.ts";

Deno.serve(async (req) => {
  if (!scheduleAllowed(req, Deno.env.get("CRON_SECRET"))) {
    return Response.json({ error: "not allowed" }, { status: 401 });
  }
  try {
    const report = await runPush({
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      serviceAccount: Deno.env.get("FCM_SERVICE_ACCOUNT"),
    });
    return Response.json(report);
  } catch (e) {
    // the details stay in the function's logs, not in a public answer
    console.error("push failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
});

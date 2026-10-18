// End-to-end check of the cloud save against the real Supabase project, with
// only the public (publishable) key, exactly as the game's browser code
// talks to it: two players A and B (anonymous accounts), saving, restoring,
// revision conflicts, session restore, what each may (not) reach, the
// leaderboard, visits and gifts, ghosts and alliances, and a third player C
// registering (email and password, as playing needs an account) and deleting
// their account.
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… node scripts/cloud-e2e.mjs
//
// It leaves no save behind (each test player deletes its own); the anonymous
// accounts of A and B stay, named "e2e-…" (see docs/cloud-save.md to clear them).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.log("cloud-e2e: no Supabase env, skipped");
  process.exit(0);
}

let failed = 0;
const check = (ok, what, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

/** A browser: its own storage, so its session survives a "reload". */
function browser(storage = new Map()) {
  const store = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) };
  return { storage, client: createClient(url, key, { auth: { storage: store, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } }) };
}

const tag = `e2e-${Date.now().toString(36)}`;
const one = (res) => (Array.isArray(res.data) ? res.data[0] : res.data);

// ── player A ──
const a = browser();
const signA = await a.client.auth.signInAnonymously();
check(!signA.error && !!signA.data.user, "A signs in as a guest", signA.error?.message);
const idA = signA.data.user?.id;

const profA = await a.client.from("profiles").select("id, username, avatar").eq("id", idA).maybeSingle();
check(!profA.error && profA.data?.id === idA, "A has a profile made by the server", profA.error?.message ?? profA.data?.username);
const rename = await a.client.from("profiles").update({ username: `${tag}-A` }).eq("id", idA).select("username");
check(!rename.error && rename.data?.[0]?.username === `${tag}-A`, "A renames themselves", rename.error?.message);
const badName = await a.client.from("profiles").update({ username: "x" }).eq("id", idA);
check(!!badName.error, "a too-short name is refused", badName.error?.code);

const empty = one(await a.client.rpc("load_game"));
check(empty && Number(empty.revision) === 0 && empty.data === null && !!empty.server_now, "A starts with no save");

const s1 = one(await a.client.rpc("save_game", { p_data: { cash: 100, createdAt: 1 }, p_save_version: 3, p_base_revision: 0, p_device: "e2e" }));
check(s1?.ok === true && Number(s1.revision) === 1, "A's first save", JSON.stringify(s1));
const s2 = one(await a.client.rpc("save_game", { p_data: { cash: 250, createdAt: 1 }, p_save_version: 3, p_base_revision: 1, p_device: "e2e" }));
check(s2?.ok === true && Number(s2.revision) === 2, "A's next save builds on revision 1", JSON.stringify(s2));
const stale = one(await a.client.rpc("save_game", { p_data: { cash: 999, createdAt: 1 }, p_save_version: 3, p_base_revision: 1, p_device: "other" }));
check(stale?.ok === false && Number(stale.revision) === 2, "a stale save (another device) is refused, not overwritten", JSON.stringify(stale));
const older = one(await a.client.rpc("save_game", { p_data: { cash: 1 }, p_save_version: 2, p_base_revision: 2, p_device: "old" }));
check(older?.ok === false, "an older game version can't overwrite a newer save");
const junk = await a.client.rpc("save_game", { p_data: [1, 2], p_save_version: 3, p_base_revision: 2, p_device: "e2e" });
check(!!junk.error, "a save that isn't a game object is refused", junk.error?.message);

const loadA = one(await a.client.rpc("load_game"));
check(loadA?.data?.cash === 250 && Number(loadA.revision) === 2, "A restores the latest save", JSON.stringify(loadA?.data));
check(Date.parse(loadA.server_now) >= Date.parse(loadA.updated_at), "the save carries server time");

// "reload": a new client on the same storage keeps the session
const reload = browser(a.storage);
const restored = await reload.client.auth.getSession();
check(restored.data.session?.user.id === idA, "the session survives a reload");
const loadAgain = one(await reload.client.rpc("load_game"));
check(loadAgain?.data?.cash === 250, "and the save comes back with it");

// a write that skips save_game: refused once 0003 is applied; before that it still gets a new
// revision and server time from the trigger, so other sessions see a conflict instead of losing it
const before = Number(one(await a.client.rpc("load_game"))?.revision);
const direct = await a.client.from("game_saves").update({ data: { cash: 250, createdAt: 1 } }).eq("user_id", idA).select("user_id");
const after = Number(one(await a.client.rpc("load_game"))?.revision);
const refused = !!direct.error || (direct.data ?? []).length === 0;
check(refused || after === before + 1, refused ? "direct table writes are refused" : "a direct table write still bumps the revision", direct.error?.code ?? `${before} -> ${after}`);

// ── player B ──
const b = browser();
const signB = await b.client.auth.signInAnonymously();
check(!signB.error && signB.data.user && signB.data.user.id !== idA, "B is a different player", signB.error?.message);
const idB = signB.data.user?.id;
await b.client.from("profiles").update({ username: `${tag}-B` }).eq("id", idB);

const emptyB = one(await b.client.rpc("load_game"));
check(emptyB && Number(emptyB.revision) === 0, "B starts with an empty game, not A's");
const peek = await b.client.from("game_saves").select("data").eq("user_id", idA);
check(!peek.error && (peek.data ?? []).length === 0, "B can't read A's save");
const peekProfile = await b.client.from("profiles").select("username").eq("id", idA);
check(!peekProfile.error && (peekProfile.data ?? []).length === 0, "B can't read A's profile");
const renameA = await b.client.from("profiles").update({ username: "hacked" }).eq("id", idA).select("id");
check((renameA.data ?? []).length === 0, "B can't rename A");
const takeName = await b.client.from("profiles").update({ username: `${tag}-a` }).eq("id", idB);
check(!!takeName.error, "B can't take A's name (any case)", takeName.error?.code);
const overwrite = await b.client.from("game_saves").update({ data: { cash: 0 } }).eq("user_id", idA).select("user_id");
check((overwrite.data ?? []).length === 0, "B can't overwrite A's save");
const insertForA = await b.client.from("game_saves").insert({ user_id: idA, data: { cash: 0 } });
check(!!insertForA.error, "B can't create a save for A", insertForA.error?.code);
const sB = one(await b.client.rpc("save_game", { p_data: { cash: 7 }, p_save_version: 3, p_base_revision: 0, p_device: "e2e" }));
check(sB?.ok === true, "B saves their own game");
check(one(await a.client.rpc("load_game"))?.data?.cash === 250, "A's save is untouched by B");

// ── the leaderboard, visits and gifts (0004) ──
// A saves a bigger game: the card on the board takes it, but a jump this big is held to what is plausible
const revA = Number(one(await a.client.rpc("load_game"))?.revision);
const bigA = { cash: 250, createdAt: 1, brand: { name: `${tag} Motors` }, lifetime: { moneyEarned: 4e6, carsProduced: 50 }, city: { zones: ["town"], buildings: { p1: { type: "bodyWorks", level: 2, plant: { secret: 1 } }, g1: { type: "garage", level: 1 } } } };
const sBig = one(await a.client.rpc("save_game", { p_data: bigA, p_save_version: 3, p_base_revision: revA, p_device: "e2e" }));
check(sBig?.ok === true, "A saves a bigger game");
const boardB = await b.client.rpc("leaderboard", { p_kind: "all" });
const rowA = (boardB.data ?? []).find((r) => r.user_id === idA);
const rowB = (boardB.data ?? []).find((r) => r.user_id === idB);
check(!boardB.error && rowB?.me === true && (boardB.data ?? []).filter((r) => r.me).length === 1, "B sees the board, with their own row marked", boardB.error?.message);
check(!!rowA || (boardB.data ?? []).length > 50, "A is on B's board", JSON.stringify(rowA));
if (rowA) check(rowA.me === false && rowA.company === `${tag} Motors` && Number(rowA.value) >= 1e6 && Number(rowA.value) < 2e6, "A's total is held to the plausible limit (no save data on the board)", JSON.stringify(rowA));
const weekB = await b.client.rpc("leaderboard", { p_kind: "week" });
check(!weekB.error && (weekB.data ?? []).some((r) => r.me), "the weekly board", weekB.error?.message);
const visit = one(await b.client.rpc("visit_empire", { p_user: idA }));
check(visit?.user_id === idA && visit.card?.plants?.length === 1 && visit.card.plants[0].level === 2 && !JSON.stringify(visit).includes("secret") && !("data" in visit), "B visits A: the public card only", JSON.stringify(visit));
const cardsTable = await b.client.from("empires").select("user_id");
check(!!cardsTable.error || (cardsTable.data ?? []).length === 0, "the cards table itself is closed", cardsTable.error?.code);

const g1 = await b.client.rpc("send_gift", { p_to: idA });
check(g1.data === "sent", "B sends A a gift", g1.error?.message ?? g1.data);
const g2 = await b.client.rpc("send_gift", { p_to: idA });
check(g2.data === "already", "only one gift a day to the same player", g2.data);
const gSelf = await b.client.rpc("send_gift", { p_to: idB });
check(gSelf.data === "self", "no gifts to oneself", gSelf.data);
check((await b.client.rpc("gifts_sent_today")).data === 1, "B's gifts today are counted");
const giftsTable = await b.client.from("gifts").insert({ from_user: idB, to_user: idA, day: "2000-01-01" });
check(!!giftsTable.error, "the gifts table can't be written directly", giftsTable.error?.code);
check((await a.client.rpc("claim_gifts")).data === 1, "A collects the gift");
check((await a.client.rpc("claim_gifts")).data === 0, "a gift is collected once");

// ── ghosts (0005): A's best race car, raced by visitors ──
const ghostA = { model: "sports", color: "#ff0000", accent: "#000000", stats: { speed: 60, accel: 55, handling: 50, braking: 45, aero: 40, reliability: 70, hp: 300, weight: 1300 } };
check((await a.client.rpc("publish_ghost", { p_ghost: ghostA })).data === true, "A publishes a ghost");
const seenGhost = one(await b.client.rpc("visit_empire", { p_user: idA }))?.card?.ghost;
check(seenGhost?.model === "sports" && seenGhost.stats?.speed === 60 && seenGhost.color === "#ff0000", "B sees A's ghost on the card", JSON.stringify(seenGhost));
const badGhost = await a.client.rpc("publish_ghost", { p_ghost: { model: "<x>" } });
check(!!badGhost.error, "an invalid ghost is refused", badGhost.error?.code);

// ── alliances (0005): founded, joined, rewards gated, left (and so closed again) ──
// (only when the test players can leave again: an alliance left behind would show to real players)
const canLeave = await a.client.rpc("leave_alliance");
check(canLeave.data === "none", "leaving works (0005 fully applied)", canLeave.error?.message ?? canLeave.data);
if (canLeave.data === "none") {
  const allianceTag = `E${Date.now().toString(36).slice(-3).toUpperCase()}`;
  const founded = await a.client.rpc("create_alliance", { p_name: tag, p_tag: allianceTag, p_emblem: "🏁" });
  check(founded.data === "ok", "A founds an alliance", founded.error?.message ?? founded.data);
  const found = ((await b.client.rpc("list_alliances", { p_search: tag })).data ?? [])[0];
  check(found?.tag === allianceTag && found.members === 1, "B finds it by name", JSON.stringify(found));
  check(found && (await b.client.rpc("join_alliance", { p_id: found.id })).data === "ok", "B joins");
  const mineB = (await b.client.rpc("my_alliance")).data;
  check(mineB?.members?.length === 2 && mineB.leader === false && mineB.tiers?.length === 3, "B sees the alliance, its members and goal", JSON.stringify(mineB)?.slice(0, 160));
  check((await b.client.rpc("claim_alliance_tier", { p_tier: 1 })).data === "new", "a new member can't take rewards yet");
  const membersTable = await b.client.from("alliance_members").select("user_id");
  check(!!membersTable.error || (membersTable.data ?? []).length === 0, "the alliance tables are closed", membersTable.error?.code);
  check((await b.client.rpc("kick_member", { p_user: idA })).data === "leader", "only the leader removes members");
  check((await a.client.rpc("kick_member", { p_user: idB })).data === "ok", "the leader removes B");
  check((await b.client.rpc("my_alliance")).data === null, "B is out");
  check((await a.client.rpc("leave_alliance")).data === "ok", "A leaves");
  check(((await b.client.rpc("list_alliances", { p_search: tag })).data ?? []).length === 0, "an empty alliance is closed");
}

// A leaves the board: hidden from B, not visitable, no gifts; A still sees their own rank
const listB = await b.client.from("profiles").update({ listed: false }).eq("id", idA).select("id");
check((listB.data ?? []).length === 0, "B can't hide A");
const unlist = await a.client.from("profiles").update({ listed: false }).eq("id", idA).select("listed");
check(!unlist.error && unlist.data?.[0]?.listed === false, "A leaves the board", unlist.error?.message);
check(!((await b.client.rpc("leaderboard", { p_kind: "all" })).data ?? []).some((r) => r.user_id === idA), "A is gone from B's board");
check(((await b.client.rpc("visit_empire", { p_user: idA })).data ?? []).length === 0, "A can't be visited");
check((await b.client.rpc("send_gift", { p_to: idA })).data === "unknown", "A can't be sent gifts");
check(((await a.client.rpc("leaderboard", { p_kind: "all" })).data ?? []).some((r) => r.me && r.user_id === idA), "A still sees their own rank");

// ── signed out ──
const anon = browser();
const anonLoad = await anon.client.rpc("load_game");
check(!!anonLoad.error, "signed out: no access to saves", anonLoad.error?.code);
const anonRead = await anon.client.from("game_saves").select("user_id");
check(!!anonRead.error || (anonRead.data ?? []).length === 0, "signed out: the table shows nothing", anonRead.error?.code);
const anonBoard = await anon.client.rpc("leaderboard", { p_kind: "all" });
check(!!anonBoard.error, "signed out: no leaderboard", anonBoard.error?.code);

// ── the anonymous funnel (0006): reached the way the game does, with the public key alone ──
// ('ping' and an unknown step write nothing, so the live table stays clean)
const track = async (step) => {
  const r = await fetch(`${url}/rest/v1/rpc/track_step`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ p_step: step, p_minutes: 1 }) });
  return [r.status, await r.json().catch(() => null)];
};
const [pingStatus, ping] = await track("ping");
check(pingStatus === 200 && ping === "ok", "the funnel answers with the public key alone", `${pingStatus} ${JSON.stringify(ping)}`);
const [, unknownStep] = await track(`${tag}-nonsense`);
check(unknownStep === "unknown", "an unknown funnel step is turned away", JSON.stringify(unknownStep));
const funnelRead = await anon.client.from("funnel_steps").select("id");
check(!!funnelRead.error, "the funnel's table is out of the API's reach", funnelRead.error?.code);

// ── registration: playing needs an account, so an email and a password must work at once for any
// address (Supabase's "Confirm email" off, or an SMTP sender for everyone). A third test player
// registers the way the game does: a guest that gets an email, then a password ──
const c = browser();
const signC = await c.client.auth.signInAnonymously();
const idC = signC.data.user?.id;
// (the game's own contact address, tagged: a real mail domain, unique per run, freed when C is deleted)
const emailC = `idlecarempire+${tag}-c@gmail.com`;
const passwordC = `${tag}-${Math.random().toString(36).slice(2)}-Pw`;
const regC = await c.client.auth.updateUser({ email: emailC });
check(!regC.error && regC.data.user?.email === emailC, "a guest registers an email, with no confirmation to wait for", regC.error?.message ?? (regC.data.user?.new_email ? "the email waits for a confirmation link" : ""));
const pwC = await c.client.auth.updateUser({ password: passwordC });
check(!pwC.error && pwC.data.user?.is_anonymous === false, "then a password: a full account (no longer a guest), same id", pwC.error?.message ?? `anonymous: ${pwC.data.user?.is_anonymous}`);
const c2 = browser();
const loginC = await c2.client.auth.signInWithPassword({ email: emailC, password: passwordC });
check(loginC.data.user?.id === idC, "it signs in with that email and password on another device", loginC.error?.message);
await c2.client.auth.signOut({ scope: "local" });

// ── account deletion (0007): the third test player deletes their account, and everything with it ──
await c.client.from("profiles").update({ username: `${tag}-C` }).eq("id", idC);
one(await c.client.rpc("save_game", { p_data: { cash: 5, createdAt: 3 }, p_save_version: 3, p_base_revision: 0, p_device: "e2e" }));
const giftC = await c.client.rpc("send_gift", { p_to: idB });
check(((await a.client.rpc("leaderboard", { p_kind: "all" })).data ?? []).some((r) => r.user_id === idC) && giftC.data === "sent", "C saves, is on the board and sends B a gift");
const delC = await c.client.rpc("delete_my_account");
check(delC.data === "ok", "a player deletes their account (0007 applied)", delC.error?.message ?? delC.data);
if (delC.data === "ok") {
  check(!((await a.client.rpc("leaderboard", { p_kind: "all" })).data ?? []).some((r) => r.user_id === idC), "the deleted player is off the board");
  check(((await a.client.rpc("visit_empire", { p_user: idC })).data ?? []).length === 0, "and can't be visited");
  check((await b.client.rpc("claim_gifts")).data === 0, "their gift went with them");
  const gone = one(await c.client.rpc("load_game"));
  check(gone?.data == null, "their save is gone (even with the old token)", JSON.stringify(gone?.data));
  check(!!(await c.client.auth.refreshSession()).error, "their session can't be renewed");
} else {
  // 0007 not applied yet: clean up C like the others
  await c.client.from("game_saves").delete().not("user_id", "is", null);
  await c.client.auth.signOut();
}

// ── clean up: each test player deletes its own save (and so its card) ──
for (const p of [a, b]) {
  const del = await p.client.from("game_saves").delete().not("user_id", "is", null);
  if (del.error) console.log("cleanup:", del.error.message);
}
check(!((await a.client.rpc("leaderboard", { p_kind: "all" })).data ?? []).some((r) => r.me), "a deleted save takes its card off the board");
await a.client.auth.signOut();
await b.client.auth.signOut();

console.log(failed ? `\n${failed} check(s) failed` : "\nall cloud checks passed");
process.exit(failed ? 1 : 0);

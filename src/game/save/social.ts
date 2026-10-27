// The players' world on Supabase (supabase/migrations/0004, 0005): the
// global leaderboard, visits to other empires, daily gifts, ghosts to race
// and alliances. Everything goes through the server's functions: another
// player's save is never read, only the public card the server builds from it.
import { parseGhost, type Ghost } from "../engine/ghost";
import { parseTeamCommands, TEAM_KINDS, type TeamCommand } from "../engine/team";
import { parseVisitMap, type VisitMap } from "../engine/visit";

export type BoardKind = "all" | "week";

export interface BoardRow {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  company: string;
  /** Money earned: in total ("all"), or since Monday UTC ("week"). */
  value: number;
  me: boolean;
}

export interface EmpireCard {
  userId: string;
  username: string;
  avatar: string;
  company: string;
  earned: number;
  cars: number;
  stars: number;
  plants: { type: string; level: number }[];
  zones: number;
  rep: number;
  races: number;
  wins: number;
  resets: number;
  updatedAt: number;
  /** Their best race car, to race one against one (null: none published). */
  ghost: Ghost | null;
  /** What stands where on their island, to look round it in 3D (null: their card is older). */
  map: VisitMap | null;
}

export type GiftResult = "sent" | "already" | "limit" | "full" | "self" | "unknown";

export interface AllianceSummary {
  id: string;
  name: string;
  tag: string;
  emblem: string;
  members: number;
  /** This week's points (see MyAlliance). */
  points: number;
  mine: boolean;
}

export interface AllianceMember {
  userId: string;
  username: string;
  avatar: string;
  /** Growth this week in % of the week's start (0–100). */
  points: number;
  leader: boolean;
  me: boolean;
}

export interface MyAlliance {
  id: string;
  name: string;
  tag: string;
  emblem: string;
  /** The player leads it. */
  leader: boolean;
  size: number;
  /** The week (Monday, UTC) the goal is for. */
  week: string;
  points: number;
  /** Points for reward tiers 1–3. */
  tiers: number[];
  /** Tiers the player took this week. */
  claimed: number[];
  /** From when the player may take rewards (a day after joining), on the server's clock … */
  claimFrom: number;
  /** … whose time it was when this was read. */
  serverNow: number;
  members: AllianceMember[];
}

export type CreateAllianceResult = "ok" | "member" | "invalid" | "blocked" | "name" | "tag";
export type JoinAllianceResult = "ok" | "member" | "full" | "unknown";
export type ClaimTierResult = "ok" | "none" | "new" | "short" | "claimed" | "invalid";

/** Why a player is reported (supabase/migrations/0008: report_player). */
/** The player's invite code and friends (0012). */
export interface MyInvite {
  code: string;
  /** Friends who used the code. */
  friends: number;
  /** Rewards waiting: friends who built their first car (within the limit). */
  due: number;
  /** Rewards taken so far, and the most there can be. */
  rewarded: number;
  max: number;
  /** This account used a friend's code; it can still (a new account, none used yet). */
  used: boolean;
  canUse: boolean;
}

export type RedeemInviteResult = "ok" | "already" | "late" | "self" | "full" | "unknown";

/** A row of a week's cup board (supabase/migrations/0013). */
export interface CupRow {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  car: string;
  color: string;
  /** The week's best time, in seconds. */
  best: number;
  me: boolean;
  /** Players on the board that week. */
  entrants: number;
}

/** "ok": the board has it; "closed": the week is over; "invalid": an impossible time; "limit": enough sent today. */
export type CupSubmitResult = "ok" | "closed" | "invalid" | "limit";

/** A finished week's place, handed out once. */
export interface CupPlace {
  week: number;
  rank: number;
  entrants: number;
  /** Seconds. */
  best: number;
}

export type ReportReason = "name" | "company" | "cheating" | "other";
export const REPORT_REASONS: ReportReason[] = ["name", "company", "cheating", "other"];
export type ReportResult = "ok" | "limit" | "unknown";

/** Gifts a player may send each day (supabase: gifts_per_day()). */
export const GIFTS_PER_DAY = 5;

type Call = (fn: string, args?: Record<string, unknown>) => Promise<unknown>;

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export class Social {
  constructor(private call: Call) {}

  async leaderboard(kind: BoardKind): Promise<BoardRow[]> {
    const rows = (await this.call("leaderboard", { p_kind: kind })) as unknown[] | null;
    return (rows ?? []).map(obj).map((r) => ({
      rank: num(r.rank),
      userId: str(r.user_id),
      username: str(r.username),
      avatar: str(r.avatar),
      company: str(r.company),
      value: num(r.value),
      me: r.me === true,
    }));
  }

  /** A listed player's public card (null: not listed, or no game saved yet). */
  async visit(userId: string): Promise<EmpireCard | null> {
    const rows = (await this.call("visit_empire", { p_user: userId })) as unknown[] | null;
    const r = obj(rows?.[0]);
    if (!r.user_id) return null;
    const card = obj(r.card);
    return {
      userId: str(r.user_id),
      username: str(r.username),
      avatar: str(r.avatar),
      company: str(r.company),
      earned: num(r.earned),
      cars: num(r.cars),
      stars: num(r.stars),
      plants: (Array.isArray(card.plants) ? card.plants : []).map(obj).map((p) => ({ type: str(p.type), level: Math.max(1, num(p.level)) })),
      zones: num(card.zones),
      rep: num(card.rep),
      races: num(card.races),
      wins: num(card.wins),
      resets: num(card.resets),
      updatedAt: Date.parse(str(r.updated_at)) || 0,
      ghost: parseGhost(card.ghost),
      map: parseVisitMap(card.map),
    };
  }

  /** Publishes the player's ghost (null withdraws it); false while they have no card yet. */
  async publishGhost(ghost: Ghost | null): Promise<boolean> {
    return (await this.call("publish_ghost", { p_ghost: ghost })) === true;
  }

  // ───────────────────────── alliances ─────────────────────────

  async listAlliances(search = ""): Promise<AllianceSummary[]> {
    const rows = (await this.call("list_alliances", { p_search: search })) as unknown[] | null;
    return (rows ?? []).map(obj).map((r) => ({ id: str(r.id), name: str(r.name), tag: str(r.tag), emblem: str(r.emblem), members: num(r.members), points: num(r.points), mine: r.mine === true }));
  }

  /** The player's alliance (null: in none). */
  async myAlliance(): Promise<MyAlliance | null> {
    const raw = await this.call("my_alliance");
    if (!raw || typeof raw !== "object") return null;
    const r = obj(raw);
    const list = (v: unknown) => (Array.isArray(v) ? v : []);
    return {
      id: str(r.id),
      name: str(r.name),
      tag: str(r.tag),
      emblem: str(r.emblem),
      leader: r.leader === true,
      size: num(r.size),
      week: str(r.week),
      points: num(r.points),
      tiers: list(r.tiers).map(num),
      claimed: list(r.claimed).map(num),
      claimFrom: Date.parse(str(r.claimFrom)) || 0,
      serverNow: Date.parse(str(r.serverNow)) || 0,
      members: list(r.members)
        .map(obj)
        .map((m) => ({ userId: str(m.userId), username: str(m.username), avatar: str(m.avatar), points: num(m.points), leader: m.leader === true, me: m.me === true })),
    };
  }

  async createAlliance(name: string, tag: string, emblem: string): Promise<CreateAllianceResult> {
    const r = str(await this.call("create_alliance", { p_name: name, p_tag: tag, p_emblem: emblem }));
    return r === "ok" || r === "member" || r === "blocked" || r === "name" || r === "tag" ? r : "invalid";
  }

  async joinAlliance(id: string): Promise<JoinAllianceResult> {
    const r = str(await this.call("join_alliance", { p_id: id }));
    return r === "ok" || r === "member" || r === "full" ? r : "unknown";
  }

  async leaveAlliance(): Promise<boolean> {
    return str(await this.call("leave_alliance")) === "ok";
  }

  /** The leader removes a member. */
  async kickMember(userId: string): Promise<boolean> {
    return str(await this.call("kick_member", { p_user: userId })) === "ok";
  }

  async claimAllianceTier(tier: number): Promise<ClaimTierResult> {
    const r = str(await this.call("claim_alliance_tier", { p_tier: tier }));
    return r === "ok" || r === "none" || r === "new" || r === "short" || r === "claimed" ? r : "invalid";
  }

  // ───────────────────────── reports (0008) ─────────────────────────

  /** Reports a player to the developer (a report made again the same day counts once). */
  async reportPlayer(userId: string, reason: ReportReason): Promise<ReportResult> {
    const r = str(await this.call("report_player", { p_user: userId, p_reason: reason }));
    return r === "ok" || r === "limit" ? r : "unknown";
  }

  /** Reports an alliance's name or tag to the developer. */
  async reportAlliance(id: string): Promise<ReportResult> {
    const r = str(await this.call("report_alliance", { p_alliance: id }));
    return r === "ok" || r === "limit" ? r : "unknown";
  }

  async sendGift(userId: string): Promise<GiftResult> {
    const r = str(await this.call("send_gift", { p_to: userId }));
    return r === "sent" || r === "already" || r === "limit" || r === "full" || r === "self" ? r : "unknown";
  }

  /** Collects the gifts waiting for the player: how many there were (each counted once). */
  async claimGifts(): Promise<number> {
    return Math.max(0, Math.floor(num(await this.call("claim_gifts"))));
  }

  async giftsSentToday(): Promise<number> {
    return Math.max(0, Math.floor(num(await this.call("gifts_sent_today"))));
  }

  // ───────────────────────── from the game's team (0020) ─────────────────────────

  /** The commands the team sent this player, of the kinds this game knows: handed out once (engine/team.ts). */
  async claimCommands(): Promise<TeamCommand[]> {
    return parseTeamCommands(await this.call("claim_my_commands", { p_kinds: [...TEAM_KINDS] }));
  }

  // ───────────────────────── invite codes (0012) ─────────────────────────

  async myInvite(): Promise<MyInvite> {
    const r = obj(await this.call("my_invite"));
    return { code: str(r.code), friends: num(r.friends), due: num(r.due), rewarded: num(r.rewarded), max: num(r.max), used: r.used === true, canUse: r.canUse === true };
  }

  /** Uses a friend's code (once per account, in its first days). */
  async redeemInvite(code: string): Promise<RedeemInviteResult> {
    const r = str(await this.call("redeem_invite", { p_code: code }));
    return r === "ok" || r === "already" || r === "late" || r === "self" || r === "full" ? r : "unknown";
  }

  /** Takes the rewards due for friends' first cars: how many (each counted once). */
  async claimInviteRewards(): Promise<number> {
    return Math.max(0, Math.floor(num(await this.call("claim_invite_rewards"))));
  }

  /** This phone's notification token for the player, with the game's language and the phone's offset from UTC (minutes). */
  async registerPush(token: string, platform: "android" | "ios", lang: string, tz: number): Promise<boolean> {
    return str(await this.call("register_push_token", { p_token: token, p_platform: platform, p_lang: lang, p_tz: Math.round(tz) })) === "ok";
  }

  /** Forgets this phone's token (notifications off, signing out). */
  async forgetPush(token: string): Promise<void> {
    await this.call("forget_push_token", { p_token: token });
  }

  /** Sends the week's best timed run (milliseconds) to the cup board. */
  async cupSubmit(week: number, ms: number, car: string, color: string): Promise<CupSubmitResult> {
    const r = str(await this.call("cup_submit", { p_week: week, p_ms: ms, p_car: car, p_color: color }));
    return r === "ok" || r === "closed" || r === "limit" ? r : "invalid";
  }

  /** A week's cup board: the best 50 (listed players) and the player's own row. */
  async cupBoard(week: number): Promise<CupRow[]> {
    const rows = (await this.call("cup_board", { p_week: week })) as unknown[] | null;
    return (rows ?? []).map(obj).map((r) => ({
      rank: num(r.rank),
      userId: str(r.user_id),
      username: str(r.username),
      avatar: str(r.avatar),
      car: str(r.car),
      color: str(r.color),
      best: num(r.best_ms) / 1000,
      me: r.me === true,
      entrants: num(r.entrants),
    }));
  }

  /** The player's places in finished weeks not paid yet (the server hands each out once). */
  async claimCupPrizes(): Promise<CupPlace[]> {
    const rows = (await this.call("claim_cup_prizes")) as unknown[] | null;
    return (rows ?? []).map(obj).map((r) => ({ week: num(r.week), rank: Math.max(1, num(r.rank)), entrants: Math.max(1, num(r.entrants)), best: num(r.best_ms) / 1000 }));
  }
}

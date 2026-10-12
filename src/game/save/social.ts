// The players' world on Supabase (supabase/migrations/0004): the global
// leaderboard, visits to other empires and daily gifts. Everything goes
// through the server's functions: another player's save is never read, only
// the public card the server builds from it.

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
}

export type GiftResult = "sent" | "already" | "limit" | "full" | "self" | "unknown";

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
    };
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
}

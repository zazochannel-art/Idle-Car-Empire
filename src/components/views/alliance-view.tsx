"use client";

import { Crown, LogOut, RefreshCw, Search, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ALLIANCE_EMBLEMS, ALLIANCE_REWARDS } from "@/game/engine/alliance";
import { isCleanName } from "@/game/engine/names";
import { rewardCash } from "@/game/engine/progress";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import type { AllianceSummary, MyAlliance } from "@/game/save";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { FlagAlliance, FlagMember } from "../game/player-safety";
import { ViewHeader } from "./section-title";

/** The player's alliance (weekly goal, members), or alliances to join and the form to found one. */
export function AllianceView() {
  const saves = useGame((g) => g.saves);
  const setView = useUi((u) => u.setView);
  const { t } = useT();
  const social = saves?.social ?? null;
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{ key: number; data: MyAlliance | null | "error" }>({ key: -1, data: null });

  useEffect(() => {
    if (!social) return;
    let live = true;
    social.myAlliance().then(
      (data) => live && setAnswer({ key: attempt, data }),
      () => live && setAnswer({ key: attempt, data: "error" }),
    );
    return () => {
      live = false;
    };
  }, [social, attempt]);
  const reload = () => setAttempt((n) => n + 1);
  const data = answer.key === attempt ? answer.data : undefined;

  const header = <ViewHeader icon="🤝" title={t("nav.alliance")} subtitle={t("alliance.subtitle")} />;
  if (!social) {
    return (
      <div className="space-y-4">
        {header}
        <div className="space-y-3 rounded-2xl bg-[#2b2b2e] p-4 text-center ring-1 ring-white/10">
          <p className="text-sm text-white/70">{t("board.offline")}</p>
          <Button variant="secondary" size="sm" onClick={() => setView("profile")}>
            👤 {t("account.title")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {header}
      {data === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
      ) : data === "error" ? (
        <div className="space-y-3 rounded-2xl bg-[#2b2b2e] p-4 text-center ring-1 ring-white/10">
          <p className="text-sm text-rose-300">{t("board.error")}</p>
          <Button variant="secondary" size="sm" onClick={reload}>
            <RefreshCw /> {t("board.retry")}
          </Button>
        </div>
      ) : data ? (
        <AllianceHome a={data} onChange={reload} />
      ) : (
        <AllianceFinder onJoined={reload} />
      )}
    </div>
  );
}

function AllianceHome({ a, onChange }: { a: MyAlliance; onChange: () => void }) {
  const saves = useGame((g) => g.saves);
  const snap = useGame((g) => g.view.snap);
  const { t } = useT();
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const top = a.tiers[a.tiers.length - 1] || 1;
  const waitMs = Math.max(0, a.claimFrom - a.serverNow);

  const claim = async (tier: number) => {
    setBusy(true);
    setMsg(null);
    const r = await useGame.getState().claimAllianceTier(tier);
    setBusy(false);
    if (r === "ok" || r === "claimed") return onChange();
    setMsg({ text: t(r === "new" ? "alliance.err.new" : r === "short" ? "alliance.err.short" : r === "none" ? "alliance.err.none" : "board.error"), bad: true });
  };
  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    setMsg(null);
    const ok = await fn().catch(() => false);
    setBusy(false);
    if (ok) onChange();
    else setMsg({ text: t("board.error"), bad: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gold/15 text-3xl ring-1 ring-gold/40">{a.emblem}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black">
            {a.name} <span className="text-gold">[{a.tag}]</span>
          </div>
          <div className="text-[11px] text-white/55">{t("alliance.members", { n: a.members.length, max: a.size })}</div>
        </div>
      </div>

      {/* the week's goal */}
      <div className="space-y-2.5 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">🎯 {t("alliance.goal")}</span>
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-black tabular-nums text-gold">
              {formatNumber(a.points)} / {formatNumber(top)}
            </span>
            <button aria-label={t("alliance.refresh")} className="rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white" onClick={onChange}>
              <RefreshCw className="size-3.5" />
            </button>
          </span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-gold transition-all" style={{ width: `${Math.min(100, (a.points / top) * 100)}%` }} />
          {a.tiers.slice(0, -1).map((need) => (
            <span key={need} className="absolute top-0 h-full w-0.5 bg-black/40" style={{ left: `${(need / top) * 100}%` }} />
          ))}
        </div>
        <p className="text-[11px] leading-snug text-white/50">{t("alliance.goalHint")}</p>
        {waitMs > 0 && <p className="text-[11px] text-amber-300">{t("alliance.wait", { time: formatDuration(waitMs / 1000) })}</p>}
        <div className="space-y-1.5">
          {a.tiers.map((need, i) => {
            const tier = i + 1;
            const reward = ALLIANCE_REWARDS[i];
            const taken = a.claimed.includes(tier);
            const reached = a.points >= need;
            return (
              <div key={tier} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 ring-1", taken ? "bg-emerald-500/10 ring-emerald-400/25" : reached ? "bg-gold/10 ring-gold/30" : "bg-white/[0.03] ring-white/[0.07]")}>
                <span className="w-14 shrink-0 text-xs font-black text-white/70">{t("alliance.tier", { n: tier })}</span>
                <span className="min-w-0 flex-1 text-[11px] leading-tight">
                  <span className="block font-semibold tabular-nums">{t("alliance.need", { n: formatNumber(need) })}</span>
                  <span className="block text-gold">
                    +{formatMoney(rewardCash(reward, snap))}
                    {reward.stars ? ` · ⭐ ${reward.stars}` : ""}
                  </span>
                </span>
                {taken ? (
                  <span className="text-xs font-black text-emerald-300">✓</span>
                ) : (
                  <Button size="sm" variant={reached && !waitMs ? "gold" : "locked"} disabled={!reached || waitMs > 0 || busy} onClick={() => void claim(tier)}>
                    {t("alliance.claim")}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {msg && <p className={cn("text-center text-xs", msg.bad ? "text-rose-300" : "text-sky-300")}>{msg.text}</p>}
      </div>

      {/* members */}
      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("alliance.membersTitle")}</div>
        {a.members.map((m) => (
          <div key={m.userId} className={cn("flex items-center gap-2.5 rounded-2xl px-3 py-2 ring-1", m.me ? "bg-gold/[0.1] ring-gold/40" : "bg-white/[0.04] ring-white/[0.07]")}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-xl">{m.avatar || "👤"}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 truncate text-sm font-black">
                {m.username || "—"}
                {m.leader && <Crown className="size-3.5 shrink-0 text-gold" />}
              </span>
              <span className="block text-[11px] text-white/50">{t("alliance.memberPoints", { n: formatNumber(m.points) })}</span>
            </span>
            {!m.me && <FlagMember userId={m.userId} name={m.username} />}
            {a.leader &&
              !m.me &&
              (kicking === m.userId ? (
                <Button size="sm" className="bg-none bg-rose-600 shadow-none" disabled={busy} onClick={() => void act(() => saves!.social!.kickMember(m.userId))}>
                  {t("alliance.kickConfirm")}
                </Button>
              ) : (
                <button aria-label={t("alliance.kick")} className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-rose-300" onClick={() => setKicking(m.userId)}>
                  <UserMinus className="size-4" />
                </button>
              ))}
          </div>
        ))}
      </div>

      {leaving ? (
        <div className="space-y-2 rounded-2xl bg-rose-500/10 p-3 ring-1 ring-rose-400/25">
          <p className="text-xs text-rose-200">{t(a.leader && a.members.length > 1 ? "alliance.leaveLeader" : a.members.length === 1 ? "alliance.leaveLast" : "alliance.leaveConfirm")}</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setLeaving(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" className="bg-none bg-rose-600 shadow-none" disabled={busy} onClick={() => void act(() => saves!.social!.leaveAlliance())}>
              <LogOut /> {t("alliance.leave")}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="w-full" onClick={() => setLeaving(true)}>
          <LogOut /> {t("alliance.leave")}
        </Button>
      )}
    </div>
  );
}

function AllianceFinder({ onJoined }: { onJoined: () => void }) {
  const saves = useGame((g) => g.saves);
  const { t } = useT();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [list, setList] = useState<{ q: string; rows: AllianceSummary[] | null } | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  // searching a moment after the typing stops
  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    const social = saves?.social;
    if (!social) return;
    let live = true;
    social.listAlliances(query).then(
      (rows) => live && setList({ q: query, rows }),
      () => live && setList({ q: query, rows: null }),
    );
    return () => {
      live = false;
    };
  }, [saves, query]);
  const rows = list?.q === query ? list.rows : undefined;

  const join = async (id: string) => {
    setBusy(true);
    setMsg(null);
    const r = await saves!.social!.joinAlliance(id).catch(() => "error" as const);
    setBusy(false);
    if (r === "ok" || r === "member") return onJoined();
    setMsg({ text: t(r === "full" ? "alliance.err.full" : r === "unknown" ? "alliance.err.gone" : "board.error"), bad: true });
  };

  return (
    <div className="space-y-4">
      <p className="px-1 text-xs leading-snug text-white/60">{t("alliance.intro")}</p>
      <CreateForm onCreated={onJoined} />

      <div className="space-y-2">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("alliance.find")}</div>
        <label className="flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 ring-1 ring-white/10">
          <Search className="size-4 text-white/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} maxLength={24} placeholder={t("alliance.search")} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/30" />
        </label>
        {msg && <p className={cn("text-center text-xs", msg.bad ? "text-rose-300" : "text-sky-300")}>{msg.text}</p>}
        {rows === undefined ? (
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
        ) : rows === null ? (
          <p className="text-center text-xs text-rose-300">{t("board.error")}</p>
        ) : !rows.length ? (
          <p className="rounded-2xl bg-[#2b2b2e] p-4 text-center text-sm text-white/60 ring-1 ring-white/10">{t("alliance.none")}</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/[0.07]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-xl">{r.emblem}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">
                  {r.name} <span className="text-gold">[{r.tag}]</span>
                </span>
                <span className="block text-[11px] text-white/50">
                  {t("alliance.members", { n: r.members, max: 20 })} · {t("alliance.pointsShort", { n: formatNumber(r.points) })}
                </span>
              </span>
              {!r.mine && <FlagAlliance id={r.id} name={`${r.name} [${r.tag}]`} />}
              <Button size="sm" variant={r.members >= 20 ? "locked" : "gold"} disabled={r.members >= 20 || busy} onClick={() => void join(r.id)}>
                {t("alliance.join")}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const saves = useGame((g) => g.saves);
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [emblem, setEmblem] = useState(ALLIANCE_EMBLEMS[0]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 3 && name.trim().length <= 24 && /^[A-Z0-9]{2,4}$/.test(tag);
  if (!open) {
    return (
      <Button variant="gold" className="w-full" onClick={() => setOpen(true)}>
        🤝 {t("alliance.found")}
      </Button>
    );
  }
  const create = async () => {
    // the server checks too; this answers at once
    if (!isCleanName(name) || !isCleanName(tag)) return setMsg(t("alliance.err.blocked"));
    setBusy(true);
    setMsg(null);
    const r = await saves!.social!.createAlliance(name.trim(), tag, emblem).catch(() => "error" as const);
    setBusy(false);
    if (r === "ok" || r === "member") return onCreated();
    setMsg(t(`alliance.err.${r === "error" ? "network" : r}` as MessageKey));
  };
  return (
    <div className="space-y-2.5 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
      <div className="text-sm font-bold">🤝 {t("alliance.found")}</div>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-white/60">{t("alliance.name")}</span>
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} className="h-10 w-full rounded-xl bg-white/[0.06] px-3 text-sm outline-none ring-1 ring-white/10 focus:ring-gold/60" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-white/60">{t("alliance.tag")}</span>
        <input
          value={tag}
          maxLength={4}
          onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          className="h-10 w-28 rounded-xl bg-white/[0.06] px-3 text-sm font-black uppercase tracking-widest outline-none ring-1 ring-white/10 focus:ring-gold/60"
        />
      </label>
      <div>
        <div className="mb-1 text-[11px] font-semibold text-white/60">{t("alliance.emblem")}</div>
        <div className="grid grid-cols-6 gap-1">
          {ALLIANCE_EMBLEMS.map((e) => (
            <button
              key={e}
              onClick={() => setEmblem(e)}
              className={cn("flex aspect-square items-center justify-center rounded-xl text-xl ring-1 transition", e === emblem ? "bg-gold/25 ring-gold" : "bg-white/[0.04] ring-white/[0.07] hover:bg-white/[0.08]")}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" variant="gold" disabled={!valid || busy} onClick={() => void create()}>
          {t("alliance.create")}
        </Button>
      </div>
      {msg && <p className="text-center text-xs text-rose-300">{msg}</p>}
    </div>
  );
}

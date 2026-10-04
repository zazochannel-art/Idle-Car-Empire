"use client";

// Prototype lab, export markets, the truck & bus division and star engineers.
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CARS, CAR_BY_ID } from "@/game/config/cars";
import { ENGINEER, ENGINEER_BY_ID, EXPORT, EXPORT_MARKETS, FLEET, FLEET_PRODUCTS, PAY, PROTO, PROTO_FOCUSES, type PayLevel, type ProtoFocus } from "@/game/config/expansion";
import { carBaseValue } from "@/game/engine/chain";
import { unlockedCarIds } from "@/game/engine/economy";
import { fleetParts, fleetPlants, fleetRate, fleetUnit, focusFits, portPlot, protoReady, salaries, signingFee } from "@/game/engine/expansion";
import { formatDuration, formatMoney, formatNumber, formatPercent } from "@/game/format";
import type { CarId } from "@/game/types";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";

const Box = ({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]", className)}>
    <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{title}</div>
    {sub && <p className="mb-2 text-[11px] text-white/50">{sub}</p>}
    {children}
  </div>
);

const Choice = ({ on, onClick, title, sub, disabled }: { on?: boolean; onClick: () => void; title: string; sub?: string; disabled?: boolean }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className={cn("rounded-xl p-2 text-left text-xs ring-1 disabled:opacity-40", on ? "bg-electric/20 ring-electric/50" : "bg-white/[0.03] ring-white/10 hover:bg-white/[0.07]")}
  >
    <div className="font-bold">{title}</div>
    {sub && <div className="text-[10px] tabular-nums text-white/50">{sub}</div>}
  </button>
);

// ───────────────────────────── prototype lab ─────────────────────────────

/** 🧪 Concept → wind tunnel → track test → launch campaign. */
export function PrototypeLab() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { startPrototype, windTunnel, trackTest, launchProto } = useGame.getState();
  const { t, lang } = useT();
  const n = useContent(lang);
  const [car, setCar] = useState<CarId | null>(null);
  const now = state.lastActiveAt;
  const a = state.proto.active;
  const unlocked = unlockedCarIds(state, snap.gm);
  const cars = CARS.filter((c) => unlocked.has(c.id));
  const base = (id: CarId) => carBaseValue(state, CAR_BY_ID[id], snap.gm);

  if (a) {
    const cfg = CAR_BY_ID[a.car];
    const ready = protoReady(state, now);
    const b = base(a.car);
    const steps: { id: string; label: string }[] = [
      { id: "concept", label: t("proto.stage.concept") },
      { id: "tunnel", label: t("proto.stage.tunnel") },
      { id: "track", label: t("proto.stage.track") },
      { id: "launch", label: t("proto.stage.launch") },
    ];
    const idx = ["concept", "tunnel", "track"].indexOf(a.stage) + (ready ? 1 : 0);
    return (
      <Box title={`🧪 ${t("proto.title")}`}>
        <div className="mb-2 text-sm font-bold">
          {cfg.emoji} {state.designs[a.car].name} · {t(`proto.focus.${a.focus}` as MessageKey)}
        </div>
        <div className="mb-2 grid grid-cols-4 gap-1">
          {steps.map((st, i) => (
            <div key={st.id} className={cn("rounded-lg px-1 py-1 text-center text-[10px] font-semibold ring-1", i < idx ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30" : i === idx ? "bg-electric/20 ring-electric/50" : "bg-white/[0.02] text-white/40 ring-white/10")}>
              {st.label}
            </div>
          ))}
        </div>
        <div className="mb-2 text-[11px] text-white/60">{t("proto.score", { n: Math.round(a.score) })}</div>
        {!ready ? (
          <div className="flex items-center gap-2">
            <Progress value={100 - Math.min(100, ((a.until - now) / 60_000 / 12) * 100)} className="h-1.5" />
            <span className="shrink-0 text-[11px] tabular-nums text-white/60">{formatDuration(Math.max(0, (a.until - now) / 1000))}</span>
          </div>
        ) : a.stage === "concept" ? (
          <div className="grid grid-cols-3 gap-1.5">
            {PROTO.tunnel.map((o, i) => (
              <Choice key={i} onClick={() => windTunnel(i)} disabled={state.cash < b * o.cost} title={t(`proto.effort.${i}` as MessageKey)} sub={`${formatMoney(b * o.cost)} · ${o.minutes}m`} />
            ))}
          </div>
        ) : a.stage === "tunnel" ? (
          <Button size="sm" variant="gold" className="w-full" disabled={state.cash < b * PROTO.track.cost} onClick={trackTest}>
            🏁 {t("proto.runTrack", { cost: formatMoney(b * PROTO.track.cost) })}
          </Button>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {PROTO.campaign.map((o, i) => (
              <Choice key={i} onClick={() => launchProto(i)} disabled={state.cash < b * o.cost} title={t(`proto.campaign.${i}` as MessageKey)} sub={`${formatMoney(b * o.cost)} · ${o.hypeMin}m 🔥`} />
            ))}
          </div>
        )}
        {a.stage === "tunnel" && ready && !state.racing.unlocked && <p className="mt-1 text-[10px] text-white/45">{t("proto.trackHint")}</p>}
      </Box>
    );
  }

  const pick = car && unlocked.has(car) && state.proto.done[car] === undefined ? car : null;
  return (
    <Box title={`🧪 ${t("proto.title")}`} sub={t("proto.desc", { pct: formatPercent(PROTO.maxValue) })}>
      <div className="grid grid-cols-2 gap-1.5">
        {cars.map((c) => {
          const done = state.proto.done[c.id];
          return (
            <Choice
              key={c.id}
              on={pick === c.id}
              disabled={done !== undefined}
              onClick={() => setCar(c.id)}
              title={`${c.emoji} ${state.designs[c.id].name}`}
              sub={done !== undefined ? t("proto.launched", { n: Math.round(done) }) : `${n.car(c)} · ${formatMoney(base(c.id) * PROTO.concept.cost)}`}
            />
          );
        })}
      </div>
      {pick && (
        <>
          <div className="mb-1 mt-3 text-[11px] font-semibold text-white/60">{t("proto.chooseFocus")}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PROTO_FOCUSES.map((f: ProtoFocus) => (
              <Choice
                key={f}
                onClick={() => startPrototype(pick, f)}
                disabled={state.cash < base(pick) * PROTO.concept.cost}
                title={t(`proto.focus.${f}` as MessageKey)}
                sub={focusFits(CAR_BY_ID[pick].class, f) ? `★ ${t("proto.fits")}` : t("proto.fitsNot")}
              />
            ))}
          </div>
        </>
      )}
    </Box>
  );
}

// ───────────────────────────── export ─────────────────────────────

/** 🚢 Markets overseas: open them, route an assembly line there, follow the ships. */
export function ExportCard() {
  const state = useGame((g) => g.state);
  const openMarket = useGame((g) => g.openMarket);
  const { t, lang } = useT();
  const n = useContent(lang);
  const port = portPlot(state);
  const E = state.export;
  return (
    <Box title={`🚢 ${t("export.title")}`} sub={port ? t("export.desc", { cars: EXPORT.shipCars }) : t("export.noPort")}>
      <div className="space-y-1.5">
        {EXPORT_MARKETS.map((m) => {
          const open = E.open.includes(m.id);
          const dock = E.dock[m.id]?.cars.length ?? 0;
          const atSea = E.ships.filter((s) => s.market === m.id);
          return (
            <div key={m.id} className={cn("rounded-xl p-2 ring-1", open ? "bg-sky-500/[0.07] ring-sky-400/25" : "bg-white/[0.02] ring-white/[0.06]")}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{m.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold">{t(`export.market.${m.id}` as MessageKey)}</div>
                  <div className="text-[10px] text-white/50">
                    {t("export.wants")}: {m.wants.map((c) => n.car(CAR_BY_ID[c])).join(", ")} · {t("export.duty", { pct: formatPercent(m.duty) })} · ⛴️ {formatDuration(m.voyage)}
                  </div>
                </div>
                {!open && (
                  <Button size="sm" variant={port && state.cash >= m.cost ? "gold" : "secondary"} disabled={!port || state.cash < m.cost} onClick={() => openMarket(m.id)}>
                    {formatMoney(m.cost)}
                  </Button>
                )}
              </div>
              {open && (
                <div className="mt-1.5 space-y-1 text-[10px] text-white/60">
                  <div>
                    🅿️ {t("export.dock", { n: dock, cap: EXPORT.shipCars })} · {t("export.wanted", { pct: formatPercent(EXPORT.wanted) })}
                  </div>
                  {atSea.map((sh) => (
                    <div key={sh.id} className="flex items-center gap-2">
                      <span>⛴️ {sh.cars.length}</span>
                      <Progress value={(sh.t / sh.dur) * 100} className="h-1" indicatorClassName="from-sky-400 to-cyan-300" />
                      <span className="shrink-0 tabular-nums">{formatDuration(Math.max(0, sh.dur - sh.t))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {E.open.length > 0 && <p className="mt-2 text-[10px] text-white/45">{t("export.routeHint", { sold: formatNumber(E.sold) })}</p>}
    </Box>
  );
}

// ───────────────────────────── truck & bus division ─────────────────────────────

/** 🚌 What the division builds, what it earns, and the fleet order. */
export function FleetPanel() {
  const state = useGame((g) => g.state);
  const snap = useGame((g) => g.snap);
  const { setFleetProduct, acceptFleetOrder, declineFleetOrder, finishFleetOrder } = useGame.getState();
  const { t } = useT();
  const F = state.fleet;
  const now = state.lastActiveAt;
  if (!fleetPlants(state).length) return <Box title={`🚌 ${t("fleet.title")}`} sub={t("fleet.noPlant")}>{null}</Box>;
  const rate = fleetRate(state, snap.gm.speed);
  const o = F.order;
  return (
    <Box title={`🚌 ${t("fleet.title")}`} sub={t("fleet.desc")}>
      <div className="grid grid-cols-3 gap-1.5">
        {FLEET_PRODUCTS.map((p) => {
          const u = fleetUnit(p.id);
          return (
            <Choice
              key={p.id}
              on={F.product === p.id}
              onClick={() => setFleetProduct(p.id)}
              title={`${p.emoji} ${t(`fleet.product.${p.id}` as MessageKey)}`}
              sub={`${formatMoney(u.price - u.cost)} ${t("fleet.profitEach")}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-white/55">
        {t("fleet.parts")}:
        {fleetParts(F.product).map((x) => (
          <span key={x.c} className="rounded bg-white/5 px-1">
            {x.n}× {x.emoji}
          </span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px]">
        <div className="rounded-lg bg-white/[0.04] p-1.5">
          <div className="text-white/45">{t("fleet.rate")}</div>
          <div className="text-xs font-bold tabular-nums">{formatNumber(Math.round(rate * 3600))}/h</div>
        </div>
        <div className="rounded-lg bg-white/[0.04] p-1.5">
          <div className="text-white/45">{t("fleet.built")}</div>
          <div className="text-xs font-bold tabular-nums">{formatNumber(Math.floor(F.built))}</div>
        </div>
        <div className="rounded-lg bg-white/[0.04] p-1.5">
          <div className="text-white/45">{t("fleet.earned")}</div>
          <div className="text-xs font-bold tabular-nums text-gold">{formatMoney(F.earned)}</div>
        </div>
      </div>
      {o ? (
        <div className="mt-2 rounded-xl bg-amber-500/10 p-2 ring-1 ring-amber-400/30">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200">{t(`fleet.client.${o.client}` as MessageKey)}</div>
          <div className="text-xs font-bold">{t("fleet.order", { n: o.n, product: t(`fleet.product.${o.product}` as MessageKey), pct: formatPercent(FLEET.orderBonus) })}</div>
          {o.deadline !== undefined ? (
            <>
              <div className="mt-1 flex items-center gap-2">
                <Progress value={(o.made / o.n) * 100} className="h-1.5" indicatorClassName="from-amber-400 to-yellow-300" />
                <span className="shrink-0 text-[11px] tabular-nums text-white/60">
                  {o.made}/{o.n} · {formatDuration(Math.max(0, (o.deadline - now) / 1000))}
                </span>
              </div>
              {o.made >= o.n && (
                <Button size="sm" variant="gold" className="mt-2 w-full" onClick={finishFleetOrder}>
                  {t("fleet.finish")}
                </Button>
              )}
            </>
          ) : (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="gold" className="flex-1" onClick={acceptFleetOrder}>
                {t("contract.accept")} · {o.minutes}m
              </Button>
              <Button size="sm" variant="secondary" onClick={declineFleetOrder}>
                {t("contract.decline")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-white/45">{t("fleet.noOrder", { time: formatDuration(Math.max(0, (F.nextOrderAt - now) / 1000)) })}</p>
      )}
    </Box>
  );
}

// ───────────────────────────── star engineers ─────────────────────────────

const PAYS: PayLevel[] = ["low", "fair", "generous"];

/** 👩‍🔬 The team of star engineers: hire, set their pay, and keep them. */
export function EngineersCard() {
  const state = useGame((g) => g.state);
  const { hireEngineer, setEngineerPay, letGoEngineer } = useGame.getState();
  const { t } = useT();
  const E = state.engineers;
  const now = state.lastActiveAt;
  const fee = signingFee(state);
  return (
    <Box title={`👩‍🔬 ${t("eng.title", { n: E.hired.length, slots: ENGINEER.slots })}`} sub={t("eng.desc", { salary: formatMoney(salaries(state) * 60) })}>
      <div className="space-y-1.5">
        {E.hired.map((h) => {
          const cfg = ENGINEER_BY_ID[h.id];
          return (
            <div key={h.id} className="rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/[0.07]">
              <div className="flex items-center gap-2">
                <span className="text-xl">{cfg.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold">{cfg.name}</div>
                  <div className="text-[10px] text-emerald-200/80">{t(`eng.perk.${h.id}` as MessageKey)}</div>
                </div>
                <button onClick={() => letGoEngineer(h.id)} className="text-[10px] text-white/40 hover:text-rose-300">
                  {t("eng.letGo")}
                </button>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {PAYS.map((p) => (
                  <button key={p} onClick={() => setEngineerPay(h.id, p)} className={cn("rounded-lg px-1 py-1 text-[10px] ring-1", h.pay === p ? "bg-electric/20 ring-electric/50" : "bg-white/[0.02] ring-white/10")}>
                    {t(`eng.pay.${p}` as MessageKey)}
                    <div className="text-white/45">{t("eng.risk", { pct: formatPercent(PAY[p].poach) })}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {E.candidate && (
          <div className="rounded-xl bg-gradient-to-r from-violet-500/15 to-transparent p-2 ring-1 ring-violet-400/30">
            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-200">{t("eng.candidate", { time: formatDuration(Math.max(0, (E.candidate.until - now) / 1000)) })}</div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{ENGINEER_BY_ID[E.candidate.id].emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold">{ENGINEER_BY_ID[E.candidate.id].name}</div>
                <div className="text-[10px] text-white/60">{t(`eng.perk.${E.candidate.id}` as MessageKey)}</div>
              </div>
              <Button size="sm" variant="gold" disabled={state.cash < fee || E.hired.length >= ENGINEER.slots} onClick={hireEngineer}>
                {formatMoney(fee)}
              </Button>
            </div>
          </div>
        )}
        {!E.candidate && E.hired.length < ENGINEER.slots && (
          <p className="text-[10px] text-white/45">{state.chain.firstCar ? t("eng.noCandidate", { time: formatDuration(Math.max(0, (E.nextCandidate - now) / 1000)) }) : t("vip.afterFirstCar")}</p>
        )}
      </div>
    </Box>
  );
}

/** 🕵️ A rival tries to poach an engineer: match the offer or let them go. */
export function PoachDialog() {
  const poach = useGame((g) => g.state.engineers.poach);
  const cash = useGame((g) => g.state.cash);
  const now = useGame((g) => g.state.lastActiveAt);
  const { counterOffer, letGoEngineer } = useGame.getState();
  const busy = useUi((u) => !!u.celebrate);
  const { t } = useT();
  const show = !!poach && !busy;
  return (
    <AnimatePresence>
      {show && poach && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-[min(92vw,22rem)] rounded-3xl border border-violet-400/40 bg-ink/95 p-5 text-center">
            <div className="text-5xl">{ENGINEER_BY_ID[poach.id].emoji}</div>
            <div className="mt-2 text-lg font-black text-violet-200">{t("eng.poachTitle")}</div>
            <p className="mt-1 text-sm text-white/70">{t("eng.poachBody", { name: ENGINEER_BY_ID[poach.id].name, team: poach.team })}</p>
            <p className="mt-1 text-[11px] text-white/45">{t("eng.poachTime", { time: formatDuration(Math.max(0, (poach.until - now) / 1000)) })}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="gold" disabled={cash < poach.cost} onClick={counterOffer}>
                {t("eng.counter", { cost: formatMoney(poach.cost) })}
              </Button>
              <Button variant="secondary" onClick={() => letGoEngineer(poach.id)}>
                {t("eng.letGo")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

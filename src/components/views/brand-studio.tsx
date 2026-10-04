"use client";

// BRAND STUDIO: the company's identity (name, logo, colours, style) and what
// customers think of it. The attributes are earned in the other systems and
// move car prices at every dealer and in the showroom.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CARS } from "@/game/config/cars";
import { BRAND, BRAND_COLORS, BRAND_LOGOS, BRAND_STYLES, type BrandAttr } from "@/game/config/brand";
import { brandAttrs, brandName, brandPriceMult, brandScore } from "@/game/engine/brand";
import { formatMoney } from "@/game/format";
import type { MessageKey } from "@/i18n";
import { useContent } from "@/i18n/content";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

const ATTRS: { id: BrandAttr; emoji: string }[] = [
  { id: "quality", emoji: "🛡️" },
  { id: "luxury", emoji: "💎" },
  { id: "innovation", emoji: "🔬" },
  { id: "sport", emoji: "🏁" },
];

export function BrandStudio() {
  const state = useGame((g) => g.state);
  const setBrand = useGame((g) => g.setBrand);
  const { t, lang } = useT();
  const n = useContent(lang);
  const b = state.brand;
  const [name, setName] = useState(b.name);
  const attrs = brandAttrs(state);
  const score = brandScore(state);
  const cost = b.renames > 0 ? BRAND.rebrand : 0;
  return (
    <div className="space-y-3">
      {/* the badge */}
      <div className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-white/10" style={{ background: `linear-gradient(135deg, ${b.color}33, transparent)` }}>
        <span className="flex size-14 items-center justify-center rounded-2xl text-3xl ring-2" style={{ background: b.accent, boxShadow: `0 0 0 2px ${b.color}` }}>
          {b.logo}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black" style={{ color: b.color }}>
            {brandName(state)}
          </div>
          <div className="text-[11px] text-white/55">
            {BRAND_STYLES.find((x) => x.id === b.style)?.emoji} {t(`brand.style.${b.style}` as MessageKey)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums text-gold">{score}</div>
          <div className="text-[10px] uppercase text-white/45">{t("brand.score")}</div>
        </div>
      </div>

      {/* what customers think */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("brand.attrs")}</div>
        {ATTRS.map((a) => (
          <div key={a.id} className="mb-2">
            <div className="flex justify-between text-xs">
              <span className="font-bold">
                {a.emoji} {t(`brand.attr.${a.id}` as MessageKey)}
              </span>
              <span className="tabular-nums">{Math.round(attrs[a.id])}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={cn("h-full rounded-full", attrs[a.id] > 50 ? "bg-emerald-400" : "bg-white/40")} style={{ width: `${attrs[a.id]}%` }} />
            </div>
            <div className="mt-0.5 text-[10px] text-white/40">{t(`brand.src.${a.id}` as MessageKey)}</div>
          </div>
        ))}
        <p className="text-[10px] text-white/45">{t("brand.repNote")}</p>
      </div>

      {/* what it adds to prices */}
      <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{t("brand.prices")}</div>
        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
          {CARS.map((c) => {
            const m = brandPriceMult(state, c.id, attrs);
            return (
              <div key={c.id} className="rounded-lg bg-white/[0.04] p-1.5">
                <div>
                  {c.emoji} {n.car(c)}
                </div>
                <div className={cn("text-xs font-bold tabular-nums", m > 1.0005 ? "text-emerald-300" : "text-white/50")}>+{((m - 1) * 100).toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* identity */}
      <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
        <div className="text-[11px] font-bold uppercase tracking-wider text-white/55">{t("brand.identity")}</div>
        <div className="flex gap-2">
          <input
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("brand.namePh")}
            className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm ring-1 ring-white/10 outline-none focus:ring-gold/60"
          />
          <Button size="sm" variant="gold" disabled={!name.trim() || name.trim() === b.name || state.cash < cost} onClick={() => setBrand({ name })}>
            {cost ? t("brand.rebrand", { money: formatMoney(cost) }) : t("brand.save")}
          </Button>
        </div>
        <Picker label={t("brand.logo")}>
          {BRAND_LOGOS.map((l) => (
            <button key={l} onClick={() => setBrand({ logo: l })} className={cn("size-9 rounded-lg text-xl ring-1", l === b.logo ? "bg-gold/25 ring-gold" : "bg-white/[0.05] ring-white/10")}>
              {l}
            </button>
          ))}
        </Picker>
        <Picker label={t("brand.color")}>
          {BRAND_COLORS.map((c) => (
            <Swatch key={c} c={c} on={c === b.color} onClick={() => setBrand({ color: c })} />
          ))}
        </Picker>
        <Picker label={t("brand.accent")}>
          {BRAND_COLORS.map((c) => (
            <Swatch key={c} c={c} on={c === b.accent} onClick={() => setBrand({ accent: c })} />
          ))}
        </Picker>
        <div>
          <div className="mb-1 text-[11px] text-white/55">{t("brand.style")}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {BRAND_STYLES.map((st) => (
              <button
                key={st.id}
                onClick={() => setBrand({ style: st.id })}
                className={cn("rounded-xl p-2 text-left text-xs ring-1", st.id === b.style ? "bg-gold/20 ring-gold" : "bg-white/[0.04] ring-white/10")}
              >
                <div className="font-bold">
                  {st.emoji} {t(`brand.style.${st.id}` as MessageKey)}
                </div>
                <div className="text-[10px] text-white/45">{t("brand.styleDesc", { attr: t(`brand.attr.${st.attr}` as MessageKey) })}</div>
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-white/40">{t("brand.livery")}</p>
      </div>
    </div>
  );
}

function Picker({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-white/55">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

const Swatch = ({ c, on, onClick }: { c: string; on: boolean; onClick: () => void }) => (
  <button onClick={onClick} className={cn("size-7 rounded-full ring-2", on ? "ring-gold" : "ring-white/15")} style={{ background: c }} aria-label={c} />
);

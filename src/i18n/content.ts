"use client";

import { useMemo } from "react";
import type { AchievementConfig } from "@/game/config/achievements";
import type { CarConfig } from "@/game/config/cars";
import type { DealerConfig } from "@/game/config/dealerships";
import type { ManagerBonus, ManagerConfig } from "@/game/config/managers";
import type { MilestoneMission } from "@/game/config/missions";
import type { EmpirePerk } from "@/game/config/prestige";
import type { RegionConfig } from "@/game/config/regions";
import type { ResearchCategoryConfig, ResearchNode } from "@/game/config/research";
import { RESEARCH_BY_ID } from "@/game/config/research";
import type { CarLock, PlantLock } from "@/game/engine/chain";
import type { Requirement } from "@/game/engine/insights";
import { formatMoney, formatNumber } from "@/game/format";
import type { ComponentId, Lang, MissionState } from "@/game/types";
import { MAKER } from "@/game/config/chain";
import { content as c, translate } from ".";

/** Localised names and descriptions for everything defined in config/. */
export function contentFor(lang: Lang) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(lang, key, vars);
  const research = (x: ResearchNode) => c(lang, `research.${x.id}.name`, x.name);
  /** Why something is locked, in words. */
  const requirement = (r: Requirement): string => {
    switch (r.kind) {
      case "research":
        return t("req.research", { name: research(RESEARCH_BY_ID[r.research]) });
      case "plant":
        return t("req.plant", { name: t(`structure.${r.plant}`) });
      case "grade": {
        const item = (Object.keys(MAKER) as ComponentId[]).find((k) => MAKER[k] === r.plant) ?? "body";
        return t("req.grade", { name: t(`structure.${r.plant}`), grade: t(`grade.${item}.${r.grade}` as Parameters<typeof translate>[1]) });
      }
      case "zone":
        return t("req.zone", { name: t(`zone.${r.zone}`) });
      case "firstCar":
        return t("req.firstCar");
      case "made":
        return t("req.made", { n: r.n, item: t(`item.${r.item}`), have: Math.min(r.have, r.n) });
      case "unavailable":
        return t("req.unavailable");
    }
  };
  return {
    requirement,
    plantLock: (l: NonNullable<PlantLock>) => requirement(l),
    carLock: (l: NonNullable<CarLock>) => requirement(l),
    car: (x: CarConfig) => c(lang, `car.${x.id}.name`, x.name),
    carTagline: (x: CarConfig) => c(lang, `car.${x.id}.tagline`, x.tagline),
    role: (x: ManagerConfig) => c(lang, `manager.${x.id}.role`, x.role),
    bonus: (b: ManagerBonus, level: number) => {
      const pct = Math.round(b.pct * Math.max(1, level) * 100);
      if (b.stat === "value" && b.minTier) return t("bonus.valueTier", { pct, tier: b.minTier });
      return t(`bonus.${b.stat}`, { pct });
    },
    dealer: (x: DealerConfig) => c(lang, `dealer.${x.id}.name`, x.name),
    dealerDesc: (x: DealerConfig) => c(lang, `dealer.${x.id}.desc`, x.description),
    research,
    researchDesc: (x: ResearchNode) => c(lang, `research.${x.id}.desc`, x.description),
    researchCategory: (x: ResearchCategoryConfig) => c(lang, `researchCat.${x.id}`, x.name),
    achievement: (x: AchievementConfig) => c(lang, `achievement.${x.id}.name`, x.name),
    achievementDesc: (x: AchievementConfig) => c(lang, `achievement.${x.id}.desc`, x.description),
    milestone: (x: MilestoneMission) => c(lang, `milestone.${x.id}`, x.title),
    perk: (x: EmpirePerk) => c(lang, `perk.${x.points}.name`, x.name),
    perkDesc: (x: EmpirePerk) => c(lang, `perk.${x.points}.desc`, x.description),
    region: (x: RegionConfig) => c(lang, `region.${x.id}.name`, x.name),
    regionFlavor: (x: RegionConfig) => c(lang, `region.${x.id}.flavor`, x.flavor),
    /** Daily missions are stored with an English title; rebuild it per language. */
    daily: (m: MissionState) => {
      const n = m.metric === "moneyEarned" ? formatMoney(m.target) : formatNumber(m.target);
      return t(`daily.${m.metric}` as Parameters<typeof translate>[1], { n });
    },
  };
}

export type Content = ReturnType<typeof contentFor>;

export function useContent(lang: Lang): Content {
  return useMemo(() => contentFor(lang), [lang]);
}

"use client";

import { useMemo } from "react";
import type { AchievementConfig } from "@/game/config/achievements";
import type { CarConfig } from "@/game/config/cars";
import type { DealerConfig } from "@/game/config/dealerships";
import type { FactoryConfig } from "@/game/config/factories";
import type { ManagerBonus, ManagerConfig } from "@/game/config/managers";
import type { MilestoneMission } from "@/game/config/missions";
import type { EmpirePerk } from "@/game/config/prestige";
import type { ResearchCategoryConfig, ResearchNode } from "@/game/config/research";
import type { UpgradeConfig } from "@/game/config/upgrades";
import { FACTORY_BY_ID } from "@/game/config/factories";
import { RESEARCH_BY_ID } from "@/game/config/research";
import type { Requirement } from "@/game/engine/insights";
import { formatMoney, formatNumber } from "@/game/format";
import type { Continent, Lang, MissionState } from "@/game/types";
import { content as c, translate } from ".";

/** Localised names and descriptions for everything defined in config/. */
export function contentFor(lang: Lang) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(lang, key, vars);
  const research = (x: ResearchNode) => c(lang, `research.${x.id}.name`, x.name);
  const factory = (x: FactoryConfig) => c(lang, `factory.${x.id}.name`, x.name);
  return {
    /** Why something is locked, in words. */
    requirement: (r: Requirement) => {
      switch (r.kind) {
        case "research":
          return t("req.research", { name: research(RESEARCH_BY_ID[r.research]) });
        case "buyFactory":
          return t("req.buyFactory", { name: factory(FACTORY_BY_ID[r.factory]) });
        case "technology":
          return t("req.technology", { level: r.level, name: factory(FACTORY_BY_ID[r.factory]) });
        case "zone":
          return t("req.zone", { name: t(`zone.${r.zone}`) });
        case "unavailable":
          return t("req.unavailable");
      }
    },
    car: (x: CarConfig) => c(lang, `car.${x.id}.name`, x.name),
    carTagline: (x: CarConfig) => c(lang, `car.${x.id}.tagline`, x.tagline),
    factory,
    city: (x: FactoryConfig) => c(lang, `city.${x.city}`, x.city),
    continent: (x: Continent) => c(lang, `continent.${x}`, x),
    upgrade: (x: UpgradeConfig) => c(lang, `upgrade.${x.id}.name`, x.name),
    upgradeDesc: (x: UpgradeConfig) => c(lang, `upgrade.${x.id}.desc`, x.description),
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

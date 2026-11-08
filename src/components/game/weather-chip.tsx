"use client";

import { useEffect, useRef, useState } from "react";
import { weatherAt, weatherChangesAt, type WeatherKind } from "@/components/map/weather";
import { seasonAt } from "@/game/engine/season";
import { useT } from "@/i18n/use-t";
import { RainSound } from "@/lib/ambience";
import { useUi } from "@/store/ui-store";

const ICONS: Record<Exclude<WeatherKind, "clear">, string> = { rain: "🌧️", fog: "🌫️", snow: "❄️", petals: "🌸" };

/**
 * The map's weather, named: shown only while there is some (rain, fog, snow, petals), with
 * when it ends on tap/hover. Rain also plays its sound over the map (not on a factory floor).
 */
export function WeatherChip() {
  const { t } = useT();
  const floor = useUi((u) => u.floor);
  const [now, setNow] = useState(() => Date.now());
  const rain = useRef<RainSound | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const season = seasonAt(now);
  const w = weatherAt(now, season);
  const rainLevel = w.kind === "rain" ? w.k : 0;
  useEffect(() => {
    rain.current ??= new RainSound();
    rain.current.set(rainLevel, floor !== null);
  }, [rainLevel, floor]);
  useEffect(() => {
    const r = rain;
    const onVisible = () => r.current?.set(rainLevel, floor !== null);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [rainLevel, floor]);
  useEffect(
    () => () => {
      rain.current?.stop();
      rain.current = null;
    },
    [],
  );
  if (w.kind === "clear" || w.k < 0.05) return null;
  const until = new Date(weatherChangesAt(now, season)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const title = t("weather.until", { kind: t(`weather.${w.kind}`), time: until });
  return (
    <div title={title} aria-label={title} role="img" className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-[#5b5b60]/85 text-lg shadow-[0_3px_0_0_rgba(0,0,0,0.35)] backdrop-blur-md">
      {ICONS[w.kind]}
    </div>
  );
}

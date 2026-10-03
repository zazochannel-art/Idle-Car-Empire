"use client";

import { Lock } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import { useT } from "@/i18n/use-t";
import { cue } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

interface CostButtonProps extends Omit<ButtonProps, "onClick"> {
  cost: number | null;
  onBuy: () => unknown;
  label?: React.ReactNode;
  /** Currency: cash (default) or research points. */
  currency?: "cash" | "rp";
  locked?: boolean;
  maxedLabel?: string;
  showEta?: boolean;
}

/** A buy button that knows whether you can afford it and how long until you can. */
export function CostButton({
  cost,
  onBuy,
  label,
  currency = "cash",
  locked,
  maxedLabel,
  showEta = true,
  className,
  variant,
  size,
  ...rest
}: CostButtonProps) {
  const { t } = useT();
  const balance = useGame((g) => (currency === "cash" ? g.state.cash : g.state.rp));
  const rate = useGame((g) => (currency === "cash" ? g.snap.incomePerSec : g.snap.rpPerSec));

  if (cost === null) {
    return (
      <Button variant="secondary" size={size} disabled className={cn("text-gold", className)} {...rest}>
        {maxedLabel ?? t("common.max")}
      </Button>
    );
  }

  const affordable = !locked && balance >= cost;
  const fmt = currency === "cash" ? formatMoney(cost) : `${formatNumber(cost)} ${t("unit.rp")}`;
  const eta = !affordable && !locked && showEta && rate > 0 ? (cost - balance) / rate : null;

  return (
    <Button
      variant={affordable ? (variant ?? "default") : "locked"}
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        if (!affordable) return cue("error");
        if (onBuy() !== false) cue("buy");
      }}
      aria-disabled={!affordable}
      className={cn("max-w-full flex-col gap-0 whitespace-normal leading-tight", size === "sm" ? "h-auto py-1.5" : "h-auto py-2", className)}
      {...rest}
    >
      {label && <span className="flex items-center justify-center gap-1.5 text-center text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</span>}
      <span className="flex items-center gap-1 tabular-nums">
        {locked && <Lock className="!size-3" />}
        {fmt}
      </span>
      {eta !== null && eta < 86400 * 30 && <span className="text-[10px] font-normal opacity-70">{t("common.in", { time: formatDuration(eta) })}</span>}
    </Button>
  );
}

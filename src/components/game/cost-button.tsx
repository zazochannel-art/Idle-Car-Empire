"use client";

import { Lock } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
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
  maxedLabel = "MAX",
  showEta = true,
  className,
  variant,
  size,
  ...rest
}: CostButtonProps) {
  const balance = useGame((g) => (currency === "cash" ? g.state.cash : g.state.rp));
  const rate = useGame((g) => (currency === "cash" ? g.snap.incomePerSec : g.snap.rpPerSec));

  if (cost === null) {
    return (
      <Button variant="secondary" size={size} disabled className={cn("text-gold", className)} {...rest}>
        {maxedLabel}
      </Button>
    );
  }

  const affordable = !locked && balance >= cost;
  const fmt = currency === "cash" ? formatMoney(cost) : `${formatNumber(cost)} RP`;
  const eta = !affordable && !locked && showEta && rate > 0 ? (cost - balance) / rate : null;

  return (
    <Button
      variant={affordable ? (variant ?? "default") : "locked"}
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        if (affordable) onBuy();
      }}
      aria-disabled={!affordable}
      className={cn("flex-col gap-0 leading-tight", size === "sm" ? "h-auto py-1.5" : "h-auto py-2", className)}
      {...rest}
    >
      {label && <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</span>}
      <span className="flex items-center gap-1 tabular-nums">
        {locked && <Lock className="!size-3" />}
        {fmt}
      </span>
      {eta !== null && eta < 86400 * 30 && <span className="text-[10px] font-normal opacity-70">in {formatDuration(eta)}</span>}
    </Button>
  );
}

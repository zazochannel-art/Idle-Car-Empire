import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", {
  variants: {
    variant: {
      default: "bg-electric/15 text-sky-300 ring-1 ring-electric/30",
      gold: "bg-gold/15 text-gold ring-1 ring-gold/30",
      muted: "bg-white/[0.06] text-white/60 ring-1 ring-white/10",
      success: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
      danger: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

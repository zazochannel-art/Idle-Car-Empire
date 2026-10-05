import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// solid pills like the rarity labels of the garage cards
const badgeVariants = cva("race-type inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] leading-tight tabular-nums", {
  variants: {
    variant: {
      default: "bg-electric text-white",
      gold: "bg-gold text-[#2a1d00]",
      muted: "bg-[#4b4b50] text-white/75",
      success: "bg-go text-white",
      danger: "bg-stop text-white",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

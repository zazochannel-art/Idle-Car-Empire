"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value: number;
  indicatorClassName?: string;
  /** Animate width changes (off for bars that reset every cycle). */
  smooth?: boolean;
}

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, indicatorClassName, smooth = true, ...props }, ref) => {
    const pct = Math.max(0, Math.min(100, value));
    return (
      <ProgressPrimitive.Root
        ref={ref}
        value={pct}
        className={cn("relative h-2 w-full overflow-hidden rounded-[4px] bg-[#1c1c1f] ring-1 ring-black/40", className)}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            "h-full rounded-[3px] bg-gradient-to-r from-go to-go",
            smooth && "transition-[width] duration-100 ease-linear",
            indicatorClassName,
          )}
          style={{ width: `${pct}%` }}
        />
      </ProgressPrimitive.Root>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };

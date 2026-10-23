import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "race-type relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[15px] leading-none transition-all duration-100 outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-40 active:translate-y-[2px] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // flat bright slabs with a short darker lip, like the racing game's buttons
        default: "bg-electric text-white shadow-[0_3px_0_0_#1747b8] active:shadow-[0_1px_0_0_#1747b8] hover:brightness-110",
        gold: "bg-gold text-[#2a1d00] shadow-[0_3px_0_0_#c48300] active:shadow-[0_1px_0_0_#c48300] hover:brightness-105",
        go: "bg-go text-white shadow-[0_3px_0_0_#168a30] active:shadow-[0_1px_0_0_#168a30] hover:brightness-105",
        secondary: "bg-[#4b4b50] text-white shadow-[0_3px_0_0_#1f1f22] active:shadow-[0_1px_0_0_#1f1f22] hover:bg-[#55555a]",
        ghost: "text-white/80 hover:bg-white/[0.08] hover:text-white",
        outline: "ring-2 ring-white/25 text-white hover:bg-white/[0.08]",
        locked: "bg-[#4a4a4e] text-white/45 shadow-[0_3px_0_0_#1f1f22]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg px-3 text-[13px]",
        lg: "h-12 px-6 text-lg",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

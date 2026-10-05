import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-extrabold tracking-wide transition-all duration-100 outline-none focus-visible:ring-2 focus-visible:ring-electric/60 disabled:pointer-events-none disabled:opacity-40 active:translate-y-[3px] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          // chunky arcade buttons: a solid lip underneath that the button presses into
          "bg-gradient-to-b from-[#5ab0ff] to-[#2b6cf0] text-white [text-shadow:0_1px_0_rgba(0,0,0,0.35)] shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_4px_0_0_#1a3fa0] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_1px_0_0_#1a3fa0] hover:brightness-110",
        gold: "bg-gradient-to-b from-[#ffe066] to-[#ffaa1d] text-[#4a2600] shadow-[inset_0_2px_0_rgba(255,255,255,0.55),0_4px_0_0_#c26a00] active:shadow-[inset_0_2px_0_rgba(255,255,255,0.55),0_1px_0_0_#c26a00] hover:brightness-105",
        secondary: "bg-white/[0.14] text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.15),0_4px_0_0_rgba(8,12,44,0.45)] hover:bg-white/[0.2]",
        ghost: "text-white/80 hover:bg-white/[0.1] hover:text-white",
        outline: "ring-2 ring-white/25 text-white hover:bg-white/[0.1]",
        locked: "bg-[#2a3170] text-white/45 shadow-[0_4px_0_0_rgba(8,12,44,0.5)]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 px-6 text-base",
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

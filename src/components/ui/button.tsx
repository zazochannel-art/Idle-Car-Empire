import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-electric/60 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-electric to-electric-deep text-white shadow-[0_0_0_1px_rgba(96,165,250,0.4),0_8px_24px_-8px_rgba(59,130,246,0.7)] hover:brightness-110",
        gold: "bg-gradient-to-b from-gold to-gold-deep text-black shadow-[0_0_0_1px_rgba(250,204,21,0.45),0_8px_24px_-8px_rgba(234,179,8,0.7)] hover:brightness-110",
        secondary: "bg-white/[0.06] text-white ring-1 ring-white/10 hover:bg-white/[0.1]",
        ghost: "text-white/70 hover:bg-white/[0.06] hover:text-white",
        outline: "ring-1 ring-white/15 text-white hover:bg-white/[0.06]",
        locked: "bg-white/[0.03] text-white/40 ring-1 ring-white/[0.06]",
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

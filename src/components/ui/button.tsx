import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-glow-sm hover:shadow-glow hover:scale-[1.02] active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-exclu-arsenic bg-transparent hover:bg-exclu-phantom hover:border-exclu-graphite text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: 
          "hover:bg-exclu-phantom hover:text-foreground",
        link: 
          "text-primary underline-offset-4 hover:underline",
        hero: 
          "bg-[#CFFF16] text-black font-extrabold shadow-[0_0_30px_6px_rgba(207,255,22,0.25)] hover:shadow-[0_0_45px_8px_rgba(207,255,22,0.2)] hover:bg-[#d8ff4d] hover:scale-[1.03] active:scale-[0.98] border-0",
        heroOutline:
          "border border-exclu-steel/30 bg-exclu-phantom/30 backdrop-blur-sm text-exclu-cloud hover:bg-exclu-phantom/50 hover:border-exclu-steel/50 hover:scale-[1.02] active:scale-[0.98]",
        glass:
          "glass text-foreground hover:bg-exclu-phantom/60 hover:scale-[1.02]",
        premium:
          "bg-gradient-to-r from-[hsl(270,80%,65%)] via-[hsl(300,80%,60%)] to-[hsl(320,80%,60%)] text-white font-bold shadow-glow-lg hover:shadow-[0_0_100px_20px_hsl(270,100%,70%/0.4)] hover:scale-[1.05] active:scale-[0.98] animate-gradient",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 rounded-lg px-4 text-xs",
        lg: "h-14 rounded-2xl px-10 text-base",
        xl: "h-16 rounded-2xl px-12 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
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
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

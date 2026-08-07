import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Variant and size names are unchanged — every existing call site keeps
 * working. What changed is how each one is drawn:
 *
 * - Focus uses `outline`, not `ring`. Tailwind's `ring` is a box-shadow, and
 *   these buttons carry `active:scale`, which creates a stacking context and
 *   lets an ancestor's `overflow: hidden` clip the ring away. An outline
 *   escapes both. This is the same rule the depth section of index.css states.
 * - `default` hover brightens instead of dropping to `bg-primary/90`. Fading
 *   an orange toward a near-black page desaturates it into brown; raising
 *   luminance keeps the hue and actually reads as "lit".
 * - Every variant gets a real disabled and active state rather than relying
 *   on a blanket 50% opacity.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap rounded-lg",
    "text-sm font-semibold tracking-[-0.01em]",
    "transition-[background-color,color,box-shadow,filter,transform] duration-200",
    "cursor-pointer select-none",
    "focus-visible:outline-none focus-visible:ring-0",
    "focus-visible:[outline:2px_solid_hsl(var(--primary))] focus-visible:[outline-offset:2px]",
    "disabled:pointer-events-none disabled:opacity-45",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.22)] hover:brightness-110 active:brightness-95 active:scale-[0.985]",
        secondary:
          "bg-surface-3 text-ink-1 border border-border hover:bg-surface-3 hover:border-ink-4/60 active:scale-[0.985]",
        outline:
          "border border-border bg-transparent text-ink-2 hover:border-ink-4/70 hover:bg-surface-2 hover:text-ink-1 active:scale-[0.985]",
        ghost:
          "text-ink-2 hover:bg-surface-3 hover:text-ink-1 active:scale-[0.985]",
        link:
          "text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.18)] hover:brightness-110 active:scale-[0.985]",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-[0.8125rem]",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

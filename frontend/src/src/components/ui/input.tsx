import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Focus is drawn with `outline`, matching Button — and the border no longer
 * goes transparent on focus. The old rule paired `focus:ring-2` with
 * `focus:border-transparent`, so a focused field lost its own edge and the
 * ring had to stand in for it; inside any `overflow: hidden` parent (every
 * modal body here) that ring is clipped and the field looked like it had
 * lost focus entirely.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-surface-1 px-3.5 py-2",
          "text-sm text-ink-1 placeholder:text-ink-4",
          "transition-[border-color,background-color] duration-200",
          "hover:border-ink-4/60",
          "focus:outline-none focus:border-primary/70 focus:bg-surface-2",
          "focus-visible:[outline:2px_solid_hsl(var(--primary))] focus-visible:[outline-offset:2px]",
          "disabled:cursor-not-allowed disabled:opacity-45",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Button (design.md §56, §97).
 *
 * Primary is brand blue, secondary is a light surface with deep blue text,
 * ghost is text-only. Purple is available as `accent` for a single special
 * action per surface — it never becomes the standard action colour.
 *
 * Server component: no state, no handlers. Renders an <a> when given `href`.
 */
type Variant = "primary" | "secondary" | "ghost" | "accent" | "inverse" | "inverseGhost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-blue text-ink-on-brand border border-brand-blue hover:bg-brand-blue-hover hover:border-brand-blue-hover shadow-ambient",
  secondary:
    "bg-surface-card text-brand-deep border border-border-strong/60 hover:bg-brand-pale-soft hover:border-brand-deep/35",
  ghost:
    "bg-transparent text-brand-deep border border-transparent hover:bg-brand-pale-soft",
  accent:
    "bg-accent-purple text-ink-on-brand border border-accent-purple hover:brightness-95 shadow-ambient",
  // For deep-blue surfaces, where the usual brand blue would sit blue-on-blue.
  // The hierarchy inverts: the solid light button becomes the primary action.
  // text-surface-brand, not text-brand-deep: the latter inverts to near-white in
  // dark mode, which would put white text on this white button.
  inverse:
    "bg-ink-on-brand text-surface-brand border border-ink-on-brand hover:bg-ink-on-deep",
  inverseGhost:
    "bg-transparent text-ink-on-brand border border-ink-on-brand/35 hover:bg-ink-on-brand/10 hover:border-ink-on-brand/55",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-body-sm gap-1.5 rounded-sm",
  md: "h-10 px-4 text-body gap-2 rounded-sm",
  lg: "h-12 px-6 text-section gap-2 rounded-md",
};

const BASE =
  "inline-flex items-center justify-center font-semibold whitespace-nowrap " +
  "transition-colors duration-(--duration-fast) ease-(--ease-standard) " +
  "disabled:opacity-45 disabled:pointer-events-none select-none";

function classes(variant: Variant, size: Size, className?: string) {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className ?? ""}`;
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & ComponentProps<"button">) {
  return (
    <button className={classes(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={classes(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

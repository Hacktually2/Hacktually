import type { ReactNode } from "react";

/**
 * Panel — the stable analytical content surface (design.md §18, §80).
 * Charts and tables live on this, never on glass.
 */
export function Panel({
  title,
  description,
  action,
  footer,
  tinted = false,
  padded = true,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  tinted?: boolean;
  /** Turn off when the child is a full-bleed table. */
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${tinted ? "surface-tinted" : "surface-card"} ${className ?? ""}`}>
      {(title || action) && (
        <header
          className={`flex items-start justify-between gap-4 ${
            padded ? "px-5 pt-4" : "px-5 py-4"
          } ${padded && !description ? "pb-1" : ""}`}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="text-section font-semibold text-brand-deep">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-body-sm text-ink-secondary">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
      {footer && (
        <footer className="border-t border-border-subtle px-5 py-3 text-body-sm text-ink-secondary">
          {footer}
        </footer>
      )}
    </section>
  );
}

/** Page header (design.md §83 — compact, never a hero). */
export function PageHeader({
  title,
  description,
  context,
  action,
}: {
  title: string;
  description?: string;
  context?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-page font-bold text-brand-deep">{title}</h1>
        {description && <p className="mt-1 text-body text-ink-secondary">{description}</p>}
        {context && <div className="mt-2 text-meta text-ink-tertiary">{context}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/** Label above a value, used across drawers and detail blocks. */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-meta font-medium text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 text-body font-semibold text-ink" data-numeric>
        {children}
      </dd>
      {hint && <p className="mt-0.5 text-meta text-ink-tertiary">{hint}</p>}
    </div>
  );
}

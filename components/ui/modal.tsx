"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "./icons";

/**
 * Modal built on the native <dialog>.
 *
 * `showModal()` hands us focus trapping, Escape to dismiss, inertness of the
 * page behind, and top-layer stacking that ignores z-index entirely. Rebuilding
 * any of that by hand is how modals end up unreachable by keyboard.
 *
 * Open and close animations live in CSS (.modal-card in globals.css) so the
 * close transition can finish before the element is removed from the top layer.
 *
 * Used for settings and the activity log: focused side tasks that should not
 * cost the user their place on the page (design.md §52).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal-card"
      aria-labelledby="modal-title"
      // Fires for Escape and for close() alike, so parent state stays in step
      // with the element whichever way it was dismissed.
      onClose={onClose}
      onCancel={onClose}
      // A click that lands on the dialog itself came from the backdrop: the
      // content sits in the inner wrapper below.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-section font-semibold text-brand-deep">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-body-sm text-ink-secondary">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 rounded-sm p-1.5 text-ink-tertiary transition-colors duration-(--duration-fast) hover:bg-surface-sunken hover:text-ink"
            aria-label={`Close ${title.toLowerCase()}`}
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="border-t border-border-subtle bg-surface-sunken/40 px-6 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}

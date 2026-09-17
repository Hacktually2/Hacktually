"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Reveals its children the first time they scroll into view.
 *
 * One IntersectionObserver is shared by every Reveal on the page rather than one
 * each. The marketing page has 22 of them, and 22 observers means 22 sets of
 * root bounds for the browser to intersect on each scroll pass, for identical
 * options. The shared instance is created on first use and torn down when the
 * last element unmounts.
 *
 * The visual state lives in CSS (the [data-reveal] rules in globals.css); this
 * component only flips the attribute.
 *
 * Use for below-the-fold sections only. Anything visible on load should use the
 * plain CSS entry utilities, which do not wait for JavaScript.
 */
type Callback = () => void;

let observer: IntersectionObserver | null = null;
const callbacks = new Map<Element, Callback>();

function watch(el: Element, onEnter: Callback): () => void {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          callbacks.get(entry.target)?.();
          release(entry.target);
        }
      },
      {
        // The bottom edge is pulled in, so a reveal finishes as the reader
        // arrives rather than starting then.
        //
        // The top edge is pushed far out on purpose. A jump-scroll (End, a
        // dragged scrollbar, an anchor link) moves the page without rendering
        // the frames between, so a short section can go from below the fold to
        // above it having never intersected, and would then stay invisible for
        // good. Extending the root upwards keeps anything already scrolled past
        // inside it, so the observer still reports it and it still reveals.
        rootMargin: "10000px 0px -10% 0px",
        threshold: 0.15,
      }
    );
  }
  callbacks.set(el, onEnter);
  observer.observe(el);
  return () => release(el);
}

function release(el: Element) {
  if (!callbacks.delete(el)) return;
  observer?.unobserve(el);
  // Nothing left to watch: drop the observer so a client-side navigation away
  // from the marketing page does not leave it attached to the scroller.
  if (callbacks.size === 0) {
    observer?.disconnect();
    observer = null;
  }
}

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Stagger within a group, in milliseconds. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    // Reduced motion is handled in CSS rather than here, so the content is
    // visible even before this component hydrates.
    return watch(el, () => setShown(true));
  }, [shown]);

  return (
    <Tag
      ref={ref as never}
      data-reveal={shown ? "in" : "out"}
      style={{ "--enter-delay": `${delay}ms` } as CSSProperties}
      className={className}
    >
      {children}
    </Tag>
  );
}

/**
 * Without JavaScript the reveal never fires, so the content would stay hidden.
 * Rendered once per page that uses Reveal.
 */
export function RevealNoScriptFallback() {
  return (
    <noscript>
      <style
        dangerouslySetInnerHTML={{
          __html: "[data-reveal]{opacity:1 !important;transform:none !important}",
        }}
      />
    </noscript>
  );
}

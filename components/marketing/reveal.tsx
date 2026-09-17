"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Reveals its children the first time they scroll into view.
 *
 * One observer per element, disconnected as soon as it fires, so nothing stays
 * attached to the scroll after the page has been read. The visual state lives
 * in CSS (see the [data-reveal] rules in globals.css); this component only
 * flips the attribute.
 *
 * Use for below-the-fold sections only. Anything visible on load should use the
 * plain CSS entry utilities, which do not wait for JavaScript.
 */
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
    if (!el) return;

    // Reduced motion is handled in CSS rather than here, so the content is
    // visible even before this component hydrates.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      // Fires slightly before the element is fully on screen, so the reveal is
      // finishing as the reader arrives rather than starting.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

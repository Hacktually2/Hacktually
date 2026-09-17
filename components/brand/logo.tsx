import Image from "next/image";

/**
 * DemandX logo.
 *
 * Four assets, two axes: full lockup vs badge, and a dark-ink version for light
 * surfaces vs a light-ink version for dark ones. Both theme variants are
 * rendered and the wrong one is hidden in CSS, so the correct logo is painted
 * on the first frame rather than after JavaScript decides.
 *
 * Asset naming is the reverse of what it looks like: `fulllogodark` is the DARK
 * artwork, which belongs on a LIGHT background.
 */
const ASSETS = {
  full: {
    forLight: "/fulllogodark.webp",
    forDark: "/fulllogolight.webp",
    width: 844,
    height: 268,
  },
  badge: {
    forLight: "/logodark.webp",
    forDark: "/logolight.webp",
    width: 267,
    height: 268,
  },
} as const;

export function Logo({
  variant = "full",
  height = 26,
  priority = false,
  className,
}: {
  /** "full" is the lockup with the name, "badge" is the mark alone. */
  variant?: "full" | "badge";
  /** Rendered height in px; width follows the asset's aspect ratio. */
  height?: number;
  /** Set on the header logo, which is part of the largest paint. */
  priority?: boolean;
  className?: string;
}) {
  const asset = ASSETS[variant];
  const width = Math.round((asset.width / asset.height) * height);
  // Intrinsic size is known, so the browser reserves the box and the header
  // never shifts while the logo decodes.
  const common = { width, height, priority, style: { width, height } };

  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <Image
        {...common}
        src={asset.forLight}
        alt="DemandX"
        className="theme-light-only block"
      />
      {/* The same logo in a second colourway. Decorative, because the variant
          above already carries the name for assistive tech. */}
      <Image
        {...common}
        src={asset.forDark}
        alt=""
        aria-hidden="true"
        className="theme-dark-only"
      />
    </span>
  );
}

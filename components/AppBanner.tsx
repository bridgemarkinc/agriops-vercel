"use client";

import Image from "next/image";
import React from "react";

/**
 * AppBanner
 * A reusable hero/banner with a background image, soft gradient overlay,
 * and an optional title/subtitle slot. Place it in layout to show site-wide,
 * or drop it at the top of any page.
 */
type AppBannerProps = {
  /** If you put the image in /public, defaultSrc is great. Otherwise pass imageSrc explicitly. */
  imageSrc?: string;
  /** Height presets: "sm" | "md" | "lg" */
  height?: "sm" | "md" | "lg";
  /** Optional center title + subtitle */
  title?: string;
  subtitle?: string;
  /** Optional children for custom content (buttons, breadcrumbs, etc.) */
  children?: React.ReactNode;
  /** Extra className if needed */
  className?: string;
};

const HEIGHTS: Record<NonNullable<AppBannerProps["height"]>, string> = {
  sm: "h-40 md:h-48",
  md: "h-56 md:h-64",
  lg: "h-72 md:h-80",
};

export default function AppBanner({
  imageSrc,
  height = "md",
  title,
  subtitle,
  children,
  className = "",
}: AppBannerProps) {
  const src = imageSrc || "/images/sunrise.png"; // default if using /public
  return (
    <section
      className={[
        "relative w-full overflow-hidden rounded-2xl",
        "shadow-sm ring-1 ring-black/5",
        HEIGHTS[height],
        className,
      ].join(" ")}
      aria-label={title || "Pasture banner"}
    >
      {/* Background image */}
      <Image
        src={src}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      {/* Soft gradient wash for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/40" />

      {/* Content */}
      {(title || subtitle || children) && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
          <div className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
            {title && (
              <h1 className="text-xl md:text-3xl font-semibold tracking-tight">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-1 text-sm md:text-base opacity-95">{subtitle}</p>
            )}
            {children && <div className="mt-3">{children}</div>}
          </div>
        </div>
      )}
    </section>
  );
}

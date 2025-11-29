// components/AppHeader.tsx
"use client";

import React, { useEffect, useState } from "react";

type Props = {
  imageSrc?: string;            // public image URL
  title?: string;
  subtitle?: string;
  tenantLabel?: string;         // optional text to show on the right
  height?: "sm" | "md" | "lg";  // banner height
};

export default function AppHeader({
  imageSrc,
  title = "AgriOps",
  subtitle = "Cattle & Pasture Operations Management",
  tenantLabel,
  height = "md",
}: Props) {
  const [imgOk, setImgOk] = useState<boolean>(false);

  // Preload the image to know if it’s actually fetchable
  useEffect(() => {
    if (!imageSrc) {
      setImgOk(false);
      return;
    }
    const img = new Image();
    img.onload = () => setImgOk(true);
    img.onerror = () => setImgOk(false);
    img.src = imageSrc;
  }, [imageSrc]);

  const hClass =
    height === "lg" ? "h-72 md:h-80" :
    height === "sm" ? "h-36 md:h-40" :
    "h-48 md:h-64";

  return (
    <header className="w-full">
      <div className={`relative ${hClass} w-full rounded-xl overflow-hidden shadow-lg`}>
        {/* Background (image or graceful gradient fallback) */}
        {imgOk ? (
          <img
            src={imageSrc}
            alt="Pasture Sunrise"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 w-full h-full"
            style={{
              background:
                "linear-gradient(135deg, #0ea5e9 0%, #22c55e 45%, #f59e0b 100%)",
            }}
          />
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Text */}
        <div className="relative z-10 h-full flex items-center justify-between px-6">
          <div className="text-white drop-shadow">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="text-lg md:text-xl opacity-90">{subtitle}</p>
          </div>

          {tenantLabel ? (
            <div className="hidden md:block text-white/90 text-sm bg-black/30 rounded-lg px-3 py-1.5">
              {tenantLabel}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}


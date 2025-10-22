// components/AppHeader.tsx
"use client";

import React from "react";
import { useTenant } from "@/components/tenant";

export default function AppHeader() {
  const { brand } = useTenant(); // no loadBrand / loadingBrand / tenant picker
  const logo = brand?.logo_url || "/blackriver-logo.png";
  const appName = brand?.app_name || "AgriOps";

  return (
    <div className="border-b bg-white/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        {/* Bigger logo for legibility */}
        <img src={logo} alt={appName} className="h-16 w-auto" />
        <span className="sr-only">{appName}</span>
        {/* No pill menu, no brand loader, no tenant input */}
      </div>
    </div>
  );
}

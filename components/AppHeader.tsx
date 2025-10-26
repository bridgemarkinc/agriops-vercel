// components/AppHeader.tsx
"use client";

import React from "react";
import { useTenant } from "@/components/providers/TenantProvider";

export default function AppHeader() {
  const { tenantId } = useTenant();

  return (
    <header className="w-full">
      <div className="relative h-48 md:h-64 w-full rounded-xl overflow-hidden shadow-lg bg-gray-900">
        {/* ✅ Background pasture image */}
        <img
          src="https://yxgnrgesmtgdbszgwaoe.supabase.co/storage/v1/object/public/images/sunrise.png"
          alt="Pasture Sunrise"
          className="absolute inset-0 w-full h-full object-cover opacity-90"
        />

        {/* ✅ Dark overlay for text readability */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />

        {/* ✅ Branding & Tenant */}
        <div className="relative z-10 h-full flex flex-col justify-center px-6 text-white drop-shadow">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            AgriOps
          </h1>
          <p className="text-lg md:text-xl opacity-90">
            Cattle & Pasture Operations Management
          </p>

          {tenantId ? (
            <p className="mt-2 text-sm opacity-90 font-medium">
              Tenant: <span className="font-semibold">{tenantId}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm italic opacity-80">
              No tenant selected
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

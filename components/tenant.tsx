// components/tenant.tsx
"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type Brand = {
  org_name?: string | null;
  app_name?: string | null;
  logo_url?: string | null;
  accent?: string | null;
};

type TenantCtx = {
  tenantId: string;
  setTenantId: (id: string) => void;
  brand: Brand;
};

const TenantContext = createContext<TenantCtx | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  // keep tenant support, but remove the UI for changing / loading brands for now
  const [tenantId, setTenantId] = useState(
    process.env.NEXT_PUBLIC_TENANT || "demo"
  );
  const brand: Brand = {
    org_name: "Black River",
    app_name: "AgriOps",
    logo_url: "/blackriver-logo.png", // keep your file or CDN path
    accent: "#064e3b",
  };

  const value = useMemo(
    () => ({ tenantId, setTenantId, brand }),
    [tenantId]
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}

// --- Simple header (no pill menu, no load brand button) ---
export function AppHeader() {
  const { brand } = useTenant();
  const logo = brand.logo_url || "/blackriver-logo.png";

  return (
    <div className="border-b bg-white/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center gap-4">
          <img
            src={logo}
            alt={brand.org_name || "Black River"}
            className="h-16 w-auto" // <- larger logo
          />
          <div>
            <div className="text-xl font-semibold">
              {brand.app_name || "AgriOps"}
            </div>
            <div className="text-sm text-slate-500">
              Grazing &amp; Feed Planner
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

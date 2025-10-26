// components/tenant.tsx
"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type Brand = {
  org_name?: string | null;
  app_name?: string | null;
  logo_url?: string | null;
  accent?: string | null;
};

type TenantContextValue = {
  tenantId: string;
  setTenantId: (id: string) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  children,
  initialTenantId = "",
}: {
  children: React.ReactNode;
  initialTenantId?: string;
}) {
  const [tenantId, setTenantId] = useState(initialTenantId);
  const value = useMemo(() => ({ tenantId, setTenantId }), [tenantId]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}

// --- Simple header (no pill menu, no load brand button) ---
export function AppHeader() {
  const { tenantId } = useTenant();
  return (
    <header className="mx-auto max-w-6xl px-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">AgriOps</div>
        <div className="text-sm text-slate-600">
          Tenant: <span className="font-mono">{tenantId || "unset"}</span>
        </div>
      </div>
    </header>
  );
}

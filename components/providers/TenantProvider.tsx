"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

type TenantCtx = {
  tenantId: string;
  setTenantId: (v: string) => void;
};

const TenantContext = createContext<TenantCtx | undefined>(undefined);

/** Safe hook: in production, fallback to empty string instead of throwing hard */
export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error("useTenant must be used within TenantProvider");
    }
    // Soft-fallback in prod to avoid 500s on routes that forget the provider
    return { tenantId: "", setTenantId: () => {} } as TenantCtx;
  }
  return ctx;
}

export function TenantProvider({ initialTenantId, children }: { initialTenantId?: string; children: React.ReactNode }) {
  const [tenantId, setTenantId] = useState(initialTenantId ?? "");
  const value = useMemo(() => ({ tenantId, setTenantId }), [tenantId]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

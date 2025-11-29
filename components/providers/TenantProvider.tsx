// components/providers/TenantProvider.tsx
"use client";

import React, { createContext, useContext, useState, useMemo } from "react";

type TenantContextValue = {
  tenantId: string;
  setTenantId: (id: string) => void;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({
  initialTenantId = "",
  children,
}: {
  initialTenantId?: string;
  children: React.ReactNode;
}) {
  const [tenantId, setTenantId] = useState(initialTenantId);

  const value = useMemo(
    () => ({ tenantId, setTenantId }),
    [tenantId]
  );

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return ctx;
}


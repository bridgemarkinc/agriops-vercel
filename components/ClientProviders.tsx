"use client";

import React from "react";
import { TenantProvider } from "@/components/tenant";

// This wraps your entire app with tenant and other client contexts
export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      {children}
    </TenantProvider>
  );
}

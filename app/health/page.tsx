// app/health/page.tsx
"use client";

import React from "react";
import HealthMonitor from "@/components/HealthMonitor";

export default function HealthPage() {
  // Use a safe default tenant for this page (customize if you like)
  const tenantId =
    process.env.NEXT_PUBLIC_TENANT ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT ||
    "public";

  return <HealthMonitor tenantId={tenantId} />;
}



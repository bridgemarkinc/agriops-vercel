// app/health/page.tsx
"use client";

import React from "react";
import HealthMonitor from "@/components/HealthMonitor";
import { useTenant } from "@/components/tenant";

export default function HealthPage() {
  //const { tenantId } = useTenant(); // comes from TenantProvider in app/layout.tsx//
  //return <HealthMonitor tenantId={tenantId} />;//
}


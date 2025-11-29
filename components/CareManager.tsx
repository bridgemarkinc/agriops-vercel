"use client";

import React, { useState } from "react";
import HealthProtocols from "@/components/HealthProtocols";
import FeedingSchedules from "@/components/FeedingSchedules";
import HealthMonitor from "@/components/HealthMonitor";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CareManager({ tenantId }: { tenantId: string }) {
  const [subTab, setSubTab] = useState<"protocols" | "feeding" | "monitor">("protocols");

  const pill = (k: typeof subTab, label: string) => (
    <Button
      key={k}
      type="button"
      variant={subTab === k ? "default" : "outline"}
      className="rounded-full"
      onClick={() => setSubTab(k)}
    >
      {label}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <div className="pb-2">
          <CardTitle>Care & Health</CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-6">
          {/* Sub-tabs */}
          <div className="flex flex-wrap gap-2">
            {pill("protocols", "Protocols")}
            {pill("feeding", "Feeding")}
            {pill("monitor", "Monitoring")}
          </div>

          {/* Panels */}
          {subTab === "protocols" && <HealthProtocols tenantId={tenantId} />}
          {subTab === "feeding" && <FeedingSchedules tenantId={tenantId} />}
          {subTab === "monitor" && <HealthMonitor tenantId={tenantId} />}
        </div>
      </CardContent>
    </Card>
  );
}

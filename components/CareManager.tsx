"use client";
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * CareManager
 * Handles health treatment protocols, feeding schedules, and animal vitals
 */
export default function CareManager({ tenantId }: { tenantId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Care & Health Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>This module will track:</p>
        <ul className="list-disc ml-6">
          <li>Health protocols (vaccines, deworming, etc.)</li>
          <li>Feeding schedules and ration plans</li>
          <li>Vitals monitoring (temperature, rumination, activity)</li>
          <li>Automatic alerts for overdue treatments</li>
        </ul>
      </CardContent>
    </Card>
  );
}

"use client";
import React from "react";

type Props = { tenantId: string };

/**
 * Minimal GrazingPlanner placeholder component.
 * Once verified working in Vercel, you can replace it with
 * the full AI Grazing & Feed Planner logic later.
 */
export default function GrazingPlanner({ tenantId }: Props) {
  return (
    <div className="p-4 border rounded-xl bg-white/70 shadow-sm text-sm">
      <h2 className="font-semibold text-lg mb-2">AI Grazing & Feed Planner</h2>
      <p className="text-gray-700">
        This module is mounted and ready for tenant:{" "}
        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
          {tenantId}
        </span>
      </p>
      <p className="mt-3 text-gray-600">
        You can now expand this with grazing plan logic, feed budgeting
        calculations, and printable farm log exports.
      </p>
    </div>
  );
}

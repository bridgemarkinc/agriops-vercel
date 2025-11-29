// app/cattle/page.tsx
"use client";
import React from "react";
import CattleByTag from "@/components/CattleByTag";
export default function CattlePage() {
  // pass your real tenant here if needed
  return <CattleByTag tenantId={process.env.NEXT_PUBLIC_TENANT || "demo"} />;
}

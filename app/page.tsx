// app/page.tsx
"use client";

import React from "react";
import AgriOps from "@/components/AgriOps";

// Keep this page purely client to avoid accidental static prerender issues.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export default function Page() {
  return <AgriOps />;
}

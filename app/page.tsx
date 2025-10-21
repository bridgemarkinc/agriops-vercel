// app/page.tsx
"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;              // no static caching
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import React from "react";
import AgriOps from "@/components/AgriOps";  // <-- use the real file you have

export default function Page() {
  return <AgriOps />;
}

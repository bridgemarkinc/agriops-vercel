"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;          // ✅ must be number or false
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import React from "react";
import AgriOps from "@/components/AgriOps";  // ✅ your real component

export default function Page() {
  return <AgriOps />;
}
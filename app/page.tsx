// app/page.tsx
"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import React from "react";
import Home from "@/components/Home"; // or whatever your main component is

export default function Page() {
  return <Home />;
}

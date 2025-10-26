// components/AppHeader.tsx
"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useTenant } from "@/components/tenant";

export default function AppHeader() {
  const { tenantId } = useTenant();

  // Optional PUBLIC overrides (safe for client)
  const logoUrl =
    process.env.NEXT_PUBLIC_LOGO_URL ||
    "/blackriver-logo.png"; // fallback to a local asset (ensure it exists)
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "AgriOps";

  return (
    <header className="w-full border-b bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Logo (optional) */}
          {logoUrl ? (
            <Link href="/" className="flex items-center gap-2">
              {/* Give width/height for next/image */}
              <Image
                src={logoUrl}
                alt={appName}
                width={28}
                height={28}
                className="rounded-md object-cover"
                priority
              />
              <span className="text-base font-semibold tracking-tight">{appName}</span>
            </Link>
          ) : (
            <Link href="/" className="text-base font-semibold tracking-tight">
              {appName}
            </Link>
          )}
        </div>

        <div className="text-sm text-slate-600">
          Tenant: <span className="font-mono">{tenantId || "unset"}</span>
        </div>
      </div>
    </header>
  );
}

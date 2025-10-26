// app/layout.tsx
import "./globals.css";
import React from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { TenantProvider, AppHeader } from "@/components/tenant";
import AppBanner from "@/components/AppBanner";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "AgriOps",
  description: "Grazing & Livestock Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const hdrs = headers();
  const cookieTenant = cookieStore.get("tenant_id")?.value;
  const headerTenant = hdrs.get("x-tenant-id") || undefined;
  const envTenant = process.env.NEXT_PUBLIC_TENANT || process.env.TENANT_ID || "";
  const initialTenantId = cookieTenant || headerTenant || envTenant || "";

  const bannerUrl =
    process.env.NEXT_PUBLIC_BANNER_URL ||
    "https://yxgnrgesmtgdbszgwaoe.supabase.co/storage/v1/object/public/images/sunrise.png";

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-50">
        <TenantProvider initialTenantId={initialTenantId}>
          <AppHeader />
          <main className="mx-auto max-w-6xl px-4 py-8">
            {children}
          </main>
        </TenantProvider>
      </body>
    </html>
  );
}


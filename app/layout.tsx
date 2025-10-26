// app/layout.tsx
import "./globals.css";
import React from "react";
import { TenantProvider, AppHeader } from "@/components/tenant";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import AppBanner from "@/components/AppBanner";

export const metadata: Metadata = {
  title: "AgriOps",
  description: "Grazing & Livestock Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Server-side: derive tenant once
  const cookieStore = cookies();
  const hdrs = headers();
  const cookieTenant = cookieStore.get("tenant_id")?.value;
  const headerTenant = hdrs.get("x-tenant-id") || undefined;
  const envTenant = process.env.NEXT_PUBLIC_TENANT || process.env.TENANT_ID || "";
  const initialTenantId = cookieTenant || headerTenant || envTenant || "";

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-50">
        {/* Your global nav here */}
        <div className="mx-auto max-w-6xl px-4 py-4">
          <AppBanner
            // If you used Supabase public URL, pass it here:
            // imageSrc="https://your-project.supabase.co/storage/v1/object/public/ui/sunrise.png"
            title="Good Morning"
            subtitle="Early light over lush, rested pasture"
            height="md"
          />
        </div>
        <main className="mx-auto max-w-6xl px-4 pb-10">{children}</main>
      </body>
    </html>
  );
}

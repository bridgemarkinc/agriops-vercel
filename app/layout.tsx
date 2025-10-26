// app/layout.tsx
import "./globals.css";
import React from "react";
import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "AgriOps",
  description: "Grazing & Livestock Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // If you have a tenant id string available, you can put it here
  const tenantLabel = ""; // e.g. "Tenant: ranch-123"

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <AppHeader
            imageSrc="https://yxgnrgesmtgdbszgwaoe.supabase.co/storage/v1/object/public/images/sunrise.png"
            title="AgriOps"
            subtitle="Cattle & Pasture Operations Management"
            tenantLabel={tenantLabel}
            height="md"
          />
        </div>
        <main className="mx-auto max-w-6xl px-4 pb-10">{children}</main>
      </body>
    </html>
  );
}


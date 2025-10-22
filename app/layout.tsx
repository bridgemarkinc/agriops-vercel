// app/layout.tsx
import "./globals.css";
import React from "react";
import { TenantProvider, AppHeader } from "@/components/tenant";

export const metadata = {
  title: "AgriOps",
  description: "Grazing & Feed Planner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <TenantProvider>
          <AppHeader />
          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        </TenantProvider>
      </body>
    </html>
  );
}

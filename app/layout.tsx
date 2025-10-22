import "./globals.css";
import React from "react";
import Link from "next/link";
import { TenantProvider, useTenant } from "@/components/tenant";
import AppHeader from "@/components/AppHeader";

export const metadata = { title: "AgriOps", description: "Grazing & Feed Planner" };

function Header() {
  const { brand, tenantId, setTenantId, loadBrand, loadingBrand } = useTenant();
  const logoSrc = brand.logo_url || "/blackriver-logo.png";

  return (
    <div className="border-b bg-white/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: logo */}
          <div className="flex items-center gap-3">
            <img src={logoSrc} alt={brand.org_name || "Black River"} className="h-12 w-auto" />
            <div className="text-sm text-slate-500">{brand.app_name || "AgriOps"}</div>
          </div>

          {/* Center: top menu */}
          <nav className="hidden md:flex gap-2">
            <Link className="px-3 py-1.5 rounded-full text-sm border hover:bg-slate-50" href="/">Planner & Cattle</Link>
            <Link className="px-3 py-1.5 rounded-full text-sm border hover:bg-slate-50" href="/pasture">Pasture Maintenance</Link>
            <Link className="px-3 py-1.5 rounded-full text-sm border hover:bg-slate-50" href="/care">Care & Health</Link>
          </nav>

          {/* Right: tenant controls */}
          <div className="flex items-center gap-2">
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="Tenant (domain)"
              className="h-9 w-64 rounded-md border border-slate-300 bg-white px-3 text-sm"
            />
            <button
              onClick={loadBrand}
              className="h-9 px-3 rounded-md border text-sm bg-white hover:bg-slate-50"
              disabled={loadingBrand}
              title="Load branding for this tenant"
            >
              {loadingBrand ? "Loading…" : "Load Brand"}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div className="mt-3 md:hidden flex flex-wrap gap-2">
          <Link className="px-3 py-1.5 rounded-full text-sm border hover:bg-slate-50" href="/">Planner & Cattle</Link>
          <Link className="px-3 py-1.5 rounded-full text-sm border hover:bg-slate-50" href="/pasture">Pasture Maintenance</Link>
          <Link className="px-3 py-1.5 rounded-full text-sm border hover:bg-slate-50" href="/care">Care & Health</Link>
        </div>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <TenantProvider>
          <AppHeader />
          <main className="max-w-6xl mx-auto px-4 py-6">
            {children}
          </main>
        </TenantProvider>
      </body>
    </html>
  );
}

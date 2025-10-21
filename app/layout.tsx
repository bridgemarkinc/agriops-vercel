// app/layout.tsx
import "./globals.css";
import React from "react";
import Link from "next/link";

export const metadata = {
  title: "AgriOps",
  description: "Grazing & Feed Planner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {/* Top bar */}
        <header className="bg-white/90 border-b">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex items-center justify-between py-3">
              {/* Left: Logo + title */}
              <div className="flex items-center gap-3">
                <img
                  src="/blackriver-logo.png"
                  alt="Black River"
                  className="h-10 w-auto"
                />
                <span className="font-semibold tracking-tight">
                  AgriOps
                </span>
              </div>

              {/* Right: Nav */}
              <nav className="hidden md:flex items-center gap-5 text-sm font-medium">
                <Link className="hover:text-emerald-700" href="/">Dashboard</Link>
                <Link className="hover:text-emerald-700" href="/grazing">Grazing Planner</Link>
                <Link className="hover:text-emerald-700" href="/cattle">Cattle by Tag</Link>
                <Link className="hover:text-emerald-700" href="/care">Care &amp; Health</Link>
                <Link className="hover:text-emerald-700" href="/pasture">Pasture Maintenance</Link>
              </nav>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="max-w-6xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
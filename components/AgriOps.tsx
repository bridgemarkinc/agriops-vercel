"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import GrazingPlanner from "@/components/GrazingPlanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ────────────────────────────────────────────────
// Supabase client (browser-safe)
// ────────────────────────────────────────────────
const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};

let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPABASE.url.startsWith("http")) {
  supabase = createClient(SUPABASE.url, SUPABASE.anon);
}

// Pick default tenant from env or current host
function getDefaultTenant() {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return process.env.NEXT_PUBLIC_TENANT || window.location.hostname;
  }
  return process.env.NEXT_PUBLIC_TENANT || "demo";
}

type BrandRow = {
  org_name?: string | null;
  app_name?: string | null;
  logo_url?: string | null;
  accent?: string | null;
};

export default function AgriOps() {
  const [tenantId, setTenantId] = useState<string>(getDefaultTenant());
  const [brand, setBrand] = useState<BrandRow>({});
  const [loading, setLoading] = useState(false);

  // Load brand data for current tenant (logo, name, colors)
  async function loadBrand() {
    if (!supabase) return alert("Supabase not configured");
    setLoading(true);
    const { data, error } = await supabase
      .from("agriops_brands")
      // deterministic: if duplicates exist, take the newest row
      .select("org_name,app_name,logo_url,accent,id")
      .eq("tenant_id", tenantId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLoading(false);
    if (error) return alert(error.message);
    setBrand({
      org_name: data?.org_name ?? null,
      app_name: data?.app_name ?? null,
      logo_url: data?.logo_url ?? null,
      accent: data?.accent ?? null,
    });
  }

  useEffect(() => {
    if (!tenantId) return;
    loadBrand().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appTitle = useMemo(
    () => brand.app_name || "AgriOps – Grazing & Feed Planner",
    [brand.app_name]
  );

  // Prefer a real remote logo, ignore placeholders, fall back to /public asset
  const logoSrc = useMemo(() => {
    const remote = (brand.logo_url || "").trim();
    if (!remote) return "/blackriver-logo.png";
    // ignore common placeholder hosts
    if (/(^|\.)placehold\.co/i.test(remote)) return "/blackriver-logo.png";
    return remote;
  }, [brand.logo_url]);

  // Soft header background color (brand.accent or gentle default)
  const headerBg = brand.accent && brand.accent.trim() !== "" ? brand.accent : "#dbece0";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ───────────────── Header with soft background & larger logo ───────────────── */}
      <div className="w-full py-4 mb-6" style={{ backgroundColor: headerBg }}>
        <div className="max-w-6xl mx-auto px-4">
          {/* On mobile: stacked & centered; on md+: 3-column with centered logo, right controls */}
          <div className="flex flex-col items-center gap-3 md:grid md:grid-cols-3 md:items-center">
            {/* left spacer (keeps logo perfectly centered on md+) */}
            <div className="hidden md:block" />

            {/* centered logo */}
            <div className="justify-self-center">
              <img
                src={logoSrc}
                alt={brand.org_name || "Black River"}
                className="h-14 md:h-16 w-auto block mx-auto drop-shadow-sm"
              />
              <h1 className="sr-only">{appTitle}</h1>
            </div>

            {/* right controls */}
            <div className="w-full md:w-auto md:justify-self-end">
              <div className="flex flex-wrap gap-2 justify-center md:justify-end">
                <Input
                  placeholder="Tenant ID (your domain)"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="w-64"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadBrand}
                  disabled={loading}
                  title="Load branding for this tenant"
                >
                  {loading ? "Loading…" : "Load Brand"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────── Centered page container ───────────────── */}
      <div className="max-w-6xl mx-auto px-4 pb-8">
        {/* Main layout */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left column: core tools */}
          <div className="space-y-6">
            <GrazingPlanner tenantId={tenantId} />
          </div>

          {/* Right column: reserved for future (Reports, Inventory, Ads, etc.) */}
          <div className="space-y-6">{/* Future modules go here */}</div>
        </div>
      </div>
    </div>
  );
}

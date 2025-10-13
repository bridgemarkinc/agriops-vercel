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

// pick default tenant from env or current host
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
      .select("*")
      .eq("tenant_id", tenantId)
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
  const logoSrc = useMemo(
    () => brand.logo_url || "/blackriver-logo.png",
    [brand.logo_url]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Centered page container */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header:
            - On mobile: stacked (logo centered, controls below centered)
            - On md+: grid with centered logo and right-aligned controls */}
        <div className="mb-6">
          <div className="flex flex-col items-center gap-3 md:grid md:grid-cols-3 md:items-center">
            {/* left spacer for md+ (keeps logo truly centered) */}
            <div className="hidden md:block" />

            {/* centered logo */}
            <div className="justify-self-center">
              <img
                src={logoSrc}
                alt={brand.org_name || "Black River"}
                className="h-10 w-auto block"
              />
              <h1 className="sr-only">{appTitle}</h1>
            </div>

            {/* controls:
                - mobile: centered under logo
                - md+: right-aligned */}
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

        {/* Main layout: centered within container */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Left column: core tools */}
          <div className="space-y-6">
            <GrazingPlanner tenantId={tenantId} />
          </div>

          {/* Right column: reserved for future (Reports, Inventory, Ads, etc.) */}
          <div className="space-y-6">
            {/* Future: Reports / Inventory / Ads */}
          </div>
        </div>
      </div>
    </div>
  );
}

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

// Small helper: pick a sensible default tenant
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

  // Auto-load brand if we came in with a prefilled tenant (from env/URL)
  useEffect(() => {
    if (!tenantId) return;
    // Optionally auto-load on mount
    loadBrand().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick a title & logo fallback
  const appTitle = useMemo(
    () => brand.app_name || "AgriOps – Grazing & Feed Planner",
    [brand.app_name]
  );
  const logoSrc = useMemo(
    () => brand.logo_url || "/blackriver-logo.png", // ensure /public/blackriver-logo.png exists
    [brand.logo_url]
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* ───────────────── Header with centered logo and right-side controls ───────────────── */}
      <div className="w-full grid grid-cols-3 items-center mb-6">
        {/* Left spacer keeps center alignment perfect */}
        <div />
        {/* Centered brand logo & optional title (title is visually hidden but useful for a11y/SEO) */}
        <div className="justify-self-center">
          <img
            src={logoSrc}
            alt={brand.org_name || "Black River"}
            className="h-10 w-auto block mx-auto"
          />
          <h1 className="sr-only">{appTitle}</h1>
        </div>
        {/* Right: tenant controls */}
        <div className="justify-self-end flex flex-wrap items-end gap-2">
          <Input
            placeholder="Tenant ID (your domain)"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-60"
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

      {/* ───────────────── Main layout ───────────────── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left column: core tools */}
        <div className="space-y-6">
          <GrazingPlanner tenantId={tenantId} />
        </div>

        {/* Right column: reserved for future (Reports, Inventory, Ads, etc.) */}
        <div className="space-y-6">
          {/* Keep this area for future modules. Example placeholders: */}
          {/* <YourInventoryCard tenantId={tenantId} /> */}
          {/* <YourReportsTabs tenantId={tenantId} /> */}
        </div>
      </div>
    </div>
  );
}

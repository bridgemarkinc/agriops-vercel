"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import GrazingPlanner from "@/components/GrazingPlanner";
import CareManager from "@/components/CareManager";
import CattleByTag from "@/components/CattleByTag";
import HealthProtocols from "@/components/HealthProtocols";
import FeedingSchedules from "@/components/FeedingSchedules";
import HealthMonitor from "@/components/HealthMonitor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


/* ───────── Supabase client (browser-safe) ───────── */
const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};
let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPABASE.url.startsWith("http")) {
  supabase = createClient(SUPABASE.url, SUPABASE.anon);
}

/* pick default tenant from env or current host */
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
  const [activeTab, setActiveTab] = useState<"planner" | "cattle" | "care">("planner");


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
  const accent = brand.accent?.trim() || "";

  /* Utility: styles for selected/unselected pills */
  function pillClasses(isActive: boolean) {
    const active =
      "text-white shadow-sm " + (accent ? "" : "bg-slate-900");
    const inactive =
      "bg-white text-slate-600 hover:text-slate-900 border border-slate-200";
    return [
      "px-4 py-2 rounded-full text-sm font-medium transition",
      isActive ? active : inactive,
      "focus:outline-none focus:ring-2 focus:ring-slate-900/10",
    ].join(" ");
  }

  const headerBg =
    brand.accent && brand.accent.trim() !== "" ? brand.accent + "20" : "#f8fafc";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ───────────────── Header ───────────────── */}
      <div
        className="border-b bg-white/80 backdrop-blur sticky top-0 z-40"
        style={{ backgroundColor: headerBg }}
      >
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Header grid: left spacer / center logo+tabs / right controls */}
          <div className="grid md:grid-cols-3 items-center gap-3">
            {/* left spacer for perfect center */}
            <div className="hidden md:block" />

            {/* center: logo + pill tabs */}
            <div className="justify-self-center text-center">
              <img
                src={logoSrc}
                alt={brand.org_name || "Black River"}
                className="h-12 w-auto mx-auto block"
              />
              <h1 className="sr-only">{appTitle}</h1>

              {/* Pill tabs under logo */}
              <nav
                className="mt-4 inline-flex items-center gap-2 bg-slate-100 p-1 rounded-full"
  role="tablist"
  aria-label="Primary"
              >
                <button
    type="button"
    role="tab"
    aria-selected={activeTab === "planner"}
    className={pillClasses(activeTab === "planner")}
    onClick={() => setActiveTab("planner")}
                >
                  Grazing Planner
  </button>

  <button
    type="button"
    role="tab"
    aria-selected={activeTab === "cattle"}
    className={pillClasses(activeTab === "cattle")}
    onClick={() => setActiveTab("cattle")}
                >
                  Cattle by Tag
                </button>

                <button
    type="button"
    role="tab"
    aria-selected={activeTab === "cattle"}
    className={pillClasses(activeTab === "cattle")}
    onClick={() => setActiveTab("cattle")}
    ></button>

    
              </nav>
            </div>

            {/* right: tenant controls */}
            <div className="md:justify-self-end">
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

      {/* ───────────────── Main content ───────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-6 md:col-span-2" role="tabpanel">
  {activeTab === "planner" && <GrazingPlanner tenantId={tenantId} />}
  {activeTab === "cattle" && <CattleByTag tenantId={tenantId} />}
  {activeTab === "care" && <CareManager tenantId={tenantId} />}
</div>
        </div>
      </div>
    </div>
  );
}

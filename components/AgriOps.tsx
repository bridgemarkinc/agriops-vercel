"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import GrazingPlanner from "@/components/GrazingPlanner";
import CattleByTag from "@/components/CattleByTag";
import CareManager from "@/components/CareManager"; // ⬅️ NEW
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
  const [activeTab, setActiveTab] = useState<"planner" | "cattle" | "care">("planner"); // ⬅️ UPDATED

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

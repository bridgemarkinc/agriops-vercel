"use client";

import React, { useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import GrazingPlanner from "@/components/GrazingPlanner";
// import AdsReportPlus from "@/components/AdsReportPlus";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ────────────────────────────────────────────────
//  Supabase config
// ────────────────────────────────────────────────
const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};

let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPABASE.url.startsWith("http")) {
  supabase = createClient(SUPABASE.url, SUPABASE.anon);
}

export default function AgriOps() {
  const [tenantId, setTenantId] = useState(
    process.env.NEXT_PUBLIC_TENANT || "demo"
  );
  const [brand, setBrand] = useState<{ org_name?: string; logo_url?: string }>(
    {}
  );
  const [loading, setLoading] = useState(false);

  // ────────────────────────────────────────────────
  //  Load brand (white-label)
  // ────────────────────────────────────────────────
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
    if (data) setBrand(data);
  }

  // ────────────────────────────────────────────────
  //  Layout
  // ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header with centered logo */}
      <div className="w-full grid grid-cols-3 items-center mb-6">
        <div /> {/* left spacer */}
        <div className="justify-self-center">
          <img
            src={brand.logo_url || "/blackriver-logo.png"}
            alt={brand.org_name || "Black River"}
            className="h-10 w-auto block mx-auto"
          />
        </div>
        <div className="justify-self-end flex flex-wrap gap-2">
          <Input
            placeholder="Tenant ID"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-44"
          />
          <Button variant="outline" size="sm" onClick={loadBrand}>
            Load Brand
          </Button>
        </div>
      </div>

      {/* Core dashboard */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Grazing Planner */}
        <div className="space-y-6">
          <GrazingPlanner tenantId={tenantId} />
        </div>

        {/* Right: reserved for later (Reports / Ads / Inventory) */}
        <div className="space-y-6">
          {/* Example Tabs setup for later
          <Tabs defaultValue="planner">
            <TabsList>
              <TabsTrigger value="planner">Planner</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>
            <TabsContent value="planner">
              <GrazingPlanner tenantId={tenantId} />
            </TabsContent>
            <TabsContent value="reports">
              <AdsReportPlus tenantId={tenantId} />
            </TabsContent>
          </Tabs>
          */}
        </div>
      </div>
    </div>
  );
}

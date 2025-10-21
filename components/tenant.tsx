"use client";
import React, {createContext, useContext, useMemo, useState, useCallback} from "react";
import { createClient } from "@supabase/supabase-js";

type Brand = { org_name?: string|null; app_name?: string|null; logo_url?: string|null; accent?: string|null; };

type TenantCtx = {
  tenantId: string;
  setTenantId: (v: string)=>void;
  brand: Brand;
  loadingBrand: boolean;
  loadBrand: () => Promise<void>;
  supabaseReady: boolean;
};

const TenantContext = createContext<TenantCtx | null>(null);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function detectDefaultTenant() {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return process.env.NEXT_PUBLIC_TENANT || window.location.hostname;
  }
  return process.env.NEXT_PUBLIC_TENANT || "demo";
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantId] = useState<string>(detectDefaultTenant());
  const [brand, setBrand] = useState<Brand>({});
  const [loadingBrand, setLoadingBrand] = useState(false);

  const supabaseReady = useMemo(
    () => typeof window !== "undefined" && SUPABASE_URL.startsWith("http") && !!SUPABASE_ANON,
    []
  );

  const loadBrand = useCallback(async () => {
    if (!supabaseReady) return alert("Supabase not configured");
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
    setLoadingBrand(true);
    const { data, error } = await supabase
      .from("agriops_brands")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    setLoadingBrand(false);
    if (error) { alert(error.message); return; }
    setBrand({
      org_name: data?.org_name ?? null,
      app_name: data?.app_name ?? null,
      logo_url: data?.logo_url ?? null,
      accent: data?.accent ?? null,
    });
  }, [supabaseReady, tenantId]);

  const value = useMemo(() => ({
    tenantId, setTenantId, brand, loadingBrand, loadBrand, supabaseReady
  }), [tenantId, brand, loadingBrand, loadBrand, supabaseReady]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}

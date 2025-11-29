"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";

// ---------- browser supabase (for realtime only) ----------
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPA_URL.startsWith("http")) {
  supabase = createClient(SUPA_URL, SUPA_ANON);
}

// ---------- types ----------
export type Paddock = {
  id: number;
  tenant_id: string;
  name: string;
  acres: number | null;
  head_count: number; // from view agriops_paddocks_with_counts
};

// ---------- helpers ----------
function resolveTenantId(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_TENANT || window.location.hostname || "demo";
  }
  return process.env.NEXT_PUBLIC_TENANT || "demo";
}

async function api<T = unknown>(action: string, body: any): Promise<T> {
  const res = await fetch("/api/paddocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`Bad JSON from /api/paddocks: ${raw?.slice(0, 200) || "<empty>"}`);
  }
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json.data as T;
}

// ---------- hook ----------
export function usePaddocks(inputTenantId?: string) {
  const tenantId = useMemo(() => inputTenantId || resolveTenantId(), [inputTenantId]);

  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTimer = useRef<number | null>(null);
  const debouncedRefresh = () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      load().catch(() => {});
    }, 200);
  };

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<Paddock[]>("listWithCounts", { tenant_id: tenantId });
      setPaddocks(data ?? []);
    } catch (e: any) {
      setError(e.message || "Failed to load paddocks");
    } finally {
      setLoading(false);
    }
  }

  async function upsertPaddock(row: { id?: number; name: string; acres?: number | null }) {
    await api("upsertPaddock", { tenant_id: tenantId, row });
    await load();
  }

  async function deletePaddock(id: number) {
    await api("deletePaddock", { tenant_id: tenantId, id });
    await load();
  }

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // realtime: paddocks & cattle changes both affect listWithCounts
  useEffect(() => {
    if (!supabase || !tenantId) return;

    const chans: RealtimeChannel[] = [];

    chans.push(
      supabase
        .channel(`paddocks-${tenantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agriops_paddocks", filter: `tenant_id=eq.${tenantId}` },
          debouncedRefresh
        )
        .subscribe()
    );

    chans.push(
      supabase
        .channel(`cattle-${tenantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agriops_cattle", filter: `tenant_id=eq.${tenantId}` },
          debouncedRefresh
        )
        .subscribe()
    );

    return () => {
      chans.forEach((ch) => {
        try { supabase!.removeChannel(ch); } catch {}
      });
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return {
    tenantId,
    paddocks,
    loading,
    error,
    reload: load,
    upsertPaddock,
    deletePaddock,
  };
}

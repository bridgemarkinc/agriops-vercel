"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ───────────────────────── Supabase (browser) ───────────────────────── */
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPA_URL && SUPA_ANON) {
  supabase = createClient(SUPA_URL, SUPA_ANON, {
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

/* ───────────────────────── Types ───────────────────────── */
type Paddock = {
  id: number;
  tenant_id: string;
  name: string;
  acres: number | null;
  head_count: number;
};

type SeedingRow = {
  id: number;
  paddock_id: number;
  seed_mix_name: string;
  species: string;
  rate_lb_ac: number | null;
  notes: string | null;
};

type AmendmentRow = {
  id: number;
  paddock_id: number;
  product: string;
  rate_unit_ac: string;
  notes: string | null;
};

/* ───────────────────────── Component ───────────────────────── */
export default function PastureMaintenancePage() {
  // Default tenant: prefer NEXT_PUBLIC_TENANT at build, fall back to hostname at runtime, else "demo"
  const [tenantId, setTenantId] = useState<string>(() => {
    if (process.env.NEXT_PUBLIC_TENANT) return process.env.NEXT_PUBLIC_TENANT;
    if (typeof window !== "undefined" && window.location?.hostname) return window.location.hostname;
    return "demo";
  });

  const [loading, setLoading] = useState(false);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [filter, setFilter] = useState("");

  const [selected, setSelected] = useState<Paddock | null>(null);
  const [seedings, setSeedings] = useState<SeedingRow[]>([]);
  const [amends, setAmends] = useState<AmendmentRow[]>([]);

  // create/edit paddock
  const [pdName, setPdName] = useState("");
  const [pdAcres, setPdAcres] = useState<string>("");

  // drafts
  const [seedDraft, setSeedDraft] = useState<Partial<SeedingRow>>({
    seed_mix_name: "",
    species: "",
    rate_lb_ac: null,
    notes: "",
  });
  const [amendDraft, setAmendDraft] = useState<Partial<AmendmentRow>>({
    product: "",
    rate_unit_ac: "",
    notes: "",
  });

  /* ───────────────────── Helpers (API) ───────────────────── */
  async function api<T = unknown>(action: string, body: any): Promise<T> {
    const res = await fetch("/api/paddocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });

    // Defensive parsing so we never see "Unexpected end of JSON input"
    const raw = await res.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(`Bad JSON from /api/paddocks: ${raw?.slice(0, 200) || "<empty>"}`);
    }

    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    return json.data as T;
  }

  async function loadPaddocks() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await api<Paddock[]>("listWithCounts", { tenant_id: tenantId });
      setPaddocks(data ?? []);
    } catch (e: any) {
      alert(e.message || "Failed to load paddocks");
    } finally {
      setLoading(false);
    }
  }

  async function openEditor(p: Paddock) {
    setSelected(p);
    try {
      const [s, a] = await Promise.all([
        api<SeedingRow[]>("listSeeding", { tenant_id: tenantId, paddock_id: p.id }),
        api<AmendmentRow[]>("listAmendments", { tenant_id: tenantId, paddock_id: p.id }),
      ]);
      setSeedings(s ?? []);
      setAmends(a ?? []);
    } catch (e: any) {
      alert(e.message || "Failed to load paddock details");
    }
  }

  /* ───────────────── Paddock CRUD ───────────────── */
  async function createPaddock() {
    if (!pdName.trim()) return alert("Paddock name is required");
    const row = {
      name: pdName.trim(),
      acres: pdAcres ? Number(pdAcres) : null,
    };
    try {
      await api("upsertPaddock", { tenant_id: tenantId, row });
      setPdName("");
      setPdAcres("");
      await loadPaddocks();
    } catch (e: any) {
      alert(e.message || "Failed to create paddock");
    }
  }

  async function deletePaddock(p: Paddock) {
    if (!confirm(`Delete paddock "${p.name}"? This cannot be undone.`)) return;
    try {
      await api("deletePaddock", { tenant_id: tenantId, id: p.id });
      if (selected?.id === p.id) setSelected(null);
      await loadPaddocks();
    } catch (e: any) {
      alert(e.message || "Failed to delete paddock");
    }
  }

  /* ───────────────── Seeding CRUD ───────────────── */
  async function saveSeeding() {
    if (!selected) return;
    const row = {
      paddock_id: selected.id,
      seed_mix_name: (seedDraft.seed_mix_name || "").trim(),
      species: (seedDraft.species || "").trim(),
      rate_lb_ac: seedDraft.rate_lb_ac ?? null,
      notes: (seedDraft.notes || "").trim() || null,
    };
    if (!row.seed_mix_name) return alert("Seed mix name is required");
    try {
      await api("upsertSeeding", { tenant_id: tenantId, row });
      setSeedDraft({ seed_mix_name: "", species: "", rate_lb_ac: null, notes: "" });
      await openEditor(selected);
    } catch (e: any) {
      alert(e.message || "Failed to save seeding");
    }
  }

  async function removeSeeding(id: number) {
    if (!selected) return;
    if (!confirm("Delete this seeding row?")) return;
    try {
      await api("deleteSeeding", { tenant_id: tenantId, id });
      await openEditor(selected);
    } catch (e: any) {
      alert(e.message || "Failed to delete seeding");
    }
  }

  /* ───────────────── Amendments CRUD ───────────────── */
  async function saveAmendment() {
    if (!selected) return;
    const row = {
      paddock_id: selected.id,
      product: (amendDraft.product || "").trim(),
      rate_unit_ac: (amendDraft.rate_unit_ac || "").trim(),
      notes: (amendDraft.notes || "").trim() || null,
    };
    if (!row.product) return alert("Product is required");
    try {
      await api("upsertAmendment", { tenant_id: tenantId, row });
      setAmendDraft({ product: "", rate_unit_ac: "", notes: "" });
      await openEditor(selected);
    } catch (e: any) {
      alert(e.message || "Failed to save amendment");
    }
  }

  async function removeAmendment(id: number) {
    if (!selected) return;
    if (!confirm("Delete this amendment?")) return;
    try {
      await api("deleteAmendment", { tenant_id: tenantId, id });
      await openEditor(selected);
    } catch (e: any) {
      alert(e.message || "Failed to delete amendment");
    }
  }

  /* ───────────────── Realtime wiring ───────────────── */
  const paddockRefreshTimer = useRef<number | null>(null);
  const detailRefreshTimer = useRef<number | null>(null);

  const debouncedPaddockRefresh = () => {
    if (paddockRefreshTimer.current) window.clearTimeout(paddockRefreshTimer.current);
    paddockRefreshTimer.current = window.setTimeout(() => {
      loadPaddocks().catch(() => {});
    }, 250);
  };

  const debouncedDetailRefresh = () => {
    if (!selected) return;
    if (detailRefreshTimer.current) window.clearTimeout(detailRefreshTimer.current);
    detailRefreshTimer.current = window.setTimeout(() => {
      openEditor(selected).catch(() => {});
    }, 250);
  };

  useEffect(() => {
    if (!supabase || !tenantId) return;

    const channels: RealtimeChannel[] = [];

    channels.push(
      supabase
        .channel(`paddocks-${tenantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agriops_paddocks", filter: `tenant_id=eq.${tenantId}` },
          debouncedPaddockRefresh
        )
        .subscribe()
    );

    channels.push(
      supabase
        .channel(`cattle-${tenantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agriops_cattle", filter: `tenant_id=eq.${tenantId}` },
          debouncedPaddockRefresh
        )
        .subscribe()
    );

    channels.push(
      supabase
        .channel(`seed-${tenantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agriops_paddock_seeding", filter: `tenant_id=eq.${tenantId}` },
          debouncedDetailRefresh
        )
        .subscribe()
    );

    channels.push(
      supabase
        .channel(`amend-${tenantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agriops_paddock_amendments", filter: `tenant_id=eq.${tenantId}` },
          debouncedDetailRefresh
        )
        .subscribe()
    );

    return () => {
      channels.forEach((ch) => {
        try {
          supabase?.removeChannel(ch);
        } catch {}
      });
      if (paddockRefreshTimer.current) window.clearTimeout(paddockRefreshTimer.current);
      if (detailRefreshTimer.current) window.clearTimeout(detailRefreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, selected?.id]);

  /* ───────────────── Effects ───────────────── */
  useEffect(() => {
    if (tenantId) loadPaddocks().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  /* ───────────────── Derived ───────────────── */
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return paddocks;
    return paddocks.filter((p) => p.name.toLowerCase().includes(q));
  }, [paddocks, filter]);

  const envMissing = !SUPA_URL || !SUPA_ANON;

  /* ───────────────── Render ───────────────── */
  return (
    <div className="min-h-screen bg-slate-50">
      {envMissing && (
        <div className="bg-amber-100 text-amber-900 px-4 py-2 text-sm">
          Supabase client is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your environment and redeploy.
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Page header */}
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Pasture Maintenance</h1>
          <div className="flex items-center gap-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter paddocks…"
              className="w-56"
            />
            <Button variant="outline" onClick={loadPaddocks} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </header>

        {/* Create paddock */}
        <div className="border rounded-xl bg-white p-4">
          <div className="font-medium mb-2">Add Paddock</div>
          <div className="grid md:grid-cols-4 gap-2">
            <div className="md:col-span-2">
              <Label>Name</Label>
              <Input
                value={pdName}
                onChange={(e) => setPdName(e.target.value)}
                placeholder="e.g., South Lot"
              />
            </div>
            <div>
              <Label>Acres</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={pdAcres}
                onChange={(e) => setPdAcres(e.target.value)}
                placeholder="e.g., 12.5"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={createPaddock} disabled={!tenantId}>
                Save Paddock
              </Button>
            </div>
          </div>
        </div>

        {/* Paddock list */}
        <div className="border rounded-xl bg-white">
          <div className="px-4 py-3 border-b bg-slate-50 rounded-t-xl flex items-center justify-between">
            <div className="font-medium">Paddocks</div>
            <div className="text-sm text-slate-500">{filtered.length} shown</div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0 z-10">
                <tr>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Acres</th>
                  <th className="text-left p-2">Cattle (head)</th>
                  <th className="text-right p-2 w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2">{p.acres ?? "-"}</td>
                    <td className="p-2">{p.head_count}</td>
                    <td className="p-2 text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openEditor(p)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deletePaddock(p)}
                        className="text-red-700"
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td className="p-2" colSpan={4}>
                      No paddocks match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drawer / panel for selected paddock */}
        {selected && (
          <div className="border rounded-xl bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">
                Edit Seeding & Amendments — {selected.name}
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>

            {/* Seeding */}
            <div className="mt-4">
              <div className="font-medium mb-2">Seeding (mixes)</div>
              <div className="grid md:grid-cols-4 gap-2">
                <div>
                  <Label>Mix name</Label>
                  <Input
                    value={seedDraft.seed_mix_name || ""}
                    onChange={(e) =>
                      setSeedDraft((d) => ({ ...d, seed_mix_name: e.target.value }))
                    }
                    placeholder="e.g., Spring Mix A"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Species (comma-separated)</Label>
                  <Input
                    value={seedDraft.species || ""}
                    onChange={(e) =>
                      setSeedDraft((d) => ({ ...d, species: e.target.value }))
                    }
                    placeholder="ryegrass, clover, orchardgrass"
                  />
                </div>
                <div>
                  <Label>Rate (lb/ac)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={seedDraft.rate_lb_ac ?? ""}
                    onChange={(e) =>
                      setSeedDraft((d) => ({
                        ...d,
                        rate_lb_ac: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    placeholder="e.g., 20"
                  />
                </div>
                <div className="md:col-span-4">
                  <Label>Notes</Label>
                  <Input
                    value={seedDraft.notes || ""}
                    onChange={(e) => setSeedDraft((d) => ({ ...d, notes: e.target.value }))}
                    placeholder="optional"
                  />
                </div>
                <div className="md:col-span-4">
                  <Button onClick={saveSeeding}>Save Seeding</Button>
                </div>
              </div>

              <div className="overflow-auto mt-3 border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-2">Mix</th>
                      <th className="text-left p-2">Species</th>
                      <th className="text-left p-2">Rate (lb/ac)</th>
                      <th className="text-left p-2">Notes</th>
                      <th className="text-right p-2 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seedings.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{row.seed_mix_name}</td>
                        <td className="p-2">{row.species}</td>
                        <td className="p-2">{row.rate_lb_ac ?? "-"}</td>
                        <td className="p-2">{row.notes}</td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeSeeding(row.id)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {seedings.length === 0 && (
                      <tr>
                        <td className="p-2" colSpan={5}>
                          No seeding rows yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Amendments */}
            <div className="mt-6">
              <div className="font-medium mb-2">Soil Amendments</div>
              <div className="grid md:grid-cols-3 gap-2">
                <div>
                  <Label>Product</Label>
                  <Input
                    value={amendDraft.product || ""}
                    onChange={(e) => setAmendDraft((d) => ({ ...d, product: e.target.value }))}
                    placeholder="e.g., Pelletized Lime"
                  />
                </div>
                <div>
                  <Label>Rate (unit/ac)</Label>
                  <Input
                    value={amendDraft.rate_unit_ac || ""}
                    onChange={(e) =>
                      setAmendDraft((d) => ({ ...d, rate_unit_ac: e.target.value }))
                    }
                    placeholder="e.g., 1 ton/ac or 50 lb/ac"
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={amendDraft.notes || ""}
                    onChange={(e) => setAmendDraft((d) => ({ ...d, notes: e.target.value }))}
                    placeholder="optional"
                  />
                </div>
                <div className="md:col-span-3">
                  <Button onClick={saveAmendment}>Save Amendment</Button>
                </div>
              </div>

              <div className="overflow-auto mt-3 border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Rate (unit/ac)</th>
                      <th className="text-left p-2">Notes</th>
                      <th className="text-right p-2 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amends.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">{row.product}</td>
                        <td className="p-2">{row.rate_unit_ac}</td>
                        <td className="p-2">{row.notes}</td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeAmendment(row.id)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {amends.length === 0 && (
                      <tr>
                        <td className="p-2" colSpan={4}>
                          No amendments yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

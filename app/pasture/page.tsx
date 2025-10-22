"use client"; 

export const dynamic = "force-dynamic";
export const revalidate =0;        // must be a number or false
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ───────────────────────── Helpers ───────────────────────── */
function getDefaultTenant() {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return process.env.NEXT_PUBLIC_TENANT || window.location.hostname;
  }
  return process.env.NEXT_PUBLIC_TENANT || "demo";
}

/* ───────────────────────── Types ───────────────────────── */
type Paddock = {
  id: number;
  tenant_id: string;
  name: string;
  acres: number | null;
  head_count?: number | null; // returned by listWithCounts
};

type SeedingRow = {
  id: number;
  paddock_id: number;
  seed_mix_name: string;
  species: string;
  rate_lb_ac: number | null;
  notes?: string | null;
};

type AmendmentRow = {
  id: number;
  paddock_id: number;
  product: string;
  rate_unit_ac: string; // e.g., "50 lb/ac" or "1 ton/ac"
  notes?: string | null;
};

/* ─────────────────────── Component ─────────────────────── */
export default function PastureMaintenancePage() {
  // Tenant (local, no useTenant dependency)
  const [tenantId, setTenantId] = useState<string>(getDefaultTenant());

  // Loading
  const [loading, setLoading] = useState(false);

  // Paddock list + selection
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [selected, setSelected] = useState<Paddock | null>(null);

  // Details
  const [seedings, setSeedings] = useState<SeedingRow[]>([]);
  const [amends, setAmends] = useState<AmendmentRow[]>([]);

  // Draft rows (create/edit)
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

  // Generic POST helper to your API
  async function api(action: string, body: any) {
    const res = await fetch("/api/paddocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
    return json.data;
  }

  // Load paddocks with cattle counts
  async function loadPaddocks() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await api("listWithCounts", { tenant_id: tenantId });
      setPaddocks(data || []);
    } catch (e: any) {
      alert(e.message || "Failed to load paddocks");
    } finally {
      setLoading(false);
    }
  }

  // When a paddock is selected, load its seeding & amendments
  async function openEditor(p: Paddock) {
    setSelected(p);
    try {
      const [s, a] = await Promise.all([
        api("listSeeding", { tenant_id: tenantId, paddock_id: p.id }),
        api("listAmendments", { tenant_id: tenantId, paddock_id: p.id }),
      ]);
      setSeedings(s || []);
      setAmends(a || []);
    } catch (e: any) {
      alert(e.message || "Failed to load paddock details");
    }
  }

  // Seeding CRUD
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

  async function deleteSeeding(id: number) {
    if (!selected) return;
    if (!confirm("Delete this seeding row?")) return;
    try {
      await api("deleteSeeding", { tenant_id: tenantId, id });
      await openEditor(selected);
    } catch (e: any) {
      alert(e.message || "Failed to delete seeding");
    }
  }

  // Amendment CRUD
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

  async function deleteAmendment(id: number) {
    if (!selected) return;
    if (!confirm("Delete this amendment?")) return;
    try {
      await api("deleteAmendment", { tenant_id: tenantId, id });
      await openEditor(selected);
    } catch (e: any) {
      alert(e.message || "Failed to delete amendment");
    }
  }

  useEffect(() => {
    loadPaddocks().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const title = useMemo(() => "Pasture Maintenance", []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Lightweight header (page-level) */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{title}</h1>

          {/* Tenant picker (local) */}
          <div className="flex items-center gap-2">
            <Input
              className="w-64"
              placeholder="Tenant (domain)"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
            <Button variant="outline" onClick={loadPaddocks} disabled={loading}>
              {loading ? "Loading…" : "Load"}
            </Button>
          </div>
        </header>

        {/* Paddock list */}
        <div className="border rounded-xl bg-white">
          <div className="px-4 py-3 border-b bg-slate-50 rounded-t-xl flex items-center justify-between">
            <div className="font-medium">Paddocks</div>
            <div className="text-sm text-slate-500">{paddocks.length} total</div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0 z-10">
                <tr>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Acres</th>
                  <th className="text-left p-2">Cattle (head)</th>
                  <th className="text-right p-2 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paddocks.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2">{p.acres ?? "-"}</td>
                    <td className="p-2">{p.head_count ?? 0}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEditor(p)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
                {paddocks.length === 0 && (
                  <tr>
                    <td className="p-2" colSpan={4}>
                      No paddocks yet.
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
                    onChange={(e) => setSeedDraft((d) => ({ ...d, species: e.target.value }))}
                    placeholder="ryegrass, clover, orchardgrass"
                  />
                </div>
                <div>
                  <Label>Rate (lb/ac)</Label>
                  <Input
                    type="number"
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
                            onClick={() => deleteSeeding(row.id)}
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
                            onClick={() => deleteAmendment(row.id)}
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

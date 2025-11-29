// app/reports/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* --- tiny API helpers --- */
async function cattleApi<T = any>(action: string, body?: any): Promise<T> {
  const res = await fetch("/api/cattle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(body || {}) }),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}: ${raw?.slice(0,200)}`);
  return json.data as T;
}
async function paddocksApi<T = any>(action: string, body?: any): Promise<T> {
  const res = await fetch("/api/paddocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(body || {}) }),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}: ${raw?.slice(0,200)}`);
  return json.data as T;
}

/* --- types --- */
type Animal = {
  id: number;
  tenant_id: string;
  tag: string;
  name?: string | null;
  sex?: "M" | "F" | null;
  breed?: string | null;
  birth_date?: string | null;
  current_paddock_id?: number | null;
  status?: string | null;
  death_date?: string | null;
  death_notes?: string | null;
};
type Treatment = {
  id: number;
  animal_id: number;
  treat_date: string;
  product?: string | null;
  dose?: string | null;
  notes?: string | null;
};
type PaddockWithCounts = {
  id: number;
  name: string;
  acres: number | null;
  seeding_count?: number;
  amendment_count?: number;
};

/* --- page --- */
export default function ReportsPage() {
  // tenant detection: ENV first, fallback to localStorage
  const [tenantId, setTenantId] = useState<string>("");
  useEffect(() => {
    const envTenant = process.env.NEXT_PUBLIC_TENANT || "";
    if (envTenant) setTenantId(envTenant);
    else {
      try {
        const stored = localStorage.getItem("tenant_id") || "";
        setTenantId(stored);
      } catch {}
    }
  }, []);

  // inventory
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [invLoading, setInvLoading] = useState(false);

  // paddocks
  const [paddocks, setPaddocks] = useState<PaddockWithCounts[]>([]);
  const [padLoading, setPadLoading] = useState(false);

  // treatments (date range)
  const [tFrom, setTFrom] = useState("");
  const [tTo, setTTo] = useState("");
  const [treatmentsByAnimal, setTreatmentsByAnimal] = useState<Record<number, Treatment[]>>({});
  const [treatLoading, setTreatLoading] = useState(false);

  /* ===== Inventory Snapshot ===== */
  async function loadInventory() {
    if (!tenantId) return;
    try {
      setInvLoading(true);
      const list = await cattleApi<Animal[]>("listAnimals", {
        tenant_id: tenantId,
        search: null,
        include_deceased: true,
      });
      setAnimals(list || []);
    } catch (e: any) {
      alert(e.message || "Failed to load inventory");
    } finally {
      setInvLoading(false);
    }
  }

  const invCounts = useMemo(() => {
    const counts = { total: 0, active: 0, sold: 0, culled: 0, deceased: 0, other: 0 };
    for (const a of animals) {
      counts.total++;
      const s = (a.status || "").toLowerCase();
      if (s === "active") counts.active++;
      else if (s === "sold") counts.sold++;
      else if (s === "culled") counts.culled++;
      else if (s === "deceased" || s === "dead") counts.deceased++;
      else counts.other++;
    }
    return counts;
  }, [animals]);

  /* ===== Pasture Snapshot ===== */
  async function loadPaddockCounts() {
    if (!tenantId) return;
    try {
      setPadLoading(true);
      const rows = await paddocksApi<PaddockWithCounts[]>("listWithCounts", { tenant_id: tenantId });
      setPaddocks(rows || []);
    } catch (e: any) {
      alert(e.message || "Failed to load paddocks");
    } finally {
      setPadLoading(false);
    }
  }

  /* ===== Treatments Summary (range) ===== */
  async function loadTreatmentsRange() {
    if (!tenantId) return;
    try {
      setTreatLoading(true);
      const byA: Record<number, Treatment[]> = {};
      const herd = animals.length ? animals : await cattleApi<Animal[]>("listAnimals", { tenant_id: tenantId, include_deceased: true });
      for (const a of herd) {
        const list = await cattleApi<Treatment[]>("listTreatments", {
          tenant_id: tenantId,
          animal_id: a.id,
        });
        const inRange = (list || []).filter(t =>
          (!tFrom || t.treat_date >= tFrom) && (!tTo || t.treat_date <= tTo)
        );
        if (inRange.length) byA[a.id] = inRange;
      }
      setTreatmentsByAnimal(byA);
    } catch (e: any) {
      alert(e.message || "Failed to load treatments");
    } finally {
      setTreatLoading(false);
    }
  }

  const treatmentSummary = useMemo(() => {
    const map = new Map<string, number>();
    Object.values(treatmentsByAnimal).forEach(arr => {
      arr.forEach(t => {
        const key = (t.product || "Unspecified").trim();
        map.set(key, (map.get(key) || 0) + 1);
      });
    });
    return Array.from(map.entries()).map(([product, count]) => ({ product, count }));
  }, [treatmentsByAnimal]);

  /* ===== CSV Exports ===== */
  function exportInventoryCSV() {
    const header = ["tag", "name", "sex", "breed", "birth_date", "status", "death_date"];
    const rows = animals.map(a => [
      a.tag ?? "", a.name ?? "", a.sex ?? "", a.breed ?? "",
      a.birth_date ?? "", a.status ?? "", a.death_date ?? ""
    ]);
    const csv = [header, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const el = document.createElement("a");
    el.href = url; el.download = "inventory_snapshot.csv"; el.click(); URL.revokeObjectURL(url);
  }

  function exportTreatmentSummaryCSV() {
    const header = ["product","count"];
    const rows = treatmentSummary.map(r => [r.product, String(r.count)]);
    const csv = [header, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const el = document.createElement("a");
    el.href = url; el.download = "treatments_summary.csv"; el.click(); URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!tenantId) return;
    loadInventory();
    loadPaddockCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Run livestock and pasture reports. Use the date filters where available, and export CSVs for offline analysis.
        </CardContent>
      </Card>

      {/* Inventory Snapshot */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle>Inventory Snapshot</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <Button variant="outline" onClick={loadInventory} disabled={invLoading}>
              {invLoading ? "Loading…" : "Refresh"}
            </Button>
            <Button variant="outline" onClick={exportInventoryCSV} disabled={!animals.length}>
              Export CSV
            </Button>
          </div>
          <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Metric label="Total" value={invCounts.total} />
            <Metric label="Active" value={invCounts.active} />
            <Metric label="Sold" value={invCounts.sold} />
            <Metric label="Culled" value={invCounts.culled} />
            <Metric label="Deceased" value={invCounts.deceased} />
          </div>
          <div className="mt-4 overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-2">Tag</th>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Sex</th>
                  <th className="text-left p-2">Breed</th>
                  <th className="text-left p-2">Birth</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Death Date</th>
                </tr>
              </thead>
              <tbody>
                {animals.map(a => (
                  <tr key={a.id} className="border-t">
                    <td className="p-2 font-mono">{a.tag}</td>
                    <td className="p-2">{a.name || ""}</td>
                    <td className="p-2">{a.sex || ""}</td>
                    <td className="p-2">{a.breed || ""}</td>
                    <td className="p-2">{a.birth_date || ""}</td>
                    <td className="p-2">{a.status || ""}</td>
                    <td className="p-2">{a.death_date || ""}</td>
                  </tr>
                ))}
                {!animals.length && (
                  <tr><td className="p-2" colSpan={7}>No animals yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Treatments Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Treatments Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-5 gap-2 items-end">
            <div>
              <Label>From</Label>
              <Input type="date" value={tFrom} onChange={e => setTFrom(e.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={tTo} onChange={e => setTTo(e.target.value)} />
            </div>
            <div className="sm:col-span-3 flex gap-2">
              <Button variant="outline" onClick={loadTreatmentsRange} disabled={treatLoading || !animals.length}>
                {treatLoading ? "Loading…" : "Run"}
              </Button>
              <Button variant="outline" onClick={exportTreatmentSummaryCSV} disabled={!treatmentSummary.length}>
                Export CSV
              </Button>
            </div>
          </div>

          <div className="mt-4 overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-2">Product</th>
                  <th className="text-left p-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {treatmentSummary.map(r => (
                  <tr key={r.product} className="border-t">
                    <td className="p-2">{r.product}</td>
                    <td className="p-2">{r.count}</td>
                  </tr>
                ))}
                {!treatmentSummary.length && (
                  <tr><td className="p-2" colSpan={2}>No treatments in range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pasture Maintenance Snapshot */}
      <Card>
        <CardHeader>
          <CardTitle>Pasture Maintenance Snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Button variant="outline" onClick={loadPaddockCounts} disabled={padLoading}>
              {padLoading ? "Loading…" : "Refresh"}
            </Button>
          </div>
          <div className="overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-2">Paddock</th>
                  <th className="text-left p-2">Acres</th>
                  <th className="text-left p-2">Seeding Records</th>
                  <th className="text-left p-2">Amendment Records</th>
                </tr>
              </thead>
              <tbody>
                {paddocks.map(p => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2">{p.acres ?? "-"}</td>
                    <td className="p-2">{p.seeding_count ?? 0}</td>
                    <td className="p-2">{p.amendment_count ?? 0}</td>
                  </tr>
                ))}
                {!paddocks.length && (
                  <tr><td className="p-2" colSpan={4}>No paddocks yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* tiny metric pill */
function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-3 rounded-xl border bg-white/60">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

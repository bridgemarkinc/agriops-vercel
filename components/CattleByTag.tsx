"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ───────────────────────── Supabase (browser) ───────────────────────── */
const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};
let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPABASE.url.startsWith("http")) {
  supabase = createClient(SUPABASE.url, SUPABASE.anon);
}

/* ───────────────────────── Types ───────────────────────── */
type Paddock = {
  id: number;
  tenant_id: string;
  name: string;
  acres: number;
  zone: string | null;
  notes: string | null;
  head_count?: number;
};

type SeedingRow = {
  id?: number;
  tenant_id: string;
  paddock_id: number;
  date_planted: string | null;
  mix_name: string | null;
  // array of items in UI; stored as json on server
  mix_items?: Array<{ species: string; rate_lb_ac: number }>;
  notes?: string | null;
};

type AmendmentRow = {
  id?: number;
  tenant_id: string;
  paddock_id: number;
  date_applied: string | null;
  product: string; // "Urea", "Lime", etc.
  rate: string | null; // "200 lb/ac", "2 ton/ac"
  notes?: string | null;
};

/* ───────────────────────── API helper ───────────────────────── */
async function paddocksApi(tenantId: string, action: string, body?: any) {
  const res = await fetch("/api/paddocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, tenant_id: tenantId, ...(body || {}) }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json.error || "paddocks api failed");
  }
  return json.data;
}

/* ───────────────────────── Component ───────────────────────── */
export default function GrazingPlanner({ tenantId }: { tenantId: string }) {
  /* Planner inputs */
  const [horizonDays, setHorizonDays] = useState<number | string>(30);
  const [growthLbPerAcrePerDay, setGrowthLbPerAcrePerDay] = useState<number | string>(35);
  const [targetResidual, setTargetResidual] = useState<number | string>(1200);
  const [intakePctBW, setIntakePctBW] = useState<number | string>(3.0);
  const [standingDMLbPerAcre, setStandingDMLbPerAcre] = useState<number | string>(2500);

  /* Herd quick numbers (optional) */
  const [avgWeight, setAvgWeight] = useState<number | string>(1200);
  const [headTotal, setHeadTotal] = useState<number>(0);

  /* Paddocks */
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [loadingPads, setLoadingPads] = useState(false);
  const [activePad, setActivePad] = useState<Paddock | null>(null);

  /* Seeding / Amendments for active paddock */
  const [seedRows, setSeedRows] = useState<SeedingRow[]>([]);
  const [amendRows, setAmendRows] = useState<AmendmentRow[]>([]);
  const [busyEditor, setBusyEditor] = useState(false);

  /* Seed-mix builder (inline) */
  const emptyMixItem = { species: "", rate_lb_ac: 0 };
  const [mixDraft, setMixDraft] = useState<SeedingRow>({
    tenant_id: tenantId,
    paddock_id: 0,
    date_planted: "",
    mix_name: "",
    mix_items: [{ ...emptyMixItem }],
    notes: "",
  });

  /* Amendment draft */
  const [amendDraft, setAmendDraft] = useState<AmendmentRow>({
    tenant_id: tenantId,
    paddock_id: 0,
    date_applied: "",
    product: "",
    rate: "",
    notes: "",
  });

  /* Load paddocks + head totals */
  async function loadPaddocks() {
    try {
      setLoadingPads(true);
      const rows: Paddock[] = await paddocksApi(tenantId, "listWithCounts");
      setPaddocks(rows || []);
      const herd = (rows || []).reduce((sum, p) => sum + (p.head_count || 0), 0);
      setHeadTotal(herd);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to load paddocks");
    } finally {
      setLoadingPads(false);
    }
  }

  useEffect(() => {
    if (!tenantId) return;
    loadPaddocks().catch(() => {});
  }, [tenantId]);

  /* When opening editor for a paddock, fetch rows */
  async function openPadEditor(p: Paddock) {
    try {
      setActivePad(p);
      setBusyEditor(true);
      const [seed, amds] = await Promise.all([
        paddocksApi(tenantId, "listSeeding", { paddock_id: p.id }),
        paddocksApi(tenantId, "listAmendments", { paddock_id: p.id }),
      ]);
      setSeedRows(seed || []);
      setAmendRows(amds || []);
      setMixDraft({
        tenant_id: tenantId,
        paddock_id: p.id,
        date_planted: "",
        mix_name: "",
        mix_items: [{ ...emptyMixItem }],
        notes: "",
      });
      setAmendDraft({
        tenant_id: tenantId,
        paddock_id: p.id,
        date_applied: "",
        product: "",
        rate: "",
        notes: "",
      });
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to load seeding/amendments");
    } finally {
      setBusyEditor(false);
    }
  }

  function closePadEditor() {
    setActivePad(null);
    setSeedRows([]);
    setAmendRows([]);
  }

  /* Save seeding (mix) */
  async function saveSeeding() {
    if (!activePad) return;
    try {
      setBusyEditor(true);
      const payload = {
        paddock_id: activePad.id,
        date_planted: mixDraft.date_planted || null,
        mix_name: (mixDraft.mix_name || "").trim() || null,
        mix_items: (mixDraft.mix_items || []).filter((i) => i.species.trim() !== ""),
        notes: (mixDraft.notes || "").trim() || null,
      };
      await paddocksApi(tenantId, "upsertSeeding", { payload });
      const seed = await paddocksApi(tenantId, "listSeeding", { paddock_id: activePad.id });
      setSeedRows(seed || []);
      // reset draft
      setMixDraft({
        tenant_id: tenantId,
        paddock_id: activePad.id,
        date_planted: "",
        mix_name: "",
        mix_items: [{ ...emptyMixItem }],
        notes: "",
      });
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to save seeding");
    } finally {
      setBusyEditor(false);
    }
  }

  async function deleteSeeding(id: number) {
    if (!activePad) return;
    if (!confirm("Delete this seeding record?")) return;
    try {
      setBusyEditor(true);
      await paddocksApi(tenantId, "deleteSeeding", { id });
      const seed = await paddocksApi(tenantId, "listSeeding", { paddock_id: activePad.id });
      setSeedRows(seed || []);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to delete seeding");
    } finally {
      setBusyEditor(false);
    }
  }

  /* Save amendment */
  async function saveAmendment() {
    if (!activePad) return;
    try {
      setBusyEditor(true);
      const payload = {
        paddock_id: activePad.id,
        date_applied: amendDraft.date_applied || null,
        product: (amendDraft.product || "").trim(),
        rate: (amendDraft.rate || "").trim() || null,
        notes: (amendDraft.notes || "").trim() || null,
      };
      if (!payload.product) {
        alert("Product is required");
        setBusyEditor(false);
        return;
      }
      await paddocksApi(tenantId, "upsertAmendment", { payload });
      const amds = await paddocksApi(tenantId, "listAmendments", { paddock_id: activePad.id });
      setAmendRows(amds || []);
      setAmendDraft({
        tenant_id: tenantId,
        paddock_id: activePad.id,
        date_applied: "",
        product: "",
        rate: "",
        notes: "",
      });
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to save amendment");
    } finally {
      setBusyEditor(false);
    }
  }

  async function deleteAmendment(id: number) {
    if (!activePad) return;
    if (!confirm("Delete this amendment?")) return;
    try {
      setBusyEditor(true);
      await paddocksApi(tenantId, "deleteAmendment", { id });
      const amds = await paddocksApi(tenantId, "listAmendments", { paddock_id: activePad.id });
      setAmendRows(amds || []);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to delete amendment");
    } finally {
      setBusyEditor(false);
    }
  }

  /* Planner calcs */
  const herdDMRequiredLbPerDay = useMemo(() => {
    const w = Number(avgWeight) || 0;
    const i = Number(intakePctBW) || 0;
    return Math.round((headTotal * w * i) / 100);
  }, [avgWeight, intakePctBW, headTotal]);

  const totalGrownLbPerDay = useMemo(() => {
    // total acres * growth rate
    const acres = (paddocks || []).reduce((sum, p) => sum + (Number(p.acres) || 0), 0);
    const g = Number(growthLbPerAcrePerDay) || 0;
    return Math.round(acres * g);
  }, [paddocks, growthLbPerAcrePerDay]);

  const daysCovered = useMemo(() => {
    const dm = Number(standingDMLbPerAcre) || 0;
    const residual = Number(targetResidual) || 0;
    const acres = (paddocks || []).reduce((sum, p) => sum + (Number(p.acres) || 0), 0);
    const grazeableDM = Math.max(dm - residual, 0) * acres;
    const needPerDay = herdDMRequiredLbPerDay || 1;
    return Math.max(Math.floor(grazeableDM / needPerDay), 0);
  }, [standingDMLbPerAcre, targetResidual, paddocks, herdDMRequiredLbPerDay]);

  /* ───────────────────────── UI ───────────────────────── */
  return (
    <Card>
      <CardHeader>
        <CardTitle>Grazing & Feed Planner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ───────── Planner (top) ───────── */}
        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <Label>Horizon (days)</Label>
            <Input
              type="number"
              value={horizonDays}
              onChange={(e) => setHorizonDays(e.target.value)}
            />
          </div>
          <div>
            <Label>Growth (lb DM/ac/day)</Label>
            <Input
              type="number"
              value={growthLbPerAcrePerDay}
              onChange={(e) => setGrowthLbPerAcrePerDay(e.target.value)}
            />
          </div>
          <div>
            <Label>Target Residual (lb DM/ac)</Label>
            <Input
              type="number"
              value={targetResidual}
              onChange={(e) => setTargetResidual(e.target.value)}
            />
          </div>
          <div>
            <Label>Intake % BW</Label>
            <Input
              type="number"
              step="0.1"
              value={intakePctBW}
              onChange={(e) => setIntakePctBW(e.target.value)}
            />
          </div>
          <div>
            <Label>Standing DM (lb/ac)</Label>
            <Input
              type="number"
              value={standingDMLbPerAcre}
              onChange={(e) => setStandingDMLbPerAcre(e.target.value)}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3 bg-white/70">
            <div className="text-xs text-slate-500">Herd average weight</div>
            <Input
              type="number"
              value={avgWeight}
              onChange={(e) => setAvgWeight(e.target.value)}
            />
          </div>
          <div className="border rounded-lg p-3 bg-white/70">
            <div className="text-xs text-slate-500">Herd DM need (lb/day)</div>
            <div className="text-lg font-semibold">{herdDMRequiredLbPerDay.toLocaleString()}</div>
          </div>
          <div className="border rounded-lg p-3 bg-white/70">
            <div className="text-xs text-slate-500">Grown across farm (lb/day)</div>
            <div className="text-lg font-semibold">{totalGrownLbPerDay.toLocaleString()}</div>
          </div>
          <div className="border rounded-lg p-3 bg-white/70">
            <div className="text-xs text-slate-500">Days covered (standing DM)</div>
            <div className="text-lg font-semibold">{daysCovered} days</div>
          </div>
        </div>

        {/* ───────── Paddock list with head counts ───────── */}
        <div className="mt-2 border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
            <div className="text-sm font-medium">
              Paddocks ({paddocks.length}) • Herd: {headTotal} head
            </div>
            <Button variant="outline" size="sm" onClick={loadPaddocks} disabled={loadingPads}>
              {loadingPads ? "Loading…" : "Refresh"}
            </Button>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2">Paddock</th>
                <th className="text-left p-2">Acres</th>
                <th className="text-left p-2">Zone</th>
                <th className="text-left p-2">Head</th>
                <th className="text-left p-2">Notes</th>
                <th className="text-right p-2 w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paddocks.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2">{p.acres}</td>
                  <td className="p-2">{p.zone || "-"}</td>
                  <td className="p-2">{p.head_count ?? 0}</td>
                  <td className="p-2">{p.notes || ""}</td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => openPadEditor(p)}>
                      Edit Seeding & Amendments
                    </Button>
                  </td>
                </tr>
              ))}
              {paddocks.length === 0 && (
                <tr>
                  <td className="p-2" colSpan={6}>No paddocks yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ───────── Inline editor for selected paddock ───────── */}
        {activePad && (
          <div className="border rounded-xl p-4 bg-white/80">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                {activePad.name} — Seeding & Amendments
              </div>
              <Button variant="outline" size="sm" onClick={closePadEditor}>
                Close
              </Button>
            </div>

            {/* Seeding (mix builder) */}
            <div className="mt-4">
              <div className="font-medium mb-2">Seeding / Reseeding</div>

              <div className="grid md:grid-cols-4 gap-2">
                <div>
                  <Label>Date Planted</Label>
                  <Input
                    type="date"
                    value={mixDraft.date_planted || ""}
                    onChange={(e) => setMixDraft({ ...mixDraft, date_planted: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Mix Name</Label>
                  <Input
                    value={mixDraft.mix_name || ""}
                    onChange={(e) => setMixDraft({ ...mixDraft, mix_name: e.target.value })}
                    placeholder="e.g., Spring Pasture Mix"
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <textarea
                    value={mixDraft.notes || ""}
                    onChange={(e) => setMixDraft({ ...mixDraft, notes: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/5"
                    placeholder="optional"
                  />
                </div>
              </div>

              {/* Mix items */}
              <div className="mt-3 border rounded-lg p-3">
                <div className="text-sm font-medium mb-2">Mix Items</div>
                <div className="space-y-2">
                  {(mixDraft.mix_items || []).map((item, idx) => (
                    <div key={idx} className="grid md:grid-cols-6 gap-2 items-center">
                      <div className="md:col-span-4">
                        <Label>Species</Label>
                        <Input
                          value={item.species}
                          onChange={(e) => {
                            const next = [...(mixDraft.mix_items || [])];
                            next[idx] = { ...next[idx], species: e.target.value };
                            setMixDraft({ ...mixDraft, mix_items: next });
                          }}
                          placeholder="e.g., Orchardgrass"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Rate (lb/ac)</Label>
                        <Input
                          type="number"
                          value={item.rate_lb_ac}
                          onChange={(e) => {
                            const next = [...(mixDraft.mix_items || [])];
                            next[idx] = {
                              ...next[idx],
                              rate_lb_ac: Number(e.target.value || 0),
                            };
                            setMixDraft({ ...mixDraft, mix_items: next });
                          }}
                          placeholder="e.g., 8"
                        />
                      </div>
                      <div className="md:col-span-6 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const next = [...(mixDraft.mix_items || [])];
                            next.splice(idx, 1);
                            setMixDraft({
                              ...mixDraft,
                              mix_items: next.length ? next : [{ species: "", rate_lb_ac: 0 }],
                            });
                          }}
                        >
                          Remove Row
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMixDraft({
                        ...mixDraft,
                        mix_items: [...(mixDraft.mix_items || []), { species: "", rate_lb_ac: 0 }],
                      })
                    }
                  >
                    + Add Species
                  </Button>
                  <Button size="sm" onClick={saveSeeding} disabled={busyEditor}>
                    {busyEditor ? "Saving…" : "Save Seeding"}
                  </Button>
                </div>
              </div>

              {/* Seeding history */}
              <div className="mt-3 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Mix</th>
                      <th className="text-left p-2">Species & Rates</th>
                      <th className="text-left p-2">Notes</th>
                      <th className="text-right p-2 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seedRows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.date_planted || ""}</td>
                        <td className="p-2">{r.mix_name || "-"}</td>
                        <td className="p-2">
                          {Array.isArray(r.mix_items) && r.mix_items.length > 0 ? (
                            <ul className="list-disc ml-4">
                              {r.mix_items.map((it, i) => (
                                <li key={i}>
                                  {it.species} — {it.rate_lb_ac} lb/ac
                                </li>
                              ))}
                            </ul>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-2">{r.notes || ""}</td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => r.id && deleteSeeding(r.id)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {seedRows.length === 0 && (
                      <tr>
                        <td className="p-2" colSpan={5}>
                          No seeding records yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Amendments */}
            <div className="mt-6">
              <div className="font-medium mb-2">Fertilizer & Lime Amendments</div>

              <div className="grid md:grid-cols-5 gap-2">
                <div>
                  <Label>Date Applied</Label>
                  <Input
                    type="date"
                    value={amendDraft.date_applied || ""}
                    onChange={(e) => setAmendDraft({ ...amendDraft, date_applied: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Product</Label>
                  <Input
                    value={amendDraft.product || ""}
                    onChange={(e) => setAmendDraft({ ...amendDraft, product: e.target.value })}
                    placeholder="e.g., Urea, Lime"
                  />
                </div>
                <div>
                  <Label>Rate</Label>
                  <Input
                    value={amendDraft.rate || ""}
                    onChange={(e) => setAmendDraft({ ...amendDraft, rate: e.target.value })}
                    placeholder="e.g., 200 lb/ac or 2 ton/ac"
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <textarea
                    value={amendDraft.notes || ""}
                    onChange={(e) => setAmendDraft({ ...amendDraft, notes: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/5"
                    placeholder="optional"
                  />
                </div>
                <div className="md:col-span-5">
                  <Button size="sm" onClick={saveAmendment} disabled={busyEditor}>
                    {busyEditor ? "Saving…" : "Save Amendment"}
                  </Button>
                </div>
              </div>

              <div className="mt-3 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Rate</th>
                      <th className="text-left p-2">Notes</th>
                      <th className="text-right p-2 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amendRows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.date_applied || ""}</td>
                        <td className="p-2">{r.product}</td>
                        <td className="p-2">{r.rate || ""}</td>
                        <td className="p-2">{r.notes || ""}</td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => r.id && deleteAmendment(r.id)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {amendRows.length === 0 && (
                      <tr>
                        <td className="p-2" colSpan={5}>
                          No amendment records yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

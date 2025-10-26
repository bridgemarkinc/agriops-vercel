"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* Types */
type Paddock = {
  id: number;
  tenant_id: string;
  name: string;
  acres: number | null;
  zone: string | null;
  notes: string | null;
  forage_dm_lb_ac?: number | null;
  util_pct?: number | null;
  rest_days?: number | null;
  head_count?: number | null;
};
type MixItem = { species: string; rate_lb_ac: number };
type SeedingRow = {
  id?: number;
  tenant_id: string;
  paddock_id: number;
  date_planted: string | null;
  mix_name: string | null;
  mix_items: MixItem[];
  notes?: string | null;
};
type AmendmentRow = {
  id?: number;
  tenant_id: string;
  paddock_id: number;
  date_applied: string | null;
  product: string;
  rate: string | null;
  notes?: string | null;
};

/* API helper */
async function paddocksApi(action: string, body?: any) {
  const res = await fetch("/api/paddocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(body || {}) }),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}: ${raw?.slice(0,120)}`);
  return json.data;
}

export default function PastureMaintenance({ tenantId }: { tenantId: string }) {
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [loadingPads, setLoadingPads] = useState(false);
  const [activePad, setActivePad] = useState<Paddock | null>(null);

  const [seedRows, setSeedRows] = useState<SeedingRow[]>([]);
  const [amendRows, setAmendRows] = useState<AmendmentRow[]>([]);
  const [busyEditor, setBusyEditor] = useState(false);

  const emptyMixItem: MixItem = { species: "", rate_lb_ac: 0 };
  const [mixDraft, setMixDraft] = useState<SeedingRow>({
    tenant_id: tenantId,
    paddock_id: 0,
    date_planted: "",
    mix_name: "",
    mix_items: [{ ...emptyMixItem }],
    notes: "",
  });
  const [amendDraft, setAmendDraft] = useState<AmendmentRow>({
    tenant_id: tenantId,
    paddock_id: 0,
    date_applied: "",
    product: "",
    rate: "",
    notes: "",
  });

  const herdHead = useMemo(
    () => (paddocks || []).reduce((s, p) => s + (Number(p.head_count || 0)), 0),
    [paddocks]
  );

  async function loadPaddocks() {
    try {
      setLoadingPads(true);
      const rows: Paddock[] = await paddocksApi("listWithCounts", { tenant_id: tenantId });
      setPaddocks(rows || []);
    } catch (e: any) {
      alert(e.message || "Failed to load paddocks");
    } finally {
      setLoadingPads(false);
    }
  }

  useEffect(() => {
    if (!tenantId) return;
    loadPaddocks().catch(() => {});
  }, [tenantId]);

  async function openPadEditor(p: Paddock) {
    try {
      setActivePad(p);
      setBusyEditor(true);
      const [seed, amds] = await Promise.all([
        paddocksApi("listSeeding", { tenant_id: tenantId, paddock_id: p.id }),
        paddocksApi("listAmendments", { tenant_id: tenantId, paddock_id: p.id }),
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

  /* Save Seeding — ALWAYS send mix_items array */
  async function saveSeeding() {
    if (!activePad) return;
    try {
      setBusyEditor(true);
      const payload = {
        paddock_id: activePad.id,
        date_planted: mixDraft.date_planted || null,
        mix_name: (mixDraft.mix_name || "").trim() || null,
        mix_items: Array.isArray(mixDraft.mix_items)
          ? (mixDraft.mix_items as MixItem[])
              .map((item: MixItem) => ({
                species: String(item?.species ?? "").trim(),
                rate_lb_ac: Number(item?.rate_lb_ac ?? 0),
              }))
              .filter((mi: MixItem) => mi.species !== "")
          : [],
        notes: (mixDraft.notes || "").trim() || null,
      };
      await paddocksApi("upsertSeeding", { tenant_id: tenantId, payload });
      const seed: SeedingRow[] = await paddocksApi("listSeeding", { tenant_id: tenantId, paddock_id: activePad.id });
      setSeedRows(seed || []);
      setMixDraft({
        tenant_id: tenantId,
        paddock_id: activePad.id,
        date_planted: "",
        mix_name: "",
        mix_items: [{ ...emptyMixItem }],
        notes: "",
      });
    } catch (e: any) {
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
      await paddocksApi("deleteSeeding", { tenant_id: tenantId, id });
      const seed: SeedingRow[] = await paddocksApi("listSeeding", { tenant_id: tenantId, paddock_id: activePad.id });
      setSeedRows(seed || []);
    } catch (e: any) {
      alert(e.message || "Failed to delete seeding");
    } finally {
      setBusyEditor(false);
    }
  }

  /* Save Amendment */
  async function saveAmendment() {
    if (!activePad) return;
    if (!amendDraft.product?.trim()) return alert("Product is required");
    try {
      setBusyEditor(true);
      const payload = {
        paddock_id: activePad.id,
        date_applied: amendDraft.date_applied || null,
        product: (amendDraft.product || "").trim(),
        rate: (amendDraft.rate || "").trim() || null,
        notes: (amendDraft.notes || "").trim() || null,
      };
      await paddocksApi("upsertAmendment", { tenant_id: tenantId, payload });
      const amds: AmendmentRow[] = await paddocksApi("listAmendments", { tenant_id: tenantId, paddock_id: activePad.id });
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
      await paddocksApi("deleteAmendment", { tenant_id: tenantId, id });
      const amds: AmendmentRow[] = await paddocksApi("listAmendments", { tenant_id: tenantId, paddock_id: activePad.id });
      setAmendRows(amds || []);
    } catch (e: any) {
      alert(e.message || "Failed to delete amendment");
    } finally {
      setBusyEditor(false);
    }
  }

  /* Update paddock zone/notes inline */
  async function savePaddockMeta(p: Paddock) {
    try {
      await paddocksApi("upsertPaddock", {
        tenant_id: tenantId,
        row: {
          id: p.id,
          name: p.name,
          acres: p.acres,
          forage_dm_lb_ac: p.forage_dm_lb_ac,
          util_pct: p.util_pct,
          rest_days: p.rest_days,
          zone: p.zone,
          notes: p.notes,
        },
      });
      await loadPaddocks();
    } catch (e: any) {
      alert(e.message || "Failed to save paddock");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pasture Maintenance — Seeding & Amendments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Paddock list */}
        <div className="border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b">
            <div className="text-sm font-medium">
              Paddocks ({paddocks.length}) • Herd: {herdHead} head
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
                <th className="text-right p-2 w-64">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paddocks.map((p: Paddock) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2">{p.acres ?? "-"}</td>
                  <td className="p-2">
                    <Input
                      value={p.zone || ""}
                      onChange={(e) =>
                        setPaddocks((prev: Paddock[]) =>
                          prev.map((x: Paddock) => (x.id === p.id ? { ...x, zone: e.target.value } : x))
                        )
                      }
                      placeholder="zone"
                    />
                  </td>
                  <td className="p-2">{p.head_count ?? 0}</td>
                  <td className="p-2">
                    <Input
                      value={p.notes || ""}
                      onChange={(e) =>
                        setPaddocks((prev: Paddock[]) =>
                          prev.map((x: Paddock) => (x.id === p.id ? { ...x, notes: e.target.value } : x))
                        )
                      }
                      placeholder="notes"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openPadEditor(p)}>
                        Edit Seeding & Amendments
                      </Button>
                      <Button size="sm" onClick={() => savePaddockMeta(p)}>
                        Save Meta
                      </Button>
                    </div>
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

        {/* Editor */}
        {activePad && (
          <div className="border rounded-xl p-4 bg-white/80">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                {activePad.name} — Seeding & Amendments
              </div>
              <Button variant="outline" size="sm" onClick={closePadEditor}>Close</Button>
            </div>

            {/* Seeding */}
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
                  />
                </div>
              </div>

              <div className="mt-3 border rounded-lg p-3">
                <div className="text-sm font-medium mb-2">Mix Items</div>
                <div className="space-y-2">
                  {(mixDraft.mix_items || []).map((item: MixItem, idx: number) => (
                    <div key={idx} className="grid md:grid-cols-6 gap-2 items-center">
                      <div className="md:col-span-4">
                        <Label>Species</Label>
                        <Input
                          value={item.species}
                          onChange={(e) => {
                            const next: MixItem[] = [...(mixDraft.mix_items || [])];
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
                            const next: MixItem[] = [...(mixDraft.mix_items || [])];
                            next[idx] = { ...next[idx], rate_lb_ac: Number(e.target.value || 0) };
                            setMixDraft({ ...mixDraft, mix_items: next });
                          }}
                        />
                      </div>
                      <div className="md:col-span-6 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const next: MixItem[] = [...(mixDraft.mix_items || [])];
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
                    {seedRows.map((r: SeedingRow) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.date_planted || ""}</td>
                        <td className="p-2">{r.mix_name || "-"}</td>
                        <td className="p-2">
                          {Array.isArray(r.mix_items) && r.mix_items.length > 0 ? (
                            <ul className="list-disc ml-4">
                              {r.mix_items.map((it: MixItem, i: number) => (
                                <li key={i}>{it.species} — {it.rate_lb_ac} lb/ac</li>
                              ))}
                            </ul>
                          ) : "-"}
                        </td>
                        <td className="p-2">{r.notes || ""}</td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => r.id && deleteSeeding(r.id!)}>
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {seedRows.length === 0 && (
                      <tr><td className="p-2" colSpan={5}>No seeding records yet.</td></tr>
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
                    {amendRows.map((r: AmendmentRow) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.date_applied || ""}</td>
                        <td className="p-2">{r.product}</td>
                        <td className="p-2">{r.rate || ""}</td>
                        <td className="p-2">{r.notes || ""}</td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => r.id && deleteAmendment(r.id!)}>
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {amendRows.length === 0 && (
                      <tr><td className="p-2" colSpan={5}>No amendment records yet.</td></tr>
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

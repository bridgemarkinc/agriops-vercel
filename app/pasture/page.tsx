"use client";

import React, { useEffect, useState } from "react";

/* ───────────────────── Minimal local inputs (no external UI deps) ───────────────────── */
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={
        "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm " +
        "placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/5 " +
        className
      }
    />
  );
}
function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "outline"; size?: "sm" | "md" }
) {
  const { className = "", variant = "solid", size = "md", ...rest } = props;
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/5";
  const v =
    variant === "outline"
      ? "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
      : "bg-slate-900 text-white hover:bg-slate-800";
  const s = size === "sm" ? "h-8 px-2" : "h-10 px-4";
  return <button {...rest} className={[base, v, s, className].join(" ")} />;
}
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={["rounded-xl border bg-white shadow-sm", className].join(" ")}>{children}</div>;
}
function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 border-b bg-white/70 rounded-t-xl">{children}</div>;
}
function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-base font-semibold">{children}</div>;
}
function CardContent({ children }: { children: React.ReactNode }) {
  return <div className="p-4">{children}</div>;
}
function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <label className={["text-sm font-medium text-slate-700", className].join(" ")}>{children}</label>;
}
function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { rows?: number }
) {
  const { className = "", rows = 4, ...rest } = props;
  return (
    <textarea
      {...rest}
      rows={rows}
      className={
        "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/5 " +
        className
      }
    />
  );
}

/* ───────────────────── Utilities ───────────────────── */
function getDefaultTenant(): string {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return process.env.NEXT_PUBLIC_TENANT || window.location.hostname;
  }
  return process.env.NEXT_PUBLIC_TENANT || "demo";
}
async function api<T = any>(action: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/paddocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(body || {}) }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
  return json.data as T;
}

/* ───────────────────── Types (match your /api/paddocks) ───────────────────── */
type PaddockRow = {
  id: number;
  tenant_id: string;
  name: string;
  acres: number;
  zone?: string | null;
  notes?: string | null;
  heads?: number; // provided by listWithCounts
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
  created_at?: string;
  updated_at?: string;
};

type AmendmentRow = {
  id?: number;
  tenant_id: string;
  paddock_id: number;
  date_applied: string | null;
  product: string;
  rate?: string | null; // e.g., "200 lb/ac"
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

/* ───────────────────── Page Component ───────────────────── */
export default function PastureMaintenancePage() {
  const [tenantId] = useState<string>(getDefaultTenant());

  // Left: paddocks
  const [paddocks, setPaddocks] = useState<PaddockRow[]>([]);
  const [pLoading, setPLoading] = useState<boolean>(false);
  const [selected, setSelected] = useState<PaddockRow | null>(null);

  // Right: inner tab
  const [rightTab, setRightTab] = useState<"seeding" | "amendments">("seeding");

  // Seeding
  const [seedRows, setSeedRows] = useState<SeedingRow[]>([]);
  const [seedLoading, setSeedLoading] = useState<boolean>(false);

  const emptyMix: SeedingRow = {
    tenant_id: tenantId,
    paddock_id: 0,
    date_planted: "",
    mix_name: "",
    mix_items: [],
    notes: "",
  };
  const [mixDraft, setMixDraft] = useState<SeedingRow>(emptyMix);
  const [editingMixId, setEditingMixId] = useState<number | null>(null);

  // Amendments
  const [amendRows, setAmendRows] = useState<AmendmentRow[]>([]);
  const [amendLoading, setAmendLoading] = useState<boolean>(false);

  const emptyAmend: AmendmentRow = {
    tenant_id: tenantId,
    paddock_id: 0,
    date_applied: "",
    product: "",
    rate: "",
    notes: "",
  };
  const [amendDraft, setAmendDraft] = useState<AmendmentRow>(emptyAmend);
  const [editingAmendId, setEditingAmendId] = useState<number | null>(null);

  /* Loaders */
  async function loadPaddocks() {
    setPLoading(true);
    try {
      const data = await api<PaddockRow[]>("listWithCounts", { tenant_id: tenantId });
      setPaddocks(Array.isArray(data) ? data : []);
    } catch (e: any) {
      alert(e.message || "Failed to load paddocks");
    } finally {
      setPLoading(false);
    }
  }
  async function loadSeeding(paddockId: number) {
    setSeedLoading(true);
    try {
      const data = await api<SeedingRow[]>("listSeeding", { tenant_id: tenantId, paddock_id: paddockId });
      setSeedRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      alert(e.message || "Failed to load seeding");
    } finally {
      setSeedLoading(false);
    }
  }
  async function loadAmendments(paddockId: number) {
    setAmendLoading(true);
    try {
      const data = await api<AmendmentRow[]>("listAmendments", { tenant_id: tenantId, paddock_id: paddockId });
      setAmendRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      alert(e.message || "Failed to load amendments");
    } finally {
      setAmendLoading(false);
    }
  }

  function openPaddock(p: PaddockRow) {
    setSelected(p);
    setRightTab("seeding");
    setMixDraft({ ...emptyMix, paddock_id: p.id });
    setEditingMixId(null);
    setAmendDraft({ ...emptyAmend, paddock_id: p.id });
    setEditingAmendId(null);
    loadSeeding(p.id);
    loadAmendments(p.id);
  }

  useEffect(() => {
    loadPaddocks().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  /* Seeding handlers */
  function addMixItem() {
    setMixDraft((prev) => ({ ...prev, mix_items: [...(prev.mix_items || []), { species: "", rate_lb_ac: 0 }] }));
  }
  function updateMixItem(index: number, field: "species" | "rate_lb_ac", value: string) {
    setMixDraft((prev) => {
      const next = [...(prev.mix_items || [])];
      if (!next[index]) next[index] = { species: "", rate_lb_ac: 0 };
      if (field === "species") next[index].species = value;
      else next[index].rate_lb_ac = Number(value || 0);
      return { ...prev, mix_items: next };
    });
  }
  function removeMixItem(index: number) {
    setMixDraft((prev) => {
      const next = [...(prev.mix_items || [])];
      next.splice(index, 1);
      return { ...prev, mix_items: next };
    });
  }
  async function saveSeeding() {
    if (!selected) return;
    if (!mixDraft.mix_items?.length) return alert("Add at least one species.");
    const payload: SeedingRow = {
      ...mixDraft,
      tenant_id: tenantId,
      paddock_id: selected.id,
      id: editingMixId || undefined,
      date_planted: mixDraft.date_planted || "",
      mix_name: mixDraft.mix_name || "",
      notes: mixDraft.notes || "",
    };
    try {
      await api("upsertSeeding", { row: payload });
      setMixDraft({ ...emptyMix, paddock_id: selected.id });
      setEditingMixId(null);
      await loadSeeding(selected.id);
    } catch (e: any) {
      alert(e.message || "Failed to save seeding");
    }
  }
  function editSeedingRow(row: SeedingRow) {
    setEditingMixId(row.id || null);
    setMixDraft({
      tenant_id: tenantId,
      paddock_id: row.paddock_id,
      date_planted: row.date_planted || "",
      mix_name: row.mix_name || "",
      mix_items: Array.isArray(row.mix_items) ? [...row.mix_items] : [],
      notes: row.notes || "",
      id: row.id,
    });
    setRightTab("seeding");
  }
  async function deleteSeedingRow(row: SeedingRow) {
    if (!row.id) return;
    if (!confirm("Delete this seeding entry?")) return;
    try {
      await api("deleteSeeding", { id: row.id, tenant_id: tenantId });
      if (selected) await loadSeeding(selected.id);
    } catch (e: any) {
      alert(e.message || "Failed to delete seeding");
    }
  }

  /* Amendment handlers */
  async function saveAmendment() {
    if (!selected) return;
    if (!amendDraft.product.trim()) return alert("Product is required.");
    const payload: AmendmentRow = {
      ...amendDraft,
      tenant_id: tenantId,
      paddock_id: selected.id,
      id: editingAmendId || undefined,
      date_applied: amendDraft.date_applied || "",
      rate: amendDraft.rate || "",
      notes: amendDraft.notes || "",
    };
    try {
      await api("upsertAmendment", { row: payload });
      setAmendDraft({ ...emptyAmend, paddock_id: selected.id });
      setEditingAmendId(null);
      await loadAmendments(selected.id);
    } catch (e: any) {
      alert(e.message || "Failed to save amendment");
    }
  }
  function editAmendmentRow(row: AmendmentRow) {
    setEditingAmendId(row.id || null);
    setAmendDraft({
      tenant_id: tenantId,
      paddock_id: row.paddock_id,
      date_applied: row.date_applied || "",
      product: row.product || "",
      rate: row.rate || "",
      notes: row.notes || "",
      id: row.id,
    });
    setRightTab("amendments");
  }
  async function deleteAmendmentRow(row: AmendmentRow) {
    if (!row.id) return;
    if (!confirm("Delete this amendment entry?")) return;
    try {
      await api("deleteAmendment", { id: row.id, tenant_id: tenantId });
      if (selected) await loadAmendments(selected.id);
    } catch (e: any) {
      alert(e.message || "Failed to delete amendment");
    }
  }

  /* ───────────────────── Render ───────────────────── */
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/blackriver-logo.png" alt="Black River" className="h-10 w-auto" />
            <div className="text-lg font-semibold">Pasture Maintenance</div>
          </div>
          <div className="inline-flex items-center gap-2 bg-slate-100 p-1 rounded-full">
            <a
              href="/"
              className="px-4 py-2 rounded-full text-sm font-medium bg-white text-slate-600 border border-slate-200 hover:text-slate-900"
            >
              Back to Planner
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6 grid md:grid-cols-3 gap-6">
        {/* Paddocks */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Paddocks {pLoading ? "— Loading…" : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {paddocks.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openPaddock(p)}
                  className={[
                    "w-full text-left border rounded-lg p-3 bg-white/70 hover:bg-slate-50 transition",
                    selected?.id === p.id ? "ring-2 ring-emerald-500" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.heads ?? 0} head</div>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {p.acres} ac {p.zone ? `• Zone ${p.zone}` : ""} {p.notes ? `• ${p.notes}` : ""}
                  </div>
                </button>
              ))}
              {paddocks.length === 0 && <div className="text-sm text-slate-600">No paddocks yet.</div>}
            </div>
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>
              {selected ? (
                <>
                  Edit: <span className="font-mono">{selected.name}</span>
                  <span className="text-sm font-normal text-slate-500"> — {selected.acres} ac</span>
                </>
              ) : (
                "Select a paddock"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="text-sm text-slate-600">Choose a paddock on the left to edit Seeding & Amendments.</div>
            ) : (
              <>
                {/* Right inner tabs */}
                <div className="mb-4">
                  <div className="inline-flex items-center gap-2 bg-slate-100 p-1 rounded-full">
                    <Button
                      type="button"
                      variant={rightTab === "seeding" ? "solid" : "outline"}
                      onClick={() => setRightTab("seeding")}
                    >
                      Seeding
                    </Button>
                    <Button
                      type="button"
                      variant={rightTab === "amendments" ? "solid" : "outline"}
                      onClick={() => setRightTab("amendments")}
                    >
                      Amendments
                    </Button>
                  </div>
                </div>

                {rightTab === "seeding" && (
                  <div className="space-y-6">
                    {/* Mix editor */}
                    <div className="border rounded-xl p-4 bg-white/80">
                      <div className="text-sm font-semibold text-slate-700 mb-2">
                        {editingMixId ? "Edit Seed Mix" : "Add Seed Mix"}
                      </div>
                      <div className="grid md:grid-cols-3 gap-3">
                        <div>
                          <Label>Date Planted</Label>
                          <Input
                            type="date"
                            value={mixDraft.date_planted || ""}
                            onChange={(e) => setMixDraft({ ...mixDraft, date_planted: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Mix Name</Label>
                          <Input
                            value={mixDraft.mix_name || ""}
                            onChange={(e) => setMixDraft({ ...mixDraft, mix_name: e.target.value })}
                            placeholder="e.g., Spring Cool-Season Mix"
                          />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Input
                            value={mixDraft.notes || ""}
                            onChange={(e) => setMixDraft({ ...mixDraft, notes: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <Label className="mb-2 block">Species & Rates (lb/ac)</Label>
                        <div className="space-y-2">
                          {(mixDraft.mix_items || []).map((it, i) => (
                            <div key={i} className="grid md:grid-cols-5 gap-2 items-center">
                              <div className="md:col-span-3">
                                <Input
                                  placeholder="Species (e.g., Orchardgrass)"
                                  value={it.species}
                                  onChange={(e) => updateMixItem(i, "species", e.target.value)}
                                />
                              </div>
                              <div>
                                <Input
                                  type="number"
                                  placeholder="Rate lb/ac"
                                  value={String(it.rate_lb_ac)}
                                  onChange={(e) => updateMixItem(i, "rate_lb_ac", e.target.value)}
                                />
                              </div>
                              <div>
                                <Button type="button" variant="outline" onClick={() => removeMixItem(i)} className="w-full">
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))}
                          <Button type="button" variant="outline" onClick={addMixItem}>
                            + Add Species
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Button onClick={saveSeeding}>{editingMixId ? "Save Changes" : "Add Mix"}</Button>
                        {editingMixId && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (!selected) return;
                              setEditingMixId(null);
                              setMixDraft({ ...emptyMix, paddock_id: selected.id });
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Existing mixes */}
                    <div className="border rounded-xl p-4 bg-white/80">
                      <div className="text-sm font-semibold text-slate-700 mb-2">
                        Existing Mixes {seedLoading ? "— Loading…" : ""}
                      </div>
                      <div className="overflow-auto border rounded">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left p-2">Date</th>
                              <th className="text-left p-2">Mix</th>
                              <th className="text-left p-2">Species (lb/ac)</th>
                              <th className="text-left p-2">Notes</th>
                              <th className="text-right p-2 w-36">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {seedRows.map((r) => (
                              <tr key={r.id} className="border-t align-top">
                                <td className="p-2">{r.date_planted || ""}</td>
                                <td className="p-2">{r.mix_name || ""}</td>
                                <td className="p-2">
                                  {Array.isArray(r.mix_items) && r.mix_items.length > 0 ? (
                                    <ul className="list-disc ml-5">
                                      {r.mix_items.map((mi, idx) => (
                                        <li key={idx}>
                                          {mi.species} — {mi.rate_lb_ac} lb/ac
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </td>
                                <td className="p-2">{r.notes || ""}</td>
                                <td className="p-2 text-right">
                                  <div className="flex gap-2 justify-end">
                                    <Button size="sm" variant="outline" onClick={() => editSeedingRow(r)}>
                                      Edit
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => deleteSeedingRow(r)}>
                                      Delete
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {seedRows.length === 0 && (
                              <tr>
                                <td className="p-2" colSpan={5}>
                                  No seed mixes recorded yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {rightTab === "amendments" && (
                  <div className="space-y-6">
                    {/* Amendment editor */}
                    <div className="border rounded-xl p-4 bg-white/80">
                      <div className="text-sm font-semibold text-slate-700 mb-2">
                        {editingAmendId ? "Edit Amendment" : "Add Amendment"}
                      </div>
                      <div className="grid md:grid-cols-4 gap-3">
                        <div>
                          <Label>Date Applied</Label>
                          <Input
                            type="date"
                            value={amendDraft.date_applied || ""}
                            onChange={(e) => setAmendDraft({ ...amendDraft, date_applied: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Product</Label>
                          <Input
                            value={amendDraft.product || ""}
                            onChange={(e) => setAmendDraft({ ...amendDraft, product: e.target.value })}
                            placeholder="e.g., Pelletized lime"
                          />
                        </div>
                        <div>
                          <Label>Rate</Label>
                          <Input
                            value={amendDraft.rate || ""}
                            onChange={(e) => setAmendDraft({ ...amendDraft, rate: e.target.value })}
                            placeholder="e.g., 1 ton/ac"
                          />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Textarea
                            rows={4}
                            value={amendDraft.notes || ""}
                            onChange={(e) => setAmendDraft({ ...amendDraft, notes: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button onClick={saveAmendment}>{editingAmendId ? "Save Changes" : "Add Amendment"}</Button>
                        {editingAmendId && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (!selected) return;
                              setEditingAmendId(null);
                              setAmendDraft({ ...emptyAmend, paddock_id: selected.id });
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Existing amendments */}
                    <div className="border rounded-xl p-4 bg-white/80">
                      <div className="text-sm font-semibold text-slate-700 mb-2">
                        Existing Amendments {amendLoading ? "— Loading…" : ""}
                      </div>
                      <div className="overflow-auto border rounded">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="text-left p-2">Date</th>
                              <th className="text-left p-2">Product</th>
                              <th className="text-left p-2">Rate</th>
                              <th className="text-left p-2">Notes</th>
                              <th className="text-right p-2 w-36">Actions</th>
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
                                  <div className="flex gap-2 justify-end">
                                    <Button size="sm" variant="outline" onClick={() => editAmendmentRow(r)}>
                                      Edit
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => deleteAmendmentRow(r)}>
                                      Delete
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {amendRows.length === 0 && (
                              <tr>
                                <td className="p-2" colSpan={5}>
                                  No amendments recorded yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

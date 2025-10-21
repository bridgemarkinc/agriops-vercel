"use client";

import React from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Local, minimal textarea to avoid missing shadcn import */
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={[
        "flex min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm",
        "placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/5",
        className || "",
      ].join(" ")}
    />
  );
}

/* ───────────────────────── Supabase client (browser reads only) ───────────────────────── */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ───────────────────────── Types ───────────────────────── */
type Paddock = {
  id: number;
  tenant_id: string;
  name: string;
  area_ac: number | null;
  zone?: string | null;
  notes?: string | null;
};

type SeedMix = {
  id: number;
  tenant_id: string;
  name: string;
  notes?: string | null;
};

type SeedMixItem = {
  id: number;
  tenant_id: string;
  mix_id: number;
  species: string;
  lbs_per_ac: number;
};

type PaddockSeeding = {
  id?: number;
  tenant_id: string;
  paddock_id: number;
  seed_mix_id?: number | null;
  seeding_rate_lbs_ac?: number | null;
  fert_n_lb_ac?: number | null;
  fert_p_lb_ac?: number | null;
  fert_k_lb_ac?: number | null;
  lime_ton_ac?: number | null;
  last_seeded_date?: string | null;
  next_reseed_window?: string | null;
  notes?: string | null;
  // Optional per-paddock custom species
  custom_species?: Array<{ species: string; lbs_per_ac: number }>;
};

/* ───────────────────────── API helper (server writes) ───────────────────────── */
async function apiCare<T = any>(action: string, body: Record<string, any>) {
  const res = await fetch("/api/care", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
  return json.data as T;
}

/* ───────────────────────── Component ───────────────────────── */
export default function GrazingPlanner({ tenantId }: { tenantId: string }) {
  const [paddocks, setPaddocks] = React.useState<Paddock[]>([]);
  const [paddockCounts, setPaddockCounts] = React.useState<Record<string, number>>({});
  const [mixes, setMixes] = React.useState<SeedMix[]>([]);
  const [mixItems, setMixItems] = React.useState<Record<number, SeedMixItem[]>>({});
  const [loadingCounts, setLoadingCounts] = React.useState(false);

  // Planner inputs
  const [avgAnimalWt, setAvgAnimalWt] = React.useState(1200);
  const [intakePctBW, setIntakePctBW] = React.useState(2.5);
  const [growthLbDmAcDay, setGrowthLbDmAcDay] = React.useState(40);
  const [targetResidual, setTargetResidual] = React.useState(1500);
  const [horizonDays, setHorizonDays] = React.useState(7);

  // Drawer for paddock seeding/amendments
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [activePaddock, setActivePaddock] = React.useState<Paddock | null>(null);
  const [padForm, setPadForm] = React.useState<PaddockSeeding | null>(null);
  const [savingPad, setSavingPad] = React.useState(false);

  // Seed mix CRUD draft
  const [newMixName, setNewMixName] = React.useState("");
  const [newMixNotes, setNewMixNotes] = React.useState("");

  // Derived herd size from counts
  const herdSize = React.useMemo(
    () => Object.values(paddockCounts).reduce((a, b) => a + b, 0),
    [paddockCounts]
  );
  const herdIntakeLbPerDay = Math.round(herdSize * avgAnimalWt * (intakePctBW / 100));
  const totalArea = paddocks.reduce((sum, p) => sum + (p.area_ac || 0), 0);
  const dailyGrowthFeedLb = Math.round(totalArea * growthLbDmAcDay);
  const netBalanceLb = dailyGrowthFeedLb - herdIntakeLbPerDay;

  /* ───────── Loaders ───────── */
  async function loadPaddocks() {
    const { data, error } = await supabase
      .from("agriops_paddocks")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });
    if (!error) setPaddocks((data || []) as Paddock[]);
  }

  async function loadCounts() {
    setLoadingCounts(true);
    const { data, error } = await supabase
      .from("agriops_cattle")
      .select("current_paddock")
      .eq("tenant_id", tenantId);
    setLoadingCounts(false);
    if (error) return;

    const counts: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      const paddock = (row.current_paddock || "").trim();
      if (!paddock) return;
      counts[paddock] = (counts[paddock] || 0) + 1;
    });
    setPaddockCounts(counts);
  }

  async function loadMixes() {
    const data = await apiCare<SeedMix[]>("listSeedMixes", { tenant_id: tenantId });
    setMixes(data || []);
    // load mix items per mix
    const byMix: Record<number, SeedMixItem[]> = {};
    for (const m of data || []) {
      const items = await apiCare<SeedMixItem[]>("listSeedMixItems", {
        tenant_id: tenantId,
        mix_id: m.id,
      });
      byMix[m.id] = items || [];
    }
    setMixItems(byMix);
  }

  React.useEffect(() => {
    loadPaddocks();
    loadCounts();
    loadMixes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  /* ───────── Seed Mix CRUD ───────── */
  async function addMix() {
    if (!newMixName.trim()) return;
    await apiCare("upsertSeedMix", {
      tenant_id: tenantId,
      payload: { name: newMixName.trim(), notes: newMixNotes || null },
    });
    setNewMixName("");
    setNewMixNotes("");
    await loadMixes();
  }
  async function deleteMix(mixId: number) {
    if (!confirm("Delete this seed mix?")) return;
    await apiCare("deleteSeedMix", { tenant_id: tenantId, id: mixId });
    await loadMixes();
  }
  async function addMixItem(mixId: number) {
    const species = prompt("Species (e.g., Orchardgrass)")?.trim();
    if (!species) return;
    const lbsStr = prompt("Seeding rate (lbs/ac)")?.trim() || "0";
    const lbs = Number(lbsStr || 0);
    await apiCare("upsertSeedMixItem", {
      tenant_id: tenantId,
      payload: { mix_id: mixId, species, lbs_per_ac: lbs },
    });
    await loadMixes();
  }
  async function removeMixItem(itemId: number) {
    if (!confirm("Remove this species from the mix?")) return;
    await apiCare("deleteSeedMixItem", { tenant_id: tenantId, id: itemId });
    await loadMixes();
  }

  /* ───────── Paddock Drawer ───────── */
  async function openDrawer(p: Paddock) {
    setActivePaddock(p);
    // Load current seeding record for paddock
    const existing = await apiCare<PaddockSeeding | null>("getPaddockSeeding", {
      tenant_id: tenantId,
      paddock_id: p.id,
    });

    setPadForm(
      existing || {
        tenant_id: tenantId,
        paddock_id: p.id,
        seed_mix_id: null,
        seeding_rate_lbs_ac: null,
        fert_n_lb_ac: null,
        fert_p_lb_ac: null,
        fert_k_lb_ac: null,
        lime_ton_ac: null,
        last_seeded_date: null,
        next_reseed_window: null,
        notes: "",
        custom_species: [],
      }
    );
    setDrawerOpen(true);
  }

  function updatePadForm<K extends keyof PaddockSeeding>(key: K, val: PaddockSeeding[K]) {
    setPadForm((prev) => (prev ? { ...prev, [key]: val } : prev));
  }

  function addCustomSpecies() {
    setPadForm((prev) => {
      if (!prev) return prev;
      const next = [...(prev.custom_species || [])];
      next.push({ species: "", lbs_per_ac: 0 });
      return { ...prev, custom_species: next };
    });
  }
  function updateCustomSpecies(i: number, field: "species" | "lbs_per_ac", value: string) {
    setPadForm((prev) => {
      if (!prev) return prev;
      const next = [...(prev.custom_species || [])];
      const row = { ...next[i] };
      if (field === "species") row.species = value;
      else row.lbs_per_ac = Number(value || 0);
      next[i] = row;
      return { ...prev, custom_species: next };
    });
  }
  function removeCustomSpecies(i: number) {
    setPadForm((prev) => {
      if (!prev) return prev;
      const next = [...(prev.custom_species || [])];
      next.splice(i, 1);
      return { ...prev, custom_species: next };
    });
  }

  async function savePad() {
    if (!padForm) return;
    setSavingPad(true);
    try {
      await apiCare("savePaddockSeeding", {
        tenant_id: tenantId,
        payload: padForm,
      });
      setDrawerOpen(false);
    } catch (e: any) {
      alert(e.message || "Failed to save");
    } finally {
      setSavingPad(false);
    }
  }

  /* ───────────────────────── Render ───────────────────────── */
  return (
    <div className="space-y-6">
      {/* ───── Planner Summary ───── */}
      <Card>
        <CardHeader>
          <div className="pb-2">
            <CardTitle>AI Grazing & Feed Planner</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <Label>Herd Size (head)</Label>
                <Input
                  type="number"
                  value={herdSize}
                  onChange={(e) => {
                    // Herd size is derived from paddockCounts;
                    // If you want manual override, you can enable it here.
                    // For now we keep derived-only; no change on input.
                  }}
                  readOnly
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Derived from current_paddock assignments.
                </div>
              </div>
              <div>
                <Label>Avg Animal Wt (lb)</Label>
                <Input
                  type="number"
                  value={avgAnimalWt}
                  onChange={(e) => setAvgAnimalWt(Number(e.target.value || 0))}
                />
              </div>
              <div>
                <Label>Intake % BW</Label>
                <Input
                  type="number"
                  value={intakePctBW}
                  onChange={(e) => setIntakePctBW(Number(e.target.value || 0))}
                />
              </div>
              <div>
                <Label>Horizon (days)</Label>
                <Input
                  type="number"
                  value={horizonDays}
                  onChange={(e) => setHorizonDays(Number(e.target.value || 0))}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <Label>Target Residual (lb DM/ac)</Label>
                <Input
                  type="number"
                  value={targetResidual}
                  onChange={(e) => setTargetResidual(Number(e.target.value || 0))}
                />
              </div>
              <div>
                <Label>Growth (lb DM/ac/day)</Label>
                <Input
                  type="number"
                  value={growthLbDmAcDay}
                  onChange={(e) => setGrowthLbDmAcDay(Number(e.target.value || 0))}
                />
              </div>
              <div className="flex items-end text-sm text-slate-600">
                Total Area: <b className="ml-1">{totalArea.toFixed(1)}</b> ac
              </div>
              <div className="flex items-end">
                <Button variant="outline" size="sm" onClick={loadCounts} disabled={loadingCounts}>
                  {loadingCounts ? "Counting…" : "Refresh Head Counts"}
                </Button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 bg-white/70">
                <div className="text-sm">Herd Intake (lb/day)</div>
                <div className="text-xl font-semibold">{herdIntakeLbPerDay.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border p-3 bg-white/70">
                <div className="text-sm">Pasture Growth (lb/day)</div>
                <div className="text-xl font-semibold">{dailyGrowthFeedLb.toLocaleString()}</div>
              </div>
              <div className="rounded-lg border p-3 bg-white/70">
                <div className="text-sm">Balance (lb/day)</div>
                <div className={`text-xl font-semibold ${netBalanceLb >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {netBalanceLb.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───── Seed Mixes (create different mixes) ───── */}
      <Card>
        <CardHeader>
          <div className="pb-2">
            <CardTitle>Seed Mixes</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-3 mb-4">
            <div className="md:col-span-1">
              <Label>Mix Name</Label>
              <Input
                value={newMixName}
                onChange={(e) => setNewMixName(e.target.value)}
                placeholder="e.g., Cool-Season Blend"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={newMixNotes}
                onChange={(e) => setNewMixNotes(e.target.value)}
                placeholder="Optional notes about this mix"
              />
            </div>
            <div className="md:col-span-3">
              <Button onClick={addMix}>Add Seed Mix</Button>
            </div>
          </div>

          <div className="overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">Mix</th>
                  <th className="p-2 text-left">Notes</th>
                  <th className="p-2 text-left">Composition (lbs/ac)</th>
                  <th className="p-2 text-right w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mixes.map((m) => (
                  <tr key={m.id} className="border-t align-top">
                    <td className="p-2">{m.name}</td>
                    <td className="p-2 whitespace-pre-wrap">{m.notes}</td>
                    <td className="p-2">
                      <ul className="list-disc ml-5">
                        {(mixItems[m.id] || []).map((it) => (
                          <li key={it.id} className="flex items-center justify-between">
                            <span>
                              {it.species} — {it.lbs_per_ac} lbs/ac
                            </span>
                            <button
                              className="text-xs text-rose-700 hover:underline"
                              onClick={() => removeMixItem(it.id)}
                              title="Remove species"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2">
                        <Button size="sm" variant="outline" onClick={() => addMixItem(m.id)}>
                          + Add Species
                        </Button>
                      </div>
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="destructive" onClick={() => deleteMix(m.id)}>
                        Delete Mix
                      </Button>
                    </td>
                  </tr>
                ))}
                {mixes.length === 0 && (
                  <tr>
                    <td className="p-2" colSpan={4}>
                      No seed mixes yet. Create one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ───── Paddocks with head counts ───── */}
      <Card>
        <CardHeader>
          <div className="pb-2 flex items-center justify-between">
            <CardTitle>Paddocks</CardTitle>
            <div className="text-sm text-slate-600">
              Total Area: <b>{totalArea.toFixed(1)}</b> ac
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">Paddock</th>
                  <th className="p-2 text-left">Zone</th>
                  <th className="p-2 text-right">Area (ac)</th>
                  <th className="p-2 text-right">Head</th>
                  <th className="p-2 text-left">Notes</th>
                  <th className="p-2 text-right w-48">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paddocks.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2">{p.zone || "-"}</td>
                    <td className="p-2 text-right">{p.area_ac?.toFixed(1) || "0.0"}</td>
                    <td className="p-2 text-right">{paddockCounts[p.name] ?? 0}</td>
                    <td className="p-2">{p.notes || ""}</td>
                    <td className="p-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => openDrawer(p)}>
                        Edit Seeding & Amendments
                      </Button>
                    </td>
                  </tr>
                ))}
                {paddocks.length === 0 && (
                  <tr>
                    <td className="p-2" colSpan={6}>
                      No paddocks found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ───── Right Drawer: Seeding & Amendments ───── */}
      {drawerOpen && activePaddock && padForm && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl overflow-auto p-4">
            <div className="flex justify-between items-center border-b pb-2 mb-4">
              <div>
                <div className="font-semibold text-lg">{activePaddock.name}</div>
                <div className="text-xs text-slate-500">
                  Paddock #{activePaddock.id} • {activePaddock.area_ac ?? 0} ac
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setDrawerOpen(false)}>
                Close
              </Button>
            </div>

            {/* Mix + rate */}
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>Seed Mix</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={padForm.seed_mix_id ?? ""}
                  onChange={(e) =>
                    updatePadForm(
                      "seed_mix_id",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                >
                  <option value="">— None —</option>
                  {mixes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Seeding Rate (lbs/ac)</Label>
                <Input
                  type="number"
                  value={padForm.seeding_rate_lbs_ac ?? ""}
                  onChange={(e) =>
                    updatePadForm("seeding_rate_lbs_ac", Number(e.target.value || 0))
                  }
                />
              </div>
            </div>

            {/* Fertilizer & Lime */}
            <div className="grid md:grid-cols-4 gap-3 mt-4">
              <div>
                <Label>N (lb/ac)</Label>
                <Input
                  type="number"
                  value={padForm.fert_n_lb_ac ?? ""}
                  onChange={(e) =>
                    updatePadForm("fert_n_lb_ac", Number(e.target.value || 0))
                  }
                />
              </div>
              <div>
                <Label>P (lb/ac)</Label>
                <Input
                  type="number"
                  value={padForm.fert_p_lb_ac ?? ""}
                  onChange={(e) =>
                    updatePadForm("fert_p_lb_ac", Number(e.target.value || 0))
                  }
                />
              </div>
              <div>
                <Label>K (lb/ac)</Label>
                <Input
                  type="number"
                  value={padForm.fert_k_lb_ac ?? ""}
                  onChange={(e) =>
                    updatePadForm("fert_k_lb_ac", Number(e.target.value || 0))
                  }
                />
              </div>
              <div>
                <Label>Lime (tons/ac)</Label>
                <Input
                  type="number"
                  value={padForm.lime_ton_ac ?? ""}
                  onChange={(e) =>
                    updatePadForm("lime_ton_ac", Number(e.target.value || 0))
                  }
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <div>
                <Label>Last Seeded Date</Label>
                <Input
                  type="date"
                  value={padForm.last_seeded_date ?? ""}
                  onChange={(e) => updatePadForm("last_seeded_date", e.target.value || null)}
                />
              </div>
              <div>
                <Label>Next Reseed Window</Label>
                <Input
                  placeholder="e.g., Fall 2026"
                  value={padForm.next_reseed_window ?? ""}
                  onChange={(e) => updatePadForm("next_reseed_window", e.target.value || null)}
                />
              </div>
            </div>

            {/* Custom species per paddock */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <Label>Custom Species (this paddock only)</Label>
                <Button size="sm" variant="outline" onClick={addCustomSpecies}>
                  + Add species
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {(padForm.custom_species || []).map((row, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <div className="col-span-7">
                      <Input
                        placeholder="Species"
                        value={row.species}
                        onChange={(e) => updateCustomSpecies(i, "species", e.target.value)}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        placeholder="lbs/ac"
                        value={row.lbs_per_ac}
                        onChange={(e) => updateCustomSpecies(i, "lbs_per_ac", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeCustomSpecies(i)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {(!padForm.custom_species || padForm.custom_species.length === 0) && (
                  <div className="text-xs text-slate-500">No custom species added.</div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="mt-4">
              <Label>Notes</Label>
              <Textarea
                value={padForm.notes ?? ""}
                onChange={(e) => updatePadForm("notes", e.target.value || null)}
                placeholder="Any additional notes…"
              />
            </div>

            {/* Save */}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Saving writes through server route for RLS safety.
              </div>
              <Button onClick={savePad} disabled={savingPad}>
                {savingPad ? "Saving…" : "Save Seeding & Amendments"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

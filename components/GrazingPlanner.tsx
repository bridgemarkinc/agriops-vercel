"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** ───────────────────────── Types ───────────────────────── */
type SeedMix = {
  name: string;
  suggested_total_rate_lbs_ac: number; // total lbs/ac across the mix
  notes?: string;
};

type SeedingPlan = {
  zone: string;
  mixIndex: number; // index into mixesByZone[zone]
  seedRate: number; // lbs/ac actually applied (can override suggested)
  seedPrice: number; // $/lb (for the whole mix average)
  nRate: number; // lbs/ac of Nitrogen
  pRate: number; // lbs/ac of P2O5
  kRate: number; // lbs/ac of K2O
  limeRate: number; // tons/ac
};

type Paddock = {
  name: string;
  acres: number;
  notes?: string;
  seeding: SeedingPlan;
};

export default function GrazingPlanner({ tenantId }: { tenantId: string }) {
  /** ───────────────────────── Seed mixes per zone (editable) ─────────────────────────
   * You can add/remove items here as needed. Users can also add new mixes in the UI.
   */
  const [mixesByZone, setMixesByZone] = useState<Record<string, SeedMix[]>>({
    "Zone 5": [
      { name: "Cool-season pasture (orchardgrass + clover)", suggested_total_rate_lbs_ac: 12, notes: "OG 8 + Clover 4" },
      { name: "Fescue + White Clover", suggested_total_rate_lbs_ac: 10 },
    ],
    "Zone 6": [
      { name: "Perennial rye + Clover", suggested_total_rate_lbs_ac: 18 },
      { name: "Warm-season annual (sorghum-sudan)", suggested_total_rate_lbs_ac: 25 },
    ],
    "Zone 7": [
      { name: "Bermuda overseed (ryegrass)", suggested_total_rate_lbs_ac: 20 },
    ],
  });

  /** ───────────────────────── Defaults ───────────────────────── */
  const defaultSeeding = (zone = "Zone 6"): SeedingPlan => {
    const mixes = mixesByZone[zone] || [];
    const first = mixes[0];
    return {
      zone,
      mixIndex: 0,
      seedRate: first ? first.suggested_total_rate_lbs_ac : 15,
      seedPrice: 2.75, // $/lb average cost
      nRate: 40,
      pRate: 20,
      kRate: 40,
      limeRate: 0.5,
    };
  };

  /** ───────────────────────── Paddocks ───────────────────────── */
  const [paddocks, setPaddocks] = useState<Paddock[]>([
    { name: "North 1", acres: 12, notes: "", seeding: defaultSeeding("Zone 6") },
    { name: "North 2", acres: 9, notes: "", seeding: defaultSeeding("Zone 6") },
  ]);

  const [newPaddock, setNewPaddock] = useState<{ name: string; acres: string }>({
    name: "",
    acres: "",
  });

  function addPaddock() {
    const acresNum = Number(newPaddock.acres || 0);
    if (!newPaddock.name.trim() || acresNum <= 0) {
      alert("Enter a paddock name and positive acres.");
      return;
    }
    setPaddocks((prev) => [
      ...prev,
      { name: newPaddock.name.trim(), acres: acresNum, seeding: defaultSeeding() },
    ]);
    setNewPaddock({ name: "", acres: "" });
  }

  function updatePaddockBase(i: number, patch: Partial<Paddock>) {
    setPaddocks((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function updatePaddockSeeding(i: number, patch: Partial<SeedingPlan>) {
    setPaddocks((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], seeding: { ...next[i].seeding, ...patch } };
      return next;
    });
  }

  /** ───────────────────────── Editor state ───────────────────────── */
  const [editSeedIdx, setEditSeedIdx] = useState<number | null>(null);

  /** ───────────────────────── Cost assumptions (editable) ───────────────────────── */
  const [unitCosts, setUnitCosts] = useState({
    seed_per_lb: 2.75, // default used for new paddocks; each paddock can override
    N: 0.80, // $/lb N
    P2O5: 0.90, // $/lb P2O5
    K2O: 0.60, // $/lb K2O
    lime_ton: 45, // $/ton
  });

  /** ───────────────────────── Calculations ───────────────────────── */
  function paddockCosts(p: Paddock) {
    const s = p.seeding;
    const seedCost = s.seedRate * s.seedPrice * p.acres;
    const nCost = s.nRate * unitCosts.N * p.acres;
    const pCost = s.pRate * unitCosts.P2O5 * p.acres;
    const kCost = s.kRate * unitCosts.K2O * p.acres;
    const limeCost = s.limeRate * unitCosts.lime_ton * p.acres;
    const total = seedCost + nCost + pCost + kCost + limeCost;
    return { seedCost, nCost, pCost, kCost, limeCost, total };
  }

  const projectTotals = useMemo(() => {
    return paddocks.reduce(
      (acc, p) => {
        const c = paddockCosts(p);
        acc.acres += p.acres;
        acc.seed += c.seedCost;
        acc.n += c.nCost;
        acc.p += c.pCost;
        acc.k += c.kCost;
        acc.lime += c.limeCost;
        acc.total += c.total;
        return acc;
      },
      { acres: 0, seed: 0, n: 0, p: 0, k: 0, lime: 0, total: 0 }
    );
  }, [paddocks, unitCosts]);

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  /** ───────────────────────── UI Helpers ───────────────────────── */
  function addCustomMix(zone: string, mix: SeedMix) {
    setMixesByZone((prev) => {
      const arr = prev[zone] ? [...prev[zone]] : [];
      arr.push(mix);
      return { ...prev, [zone]: arr };
    });
  }

  /** ───────────────────────── Render ───────────────────────── */
  return (
    <div className="grid md:grid-cols-3 gap-6">
      {/* Left — paddocks + add form */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>AI Grazing &amp; Feed Planner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Paddock add */}
          <div className="border rounded-xl p-4 bg-white/70">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>Paddock Name</Label>
                <Input
                  value={newPaddock.name}
                  onChange={(e) => setNewPaddock((x) => ({ ...x, name: e.target.value }))}
                  placeholder="e.g., South 3"
                />
              </div>
              <div>
                <Label>Acres</Label>
                <Input
                  type="number"
                  min={0}
                  value={newPaddock.acres}
                  onChange={(e) => setNewPaddock((x) => ({ ...x, acres: e.target.value }))}
                  placeholder="e.g., 8"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={addPaddock} className="w-full">
                  Add Paddock
                </Button>
              </div>
            </div>
          </div>

          {/* Paddock list */}
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-2">Paddock</th>
                  <th className="text-left p-2">Acres</th>
                  <th className="text-left p-2">Zone</th>
                  <th className="text-left p-2">Mix</th>
                  <th className="text-right p-2">Est. Cost</th>
                  <th className="text-right p-2 w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paddocks.map((p, i) => {
                  const costs = paddockCosts(p);
                  const mixes = mixesByZone[p.seeding.zone] || [];
                  const mixName = mixes[p.seeding.mixIndex]?.name ?? "Custom";
                return (
                  <tr key={i} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{p.name}</div>
                    </td>
                    <td className="p-2">{p.acres}</td>
                    <td className="p-2">{p.seeding.zone}</td>
                    <td className="p-2">{mixName}</td>
                    <td className="p-2 text-right">{fmt(costs.total)}</td>
                    <td className="p-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditSeedIdx(i)}
                          title="Edit seeding & amendments"
                        >
                          Edit Seeding &amp; Amendments
                        </Button>
                      </div>
                    </td>
                  </tr>
                );})}
                {paddocks.length === 0 && (
                  <tr>
                    <td className="p-2" colSpan={6}>
                      No paddocks yet — add your first one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Seeding & Amendments Editor (per paddock) */}
          {editSeedIdx !== null && paddocks[editSeedIdx] && (
            <Card>
              <CardHeader>
                <CardTitle>Seeding &amp; Amendments — {paddocks[editSeedIdx].name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {(() => {
                  /** TS: editSeedIdx narrowed here */
                  const idx = editSeedIdx as number;

                  const p = paddocks[idx];
                  const s = p.seeding;
                  const zone = s.zone;
                  const mixes = mixesByZone[zone] || [];

                  // cost preview
                  const costs = paddockCosts(p);

                  // custom mix form (local)
                  const [customName, setCustomName] = useState("");
                  const [customRate, setCustomRate] = useState<string>("12");
                  const [customNotes, setCustomNotes] = useState("");

                  function addMix() {
                    const rate = Number(customRate || 0);
                    if (!customName.trim() || rate <= 0) {
                      alert("Enter a mix name and positive suggested rate (lbs/ac).");
                      return;
                    }
                    const mix: SeedMix = {
                      name: customName.trim(),
                      suggested_total_rate_lbs_ac: rate,
                      notes: customNotes.trim() || undefined,
                    };
                    addCustomMix(zone, mix);

                    // set this new mix selected for the paddock
                    const newIndex = (mixesByZone[zone]?.length || 0); // it will appear at the end
                    updatePaddockSeeding(idx, {
                      mixIndex: newIndex,
                      seedRate: rate,
                    });
                    setCustomName("");
                    setCustomRate("12");
                    setCustomNotes("");
                  }

                  return (
                    <div className="space-y-6">
                      {/* A) Zone + Mix + rates */}
                      <div className="grid md:grid-cols-3 gap-3">
                        <div>
                          <Label>Planting Zone</Label>
                          <select
                            className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                            value={zone}
                            onChange={(e) => {
                              const newZone = e.target.value;
                              const ms = mixesByZone[newZone] || [];
                              const nextIndex = Math.min(s.mixIndex, Math.max(ms.length - 1, 0));
                              const nextRate =
                                ms[nextIndex]?.suggested_total_rate_lbs_ac ?? s.seedRate;
                              updatePaddockSeeding(idx, {
                                zone: newZone,
                                mixIndex: nextIndex,
                                seedRate: nextRate,
                              });
                            }}
                          >
                            {Object.keys(mixesByZone).map((z) => (
                              <option key={z} value={z}>
                                {z}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <Label>Seed Mix</Label>
                          <select
                            className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                            value={String(s.mixIndex)}
                            onChange={(e) => {
                              const idxVal = Number(e.target.value || 0);
                              const suggested = mixes[idxVal]?.suggested_total_rate_lbs_ac ?? s.seedRate;
                              updatePaddockSeeding(idx, {
                                mixIndex: idxVal,
                                seedRate: suggested,
                              });
                            }}
                          >
                            {mixes.map((m, i) => (
                              <option key={`${m.name}-${i}`} value={i}>
                                {m.name} ({m.suggested_total_rate_lbs_ac} lbs/ac)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <Label>Seed Rate (lbs/ac)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={String(s.seedRate)}
                            onChange={(e) =>
                              updatePaddockSeeding(idx, { seedRate: Number(e.target.value || 0) })
                            }
                          />
                        </div>

                        <div>
                          <Label>Seed Price ($/lb)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={String(s.seedPrice)}
                            onChange={(e) =>
                              updatePaddockSeeding(idx, { seedPrice: Number(e.target.value || 0) })
                            }
                          />
                        </div>

                        <div>
                          <Label>N Rate (lbs/ac)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={String(s.nRate)}
                            onChange={(e) =>
                              updatePaddockSeeding(idx, { nRate: Number(e.target.value || 0) })
                            }
                          />
                        </div>

                        <div>
                          <Label>P₂O₅ Rate (lbs/ac)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={String(s.pRate)}
                            onChange={(e) =>
                              updatePaddockSeeding(idx, { pRate: Number(e.target.value || 0) })
                            }
                          />
                        </div>

                        <div>
                          <Label>K₂O Rate (lbs/ac)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={String(s.kRate)}
                            onChange={(e) =>
                              updatePaddockSeeding(idx, { kRate: Number(e.target.value || 0) })
                            }
                          />
                        </div>

                        <div>
                          <Label>Lime Rate (tons/ac)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.1"
                            value={String(s.limeRate)}
                            onChange={(e) =>
                              updatePaddockSeeding(idx, { limeRate: Number(e.target.value || 0) })
                            }
                          />
                        </div>
                      </div>

                      {/* B) Add your own mix (for this zone) */}
                      <div className="border rounded-xl p-4 bg-white/70">
                        <div className="font-medium mb-2">Create a New Seed Mix for {zone}</div>
                        <div className="grid md:grid-cols-4 gap-3">
                          <div className="md:col-span-2">
                            <Label>Mix Name</Label>
                            <Input
                              value={customName}
                              onChange={(e) => setCustomName(e.target.value)}
                              placeholder="e.g., Orchardgrass + Red/White Clover"
                            />
                          </div>
                          <div>
                            <Label>Suggested Total Rate (lbs/ac)</Label>
                            <Input
                              type="number"
                              min={1}
                              value={customRate}
                              onChange={(e) => setCustomRate(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>&nbsp;</Label>
                            <Button className="w-full" onClick={addMix}>
                              Add Mix
                            </Button>
                          </div>
                          <div className="md:col-span-4">
                            <Label>Notes (optional)</Label>
                            <textarea
                              value={customNotes}
                              onChange={(e) => setCustomNotes(e.target.value)}
                              rows={2}
                              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                              placeholder="Species & proportions, supplier, etc."
                            />
                          </div>
                        </div>
                      </div>

                      {/* C) Preview for this paddock */}
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="border rounded-xl p-4 bg-white/60">
                          <div className="font-semibold mb-1">This Paddock</div>
                          <div className="text-sm space-y-1">
                            <div>
                              <b>Paddock:</b> {p.name} ({p.acres} ac)
                            </div>
                            <div>
                              <b>Seed:</b> {s.seedRate} lbs/ac × {fmt(s.seedPrice)} /lb →{" "}
                              <b>{fmt(s.seedRate * s.seedPrice)} /ac</b>
                            </div>
                            <div className="text-xs text-slate-600">
                              * Fertilizer & lime use project unit prices below.
                            </div>
                          </div>
                          <div className="mt-3 text-sm">
                            <div>Per-paddock cost: <b>{fmt(paddockCosts(p).total)}</b></div>
                          </div>
                        </div>

                        <div className="border rounded-xl p-4 bg-white/60">
                          <div className="font-semibold mb-1">Project Unit Prices</div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <Label>N ($/lb)</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={String(unitCosts.N)}
                                onChange={(e) =>
                                  setUnitCosts((u) => ({ ...u, N: Number(e.target.value || 0) }))
                                }
                              />
                            </div>
                            <div>
                              <Label>P₂O₅ ($/lb)</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={String(unitCosts.P2O5)}
                                onChange={(e) =>
                                  setUnitCosts((u) => ({ ...u, P2O5: Number(e.target.value || 0) }))
                                }
                              />
                            </div>
                            <div>
                              <Label>K₂O ($/lb)</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={String(unitCosts.K2O)}
                                onChange={(e) =>
                                  setUnitCosts((u) => ({ ...u, K2O: Number(e.target.value || 0) }))
                                }
                              />
                            </div>
                            <div>
                              <Label>Lime ($/ton)</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={String(unitCosts.lime_ton)}
                                onChange={(e) =>
                                  setUnitCosts((u) => ({ ...u, lime_ton: Number(e.target.value || 0) }))
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditSeedIdx(null)}>
                          Close
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Right — Project summary */}
      <Card>
        <CardHeader>
          <CardTitle>Project Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm grid grid-cols-2 gap-y-1">
            <div className="text-slate-600">Total Acres</div>
            <div className="text-right font-medium">{projectTotals.acres}</div>
            <div className="text-slate-600">Seed Cost</div>
            <div className="text-right font-medium">{fmt(projectTotals.seed)}</div>
            <div className="text-slate-600">N Cost</div>
            <div className="text-right font-medium">{fmt(projectTotals.n)}</div>
            <div className="text-slate-600">P₂O₅ Cost</div>
            <div className="text-right font-medium">{fmt(projectTotals.p)}</div>
            <div className="text-slate-600">K₂O Cost</div>
            <div className="text-right font-medium">{fmt(projectTotals.k)}</div>
            <div className="text-slate-600">Lime Cost</div>
            <div className="text-right font-medium">{fmt(projectTotals.lime)}</div>
            <div className="col-span-2 border-t my-1" />
            <div className="text-slate-700 font-semibold">Total</div>
            <div className="text-right text-emerald-700 font-semibold">{fmt(projectTotals.total)}</div>
          </div>

          <div className="text-xs text-slate-500">
            Costs are estimates only. Adjust rates and unit prices to match your suppliers and soil tests.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

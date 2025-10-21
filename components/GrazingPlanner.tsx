"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * Grazing math (all weights are in lb of DM)
 * - Herd daily demand = head * avgBW * intake% (as decimal)
 * - Grazeable DM per ac = max(StandingDM - Residual, 0) * Utilization
 * - Daily supply (paddock) = GrazeableDM/ac * Acres
 * - Days on paddock = DailySupply / HerdDemand
 * - Growth contributes during occupation; to stay conservative, growth is left to rest period math.
 */

type Paddock = {
  id: string;
  name: string;
  acres: number;
  standingDM_lb_ac: number; // current standing DM
  targetResidual_lb_ac: number;
  growth_lb_ac_day: number; // expected growth
};

type SeedItem = { species: string; rate_lbs_ac: number };
type SeedMix = { name: string; notes?: string; items: SeedItem[]; suggested_total_rate_lbs_ac: number };

const DEFAULT_PADDOCKS: Paddock[] = [
  { id: "p1", name: "North 1", acres: 5, standingDM_lb_ac: 2800, targetResidual_lb_ac: 1200, growth_lb_ac_day: 35 },
  { id: "p2", name: "North 2", acres: 6, standingDM_lb_ac: 2600, targetResidual_lb_ac: 1200, growth_lb_ac_day: 35 },
  { id: "p3", name: "East 1",  acres: 4, standingDM_lb_ac: 3000, targetResidual_lb_ac: 1300, growth_lb_ac_day: 40 },
];

const MIXES: Record<string, SeedMix[]> = {
  "Cool-Season (Zones 3–6)": [
    {
      name: "Fescue/Orchardgrass + Clover",
      notes: "Durable cool-season base. Clover adds N-fixation.",
      items: [
        { species: "Tall fescue (endophyte-safe)", rate_lbs_ac: 10 },
        { species: "Orchardgrass", rate_lbs_ac: 4 },
        { species: "Perennial ryegrass (optional)", rate_lbs_ac: 3 },
        { species: "White clover (ladino/dutch)", rate_lbs_ac: 2 },
      ],
      suggested_total_rate_lbs_ac: 16,
    },
  ],
  "Warm-Season (Zones 8–9)": [
    {
      name: "Bermudagrass + Clover",
      notes: "Warm-season base; overseed rye/ryegrass for winter feed.",
      items: [
        { species: "Bermudagrass (hulled)", rate_lbs_ac: 8 },
        { species: "White clover (overseed)", rate_lbs_ac: 2 },
      ],
      suggested_total_rate_lbs_ac: 10,
    },
  ],
};

export default function GrazingPlanner({ tenantId }: { tenantId: string }) {
  // Herd + planning knobs
  const [head, setHead] = useState<number | string>(60);
  const [avgBW, setAvgBW] = useState<number | string>(1200);     // lb
  const [intakePct, setIntakePct] = useState<number | string>(2.6); // % bodyweight per day
  const [utilization, setUtilization] = useState<number | string>(60); // % of available DM you’ll actually harvest
  const [horizonDays, setHorizonDays] = useState<number | string>(30); // days planner horizon
  const [targetRestDays, setTargetRestDays] = useState<number | string>(30); // desired rest period

  // paddocks (editable rows)
  const [paddocks, setPaddocks] = useState<Paddock[]>(DEFAULT_PADDOCKS);

  function updatePaddock(idx: number, patch: Partial<Paddock>) {
    setPaddocks((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function addPaddock() {
    const n = paddocks.length + 1;
    setPaddocks((prev) => [
      ...prev,
      {
        id: `p${Date.now()}`,
        name: `New ${n}`,
        acres: 4,
        standingDM_lb_ac: 2600,
        targetResidual_lb_ac: 1200,
        growth_lb_ac_day: 30,
      },
    ]);
  }
  function removePaddock(idx: number) {
    setPaddocks((prev) => prev.filter((_, i) => i !== idx));
  }

  // Core herd demand
  const herdDemandPerDay_lb = useMemo(() => {
    const h = Number(head || 0);
    const bw = Number(avgBW || 0);
    const pct = Number(intakePct || 0) / 100;
    return h * bw * pct; // lb DM per day
  }, [head, avgBW, intakePct]);

  const util = useMemo(() => Number(utilization || 0) / 100, [utilization]);

  // Per-paddock forage + days
  type PaddockCalc = Paddock & {
    grazeableDM_lb_ac: number;
    dailySupply_lb: number;
    daysOn: number; // conservative: supply / demand
  };

  const paddockCalcs: PaddockCalc[] = useMemo(() => {
    return paddocks.map((p) => {
      const available = Math.max(Number(p.standingDM_lb_ac || 0) - Number(p.targetResidual_lb_ac || 0), 0);
      const grazeableDM_lb_ac = available * util;
      const dailySupply_lb = grazeableDM_lb_ac * Number(p.acres || 0);
      const daysOn = herdDemandPerDay_lb > 0 ? dailySupply_lb / herdDemandPerDay_lb : 0;
      return { ...p, grazeableDM_lb_ac, dailySupply_lb, daysOn };
    });
  }, [paddocks, util, herdDemandPerDay_lb]);

  // Totals
  const totalAcres = useMemo(
    () => paddocks.reduce((s, p) => s + Number(p.acres || 0), 0),
    [paddocks]
  );
  const totalDailySupply_lb = useMemo(
    () => paddockCalcs.reduce((s, p) => s + p.dailySupply_lb, 0),
    [paddockCalcs]
  );
  const avgGrowth_lb_ac_day = useMemo(
    () =>
      paddocks.length
        ? paddocks.reduce((s, p) => s + Number(p.growth_lb_ac_day || 0), 0) / paddocks.length
        : 0,
    [paddocks]
  );

  // Rotation fit estimates
  const totalDaysOnAllPaddocks = useMemo(
    () => paddockCalcs.reduce((s, p) => s + p.daysOn, 0),
    [paddockCalcs]
  );
  const paddockCount = paddocks.length;
  const targetRest = Number(targetRestDays || 0);
  const canMeetRest = useMemo(() => totalDaysOnAllPaddocks >= targetRest, [totalDaysOnAllPaddocks, targetRest]);

  // A simple “moves plan” over the horizon; we just repeat paddocks in order with each paddock's daysOn (>=0.25)
  type Move = { day: number; paddock: string; estDays: number };
  const moves: Move[] = useMemo(() => {
    const horizon = Number(horizonDays || 0);
    const minStay = 0.25; // quarter day minimum display
    const seq: Move[] = [];
    if (!paddockCalcs.length) return seq;

    let day = 0;
    let i = 0;
    while (day < horizon) {
      const p = paddockCalcs[i % paddockCalcs.length];
      const d = Math.max(minStay, Number(p.daysOn.toFixed(2)));
      seq.push({ day: Math.floor(day) + 1, paddock: p.name, estDays: Number(d.toFixed(2)) });
      day += d;
      i++;
      if (i > 1000) break; // safety
    }
    return seq;
  }, [paddockCalcs, horizonDays]);

  // Seeding & Amendments (kept lean but useful)
  const [zone, setZone] = useState<string>("Cool-Season (Zones 3–6)");
  const zoneMixes = MIXES[zone] || [];
  const [mixIndex, setMixIndex] = useState<number>(0);
  const [seedRate, setSeedRate] = useState<number | string>(zoneMixes[mixIndex]?.suggested_total_rate_lbs_ac ?? 16);
  const [seedPrice, setSeedPrice] = useState<number | string>("3.25");

  const acresNum = Number(totalAcres || 0);
  const seedRateNum = Number(seedRate || 0);
  const seedPriceNum = Number(seedPrice || 0);
  const seedTotalLbs = seedRateNum * acresNum;
  const seedCostTotal = seedTotalLbs * seedPriceNum;

  const [nRate, setNRate] = useState<number | string>("0");
  const [pRate, setPRate] = useState<number | string>("0");
  const [kRate, setKRate] = useState<number | string>("0");
  const [nCost, setNCost] = useState<number | string>("0.60");
  const [pCost, setPCost] = useState<number | string>("0.75");
  const [kCost, setKCost] = useState<number | string>("0.55");
  const nRateNum = Number(nRate || 0);
  const pRateNum = Number(pRate || 0);
  const kRateNum = Number(kRate || 0);
  const nCostNum = Number(nCost || 0);
  const pCostNum = Number(pCost || 0);
  const kCostNum = Number(kCost || 0);
  const fertCostPerAc = nRateNum * nCostNum + pRateNum * pCostNum + kRateNum * kCostNum;
  const fertCostTotal = fertCostPerAc * acresNum;

  const [limeRate, setLimeRate] = useState<number | string>("0");
  const [limeCost, setLimeCost] = useState<number | string>("58");
  const limeRateNum = Number(limeRate || 0);
  const limeCostNum = Number(limeCost || 0);
  const limeCostPerAc = limeRateNum * limeCostNum;
  const limeCostTotal = limeCostPerAc * acresNum;

  const totalPerAc = seedRateNum * seedPriceNum + fertCostPerAc + limeCostPerAc;
  const totalProject = seedCostTotal + fertCostTotal + limeCostTotal;

  return (
    <div className="space-y-6">
      {/* Top summary */}
      <Card>
        <CardHeader>
          <CardTitle>AI Grazing & Feed Planner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-5 gap-3">
            <div>
              <Label>Herd Size (head)</Label>
              <Input type="number" value={head} onChange={(e) => setHead(e.target.value)} />
            </div>
            <div>
              <Label>Average BW (lb)</Label>
              <Input type="number" value={avgBW} onChange={(e) => setAvgBW(e.target.value)} />
            </div>
            <div>
              <Label>Intake (% BW)</Label>
              <Input type="number" step="0.1" value={intakePct} onChange={(e) => setIntakePct(e.target.value)} />
            </div>
            <div>
              <Label>Utilization (%)</Label>
              <Input type="number" step="1" value={utilization} onChange={(e) => setUtilization(e.target.value)} />
            </div>
            <div>
              <Label>Plan Horizon (days)</Label>
              <Input type="number" value={horizonDays} onChange={(e) => setHorizonDays(e.target.value)} />
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <div className="border rounded-xl p-3 bg-white/60">
              <div className="text-xs text-slate-500">Herd Demand</div>
              <div className="text-lg font-semibold">
                {Math.round(herdDemandPerDay_lb).toLocaleString()} lb DM/day
              </div>
            </div>
            <div className="border rounded-xl p-3 bg-white/60">
              <div className="text-xs text-slate-500">Total Acres</div>
              <div className="text-lg font-semibold">{totalAcres.toFixed(1)} ac</div>
            </div>
            <div className="border rounded-xl p-3 bg-white/60">
              <div className="text-xs text-slate-500">Avg Growth</div>
              <div className="text-lg font-semibold">{Math.round(avgGrowth_lb_ac_day)} lb/ac/day</div>
            </div>
            <div className="border rounded-xl p-3 bg-white/60">
              <div className="text-xs text-slate-500">Target Rest Period</div>
              <div className="flex gap-2 items-end">
                <Input
                  type="number"
                  value={targetRestDays}
                  onChange={(e) => setTargetRestDays(e.target.value)}
                />
                <span className="pb-1 text-sm text-slate-600">days</span>
              </div>
              <div className={`text-xs mt-1 ${canMeetRest ? "text-emerald-700" : "text-amber-700"}`}>
                {canMeetRest
                  ? "Rotation can meet your target rest (sum of Days On ≥ Rest Days)."
                  : "Increase forage or paddocks to meet the target rest."}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paddocks table */}
      <Card>
        <CardHeader>
          <CardTitle>Paddocks & Forage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-2">Name</th>
                  <th className="text-right p-2">Acres</th>
                  <th className="text-right p-2">Standing DM (lb/ac)</th>
                  <th className="text-right p-2">Target Residual (lb/ac)</th>
                  <th className="text-right p-2">Utilized DM (lb/ac)</th>
                  <th className="text-right p-2">Daily Supply (lb)</th>
                  <th className="text-right p-2">Days On (est)</th>
                  <th className="text-right p-2">Growth (lb/ac/day)</th>
                  <th className="text-right p-2 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paddockCalcs.map((p, idx) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
                      <Input
                        value={p.name}
                        onChange={(e) => updatePaddock(idx, { name: e.target.value })}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        className="text-right"
                        type="number"
                        step="0.1"
                        value={p.acres}
                        onChange={(e) => updatePaddock(idx, { acres: Number(e.target.value || 0) })}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        className="text-right"
                        type="number"
                        step="50"
                        value={p.standingDM_lb_ac}
                        onChange={(e) => updatePaddock(idx, { standingDM_lb_ac: Number(e.target.value || 0) })}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        className="text-right"
                        type="number"
                        step="50"
                        value={p.targetResidual_lb_ac}
                        onChange={(e) => updatePaddock(idx, { targetResidual_lb_ac: Number(e.target.value || 0) })}
                      />
                    </td>
                    <td className="p-2 text-right">
                      {Math.max(p.grazeableDM_lb_ac, 0).toFixed(0)}
                    </td>
                    <td className="p-2 text-right">{Math.max(p.dailySupply_lb, 0).toFixed(0)}</td>
                    <td className="p-2 text-right">{Math.max(p.daysOn, 0).toFixed(2)}</td>
                    <td className="p-2 text-right">
                      <Input
                        className="text-right"
                        type="number"
                        step="1"
                        value={p.growth_lb_ac_day}
                        onChange={(e) => updatePaddock(idx, { growth_lb_ac_day: Number(e.target.value || 0) })}
                      />
                    </td>
                    <td className="p-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => removePaddock(idx)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
                {paddockCalcs.length === 0 && (
                  <tr>
                    <td className="p-2" colSpan={9}>
                      No paddocks — add at least one to begin.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t">
                <tr>
                  <td className="p-2 font-medium">Totals</td>
                  <td className="p-2 text-right font-medium">{totalAcres.toFixed(1)}</td>
                  <td className="p-2 text-right text-slate-400">—</td>
                  <td className="p-2 text-right text-slate-400">—</td>
                  <td className="p-2 text-right text-slate-400">—</td>
                  <td className="p-2 text-right font-medium">{Math.max(totalDailySupply_lb, 0).toFixed(0)}</td>
                  <td className="p-2 text-right font-medium">
                    {Math.max(totalDaysOnAllPaddocks, 0).toFixed(2)}
                  </td>
                  <td className="p-2 text-right font-medium">{Math.round(avgGrowth_lb_ac_day)}</td>
                  <td className="p-2 text-right">
                    <Button size="sm" onClick={addPaddock}>
                      + Add
                    </Button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="text-xs text-slate-500">
            Utilized DM = (Standing − Residual) × Utilization%. Days On = Daily Supply ÷ Herd Demand.
          </div>
        </CardContent>
      </Card>

      {/* Simple rotation / move plan */}
      <Card>
        <CardHeader>
          <CardTitle>Move Plan (Next {String(horizonDays)} days)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-2">Start Day</th>
                  <th className="text-left p-2">Paddock</th>
                  <th className="text-left p-2">Est. Days on Paddock</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m, i) => (
                  <tr key={`${m.paddock}-${i}`} className="border-t">
                    <td className="p-2">Day {m.day}</td>
                    <td className="p-2">{m.paddock}</td>
                    <td className="p-2">{m.estDays.toFixed(2)}</td>
                  </tr>
                ))}
                {moves.length === 0 && (
                  <tr>
                    <td className="p-2" colSpan={3}>
                      Add paddocks and herd info to generate a plan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-slate-500">
            This is a lightweight rotation outline. Adjust stays for weather, ground cover, and animal condition.
          </div>
        </CardContent>
      </Card>

      {/* Seeding & Amendments (tied to total acres) */}
      <Card>
        <CardHeader>
          <CardTitle>Seeding & Amendments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Planting Zone</Label>
              <select
                className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={zone}
                onChange={(e) => {
                  setZone(e.target.value);
                  setMixIndex(0);
                  const rate = MIXES[e.target.value]?.[0]?.suggested_total_rate_lbs_ac ?? 16;
                  setSeedRate(rate);
                }}
              >
                {Object.keys(MIXES).map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label>Suggested Seed Mix</Label>
              <select
                className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={mixIndex}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setMixIndex(idx);
                  const nextRate = MIXES[zone]?.[idx]?.suggested_total_rate_lbs_ac ?? 16;
                  setSeedRate(nextRate);
                }}
              >
                {(MIXES[zone] || []).map((m, i) => (
                  <option key={m.name} value={i}>
                    {m.name} ({m.suggested_total_rate_lbs_ac} lb/ac)
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500 mt-1">
                Total acres uses your paddock sum ({acresNum.toFixed(1)} ac).
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <Label>Seeding Rate (lb/ac)</Label>
              <Input type="number" value={seedRate} onChange={(e) => setSeedRate(e.target.value)} />
            </div>
            <div>
              <Label>Seed Price ($/lb)</Label>
              <Input
                type="number"
                step="0.01"
                value={seedPrice}
                onChange={(e) => setSeedPrice(e.target.value)}
              />
            </div>
            <div>
              <Label>Total Seed (lb)</Label>
              <Input value={Number.isFinite(seedTotalLbs) ? seedTotalLbs.toFixed(1) : ""} readOnly />
            </div>
            <div>
              <Label>Seed Cost (total)</Label>
              <Input value={Number.isFinite(seedCostTotal) ? `$${seedCostTotal.toFixed(2)}` : ""} readOnly />
            </div>
          </div>

          <div className="border rounded-xl p-3 bg-white/70">
            <div className="font-medium mb-2">Fertilizer</div>
            <div className="grid md:grid-cols-6 gap-3 items-end">
              <div>
                <Label>N (lb/ac)</Label>
                <Input type="number" value={nRate} onChange={(e) => setNRate(e.target.value)} />
              </div>
              <div>
                <Label>P₂O₅ (lb/ac)</Label>
                <Input type="number" value={pRate} onChange={(e) => setPRate(e.target.value)} />
              </div>
              <div>
                <Label>K₂O (lb/ac)</Label>
                <Input type="number" value={kRate} onChange={(e) => setKRate(e.target.value)} />
              </div>
              <div>
                <Label>N Cost ($/lb)</Label>
                <Input type="number" step="0.01" value={nCost} onChange={(e) => setNCost(e.target.value)} />
              </div>
              <div>
                <Label>P₂O₅ Cost ($/lb)</Label>
                <Input type="number" step="0.01" value={pCost} onChange={(e) => setPCost(e.target.value)} />
              </div>
              <div>
                <Label>K₂O Cost ($/lb)</Label>
                <Input type="number" step="0.01" value={kCost} onChange={(e) => setKCost(e.target.value)} />
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <div>
                <Label>Fert Cost (per ac)</Label>
                <Input value={Number.isFinite(fertCostPerAc) ? `$${fertCostPerAc.toFixed(2)}` : ""} readOnly />
              </div>
              <div>
                <Label>Fert Cost (total)</Label>
                <Input value={Number.isFinite(fertCostTotal) ? `$${fertCostTotal.toFixed(2)}` : ""} readOnly />
              </div>
            </div>
          </div>

          <div className="border rounded-xl p-3 bg-white/70">
            <div className="font-medium mb-2">Lime</div>
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <div>
                <Label>Lime Rate (tons/ac)</Label>
                <Input type="number" step="0.1" value={limeRate} onChange={(e) => setLimeRate(e.target.value)} />
              </div>
              <div>
                <Label>Lime Cost ($/ton applied)</Label>
                <Input type="number" step="0.01" value={limeCost} onChange={(e) => setLimeCost(e.target.value)} />
              </div>
              <div>
                <Label>Lime Cost (per ac)</Label>
                <Input value={Number.isFinite(limeCostPerAc) ? `$${limeCostPerAc.toFixed(2)}` : ""} readOnly />
              </div>
              <div>
                <Label>Lime Cost (total)</Label>
                <Input value={Number.isFinite(limeCostTotal) ? `$${limeCostTotal.toFixed(2)}` : ""} readOnly />
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="border rounded-xl p-3 bg-white/60">
              <div className="font-medium mb-1">Per-acre Cost</div>
              <div className="text-lg font-semibold">
                {Number.isFinite(totalPerAc) ? `$${totalPerAc.toFixed(2)}` : "-"}
              </div>
              <div className="text-xs text-slate-500 mt-1">= Seed + Fert + Lime (per ac)</div>
            </div>
            <div className="border rounded-xl p-3 bg-white/60">
              <div className="font-medium mb-1">Project Total</div>
              <div className="text-lg font-semibold">
                {Number.isFinite(totalProject) ? `$${totalProject.toFixed(2)}` : "-"}
              </div>
              <div className="text-xs text-slate-500 mt-1">acres = sum of paddocks</div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => alert("Save plan to Supabase — coming soon")}>
              Save Plan
            </Button>
            <Button onClick={() => alert("Export printable PDF — coming soon")}>Export PDF</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

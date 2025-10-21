"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Props = { tenantId: string };

type SeedItem = {
  species: string;
  rate_lbs_ac: number;
};

type SeedMix = {
  name: string;
  notes?: string;
  items: SeedItem[];
  suggested_total_rate_lbs_ac: number;
};

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
    {
      name: "Timothy/Orchardgrass + Clover",
      notes: "Palatable hay + pasture. Clover boosts protein.",
      items: [
        { species: "Timothy", rate_lbs_ac: 6 },
        { species: "Orchardgrass", rate_lbs_ac: 4 },
        { species: "White clover", rate_lbs_ac: 2 },
      ],
      suggested_total_rate_lbs_ac: 12,
    },
  ],
  "Transition (Zones 6–7)": [
    {
      name: "Orchardgrass/Tall Fescue + Clover",
      notes: "Handles summer stress well with balanced growth.",
      items: [
        { species: "Orchardgrass", rate_lbs_ac: 6 },
        { species: "Tall fescue (endophyte-safe)", rate_lbs_ac: 8 },
        { species: "White/Red clover mix", rate_lbs_ac: 3 },
      ],
      suggested_total_rate_lbs_ac: 17,
    },
  ],
  "Warm-Season (Zones 8–9)": [
    {
      name: "Bermudagrass + Clover (overseed cool-season)",
      notes: "Warm-season base; overseed rye/ryegrass for winter feed.",
      items: [
        { species: "Bermudagrass (hulled)", rate_lbs_ac: 8 },
        { species: "White clover (overseed)", rate_lbs_ac: 2 },
      ],
      suggested_total_rate_lbs_ac: 10,
    },
    {
      name: "Bahia + Clover",
      notes: "Low input & tough; clover adds quality.",
      items: [
        { species: "Bahiagrass", rate_lbs_ac: 10 },
        { species: "White clover", rate_lbs_ac: 2 },
      ],
      suggested_total_rate_lbs_ac: 12,
    },
  ],
};

export default function GrazingPlanner({ tenantId }: Props) {
  // Existing planner state (keep/extend as needed)
  const [acres, setAcres] = useState<number | string>("10");

  // Seeding & Amendments
  const [zone, setZone] = useState<string>("Cool-Season (Zones 3–6)");
  const zoneMixes = MIXES[zone] || [];
  const [mixIndex, setMixIndex] = useState<number>(0);

  const defaultRate = zoneMixes[mixIndex]?.suggested_total_rate_lbs_ac ?? 12;
  const [seedRate, setSeedRate] = useState<number | string>(defaultRate);
  const [seedPrice, setSeedPrice] = useState<number | string>("3.25");

  const recipeText = useMemo(() => {
    const m = zoneMixes[mixIndex];
    if (!m) return "";
    const rows = m.items.map((i) => `• ${i.species}: ~${i.rate_lbs_ac} lb/ac`);
    return `${m.name}\n${m.notes ? m.notes + "\n" : ""}${rows.join("\n")}`;
  }, [zoneMixes, mixIndex]);

  const [customRecipe, setCustomRecipe] = useState<string>("");

  // Fertilizer (lbs/ac) and cost ($/lb)
  const [nRate, setNRate] = useState<number | string>("0");
  const [pRate, setPRate] = useState<number | string>("0"); // P2O5
  const [kRate, setKRate] = useState<number | string>("0"); // K2O
  const [nCost, setNCost] = useState<number | string>("0.60");
  const [pCost, setPCost] = useState<number | string>("0.75");
  const [kCost, setKCost] = useState<number | string>("0.55");

  // Lime (tons/ac) and cost ($/ton applied)
  const [limeRate, setLimeRate] = useState<number | string>("0");
  const [limeCost, setLimeCost] = useState<number | string>("58");

  // Calculations
  const acresNum = Number(acres || 0);
  const seedRateNum = Number(seedRate || 0);
  const seedPriceNum = Number(seedPrice || 0);

  const seedTotalLbs = seedRateNum * acresNum;
  const seedCostTotal = seedTotalLbs * seedPriceNum;

  const nRateNum = Number(nRate || 0);
  const pRateNum = Number(pRate || 0);
  const kRateNum = Number(kRate || 0);
  const nCostNum = Number(nCost || 0);
  const pCostNum = Number(pCost || 0);
  const kCostNum = Number(kCost || 0);

  const fertCostPerAc = nRateNum * nCostNum + pRateNum * pCostNum + kRateNum * kCostNum;
  const fertCostTotal = fertCostPerAc * acresNum;

  const limeRateNum = Number(limeRate || 0);
  const limeCostNum = Number(limeCost || 0);
  const limeCostPerAc = limeRateNum * limeCostNum;
  const limeCostTotal = limeCostPerAc * acresNum;

  const totalPerAc = seedRateNum * seedPriceNum + fertCostPerAc + limeCostPerAc;
  const totalProject = seedCostTotal + fertCostTotal + limeCostTotal;

  return (
    <div className="space-y-6">
      {/* Keep your existing planner section(s) above/below as needed */}
      <Card>
        <CardHeader>
          <CardTitle>AI Grazing & Feed Planner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Total Acres</Label>
              <Input
                type="number"
                value={acres}
                onChange={(e) => setAcres(e.target.value)}
                placeholder="e.g., 10"
              />
            </div>
            <div className="md:col-span-2 flex items-end">
              <div className="text-sm text-slate-600">
                Tenant: <span className="font-mono">{tenantId}</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            (Your existing planner continues to work; new seeding & amendments are below.)
          </div>
        </CardContent>
      </Card>

      {/* Seeding & Amendments */}
      <Card>
        <CardHeader>
          <CardTitle>Seeding & Amendments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Zone + Mix chooser */}
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Planting Zone / Region</Label>
              <select
                className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={zone}
                onChange={(e) => {
                  setZone(e.target.value);
                  setMixIndex(0);
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
              <div className="flex gap-2">
                <select
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={mixIndex}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setMixIndex(idx);
                    const nextRate = MIXES[zone]?.[idx]?.suggested_total_rate_lbs_ac ?? 12;
                    setSeedRate(nextRate);
                  }}
                >
                  {zoneMixes.map((m, i) => (
                    <option key={m.name} value={i}>
                      {m.name} ({m.suggested_total_rate_lbs_ac} lb/ac)
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!customRecipe.trim()) setCustomRecipe(recipeText);
                  }}
                >
                  Load Recipe
                </Button>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Load the suggested recipe, then edit species/notes below.
              </div>
            </div>
          </div>

          {/* Editable mix recipe (native textarea) */}
          <div>
            <Label>Recipe Notes (editable)</Label>
            <textarea
              rows={5}
              value={customRecipe || recipeText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setCustomRecipe(e.target.value)
              }
              placeholder="e.g., Replace ryegrass with meadow fescue on low fertility soils…"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          {/* Seeding rate & price */}
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <Label>Total Seeding Rate (lb/ac)</Label>
              <Input
                type="number"
                value={seedRate}
                onChange={(e) => setSeedRate(e.target.value)}
                placeholder="e.g., 16"
              />
            </div>
            <div>
              <Label>Seed Price ($/lb)</Label>
              <Input
                type="number"
                value={seedPrice}
                onChange={(e) => setSeedPrice(e.target.value)}
                step="0.01"
                placeholder="e.g., 3.25"
              />
            </div>
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <div>
                <Label>Total Seed (lb)</Label>
                <Input
                  value={Number.isFinite(seedTotalLbs) ? seedTotalLbs.toFixed(1) : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Seed Cost (total)</Label>
                <Input
                  value={Number.isFinite(seedCostTotal) ? `$${seedCostTotal.toFixed(2)}` : ""}
                  readOnly
                />
              </div>
            </div>
          </div>

          {/* Fertilizer */}
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
                <Input
                  type="number"
                  step="0.01"
                  value={nCost}
                  onChange={(e) => setNCost(e.target.value)}
                />
              </div>
              <div>
                <Label>P₂O₅ Cost ($/lb)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={pCost}
                  onChange={(e) => setPCost(e.target.value)}
                />
              </div>
              <div>
                <Label>K₂O Cost ($/lb)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={kCost}
                  onChange={(e) => setKCost(e.target.value)}
                />
              </div>

              <div className="md:col-span-6 grid md:grid-cols-3 gap-3">
                <div>
                  <Label>Fert Cost (per ac)</Label>
                  <Input
                    value={Number.isFinite(fertCostPerAc) ? `$${fertCostPerAc.toFixed(2)}` : ""}
                    readOnly
                  />
                </div>
                <div>
                  <Label>Fert Cost (total)</Label>
                  <Input
                    value={Number.isFinite(fertCostTotal) ? `$${fertCostTotal.toFixed(2)}` : ""}
                    readOnly
                  />
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Tip: Soil test first—clover establishment can reduce N needs.
            </div>
          </div>

          {/* Lime */}
          <div className="border rounded-xl p-3 bg-white/70">
            <div className="font-medium mb-2">Lime</div>
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <div>
                <Label>Lime Rate (tons/ac)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={limeRate}
                  onChange={(e) => setLimeRate(e.target.value)}
                />
              </div>
              <div>
                <Label>Lime Cost ($/ton applied)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={limeCost}
                  onChange={(e) => setLimeCost(e.target.value)}
                />
              </div>
              <div>
                <Label>Lime Cost (per ac)</Label>
                <Input
                  value={Number.isFinite(limeCostPerAc) ? `$${limeCostPerAc.toFixed(2)}` : ""}
                  readOnly
                />
              </div>
              <div>
                <Label>Lime Cost (total)</Label>
                <Input
                  value={Number.isFinite(limeCostTotal) ? `$${limeCostTotal.toFixed(2)}` : ""}
                  readOnly
                />
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Target pH ~6.2–6.8 for legumes/most grasses (follow soil test).
            </div>
          </div>

          {/* Summary */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="border rounded-xl p-3 bg-white/60">
              <div className="font-medium mb-1">Per-acre Cost</div>
              <div className="text-lg font-semibold">
                {Number.isFinite(totalPerAc) ? `$${totalPerAc.toFixed(2)}` : "-"}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                = Seed + Fertilizer + Lime per acre
              </div>
            </div>
            <div className="border rounded-xl p-3 bg-white/60">
              <div className="font-medium mb-1">Project Total</div>
              <div className="text-lg font-semibold">
                {Number.isFinite(totalProject) ? `$${totalProject.toFixed(2)}` : "-"}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Based on <b>{acresNum || 0} ac</b>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => alert("Coming soon: save to Supabase & generate PDF spec sheet")}
            >
              Save Plan
            </Button>
            <Button
              onClick={() => alert("Coming soon: export a printable PDF with recipe & cost summary")}
            >
              Export PDF
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

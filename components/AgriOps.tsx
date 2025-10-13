"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Herd = {
  id?: number;
  tenant_id: string;
  name: string;
  headcount: number;
  avg_weight_lb: number;
  intake_pct_bw: number; // % bodyweight intake as DM
};

type Paddock = {
  id?: number;
  tenant_id: string;
  name: string;
  acres: number;
  forage_dm_lb_ac: number; // standing DM (lb/ac)
  util_pct: number;        // planned utilization %
  rest_days: number;
};

type FeedItem = {
  id?: number;
  tenant_id: string;
  feed_name: string;
  units: number;
  weight_per_unit_lb: number;
  dry_matter_pct: number;
  cost_per_unit?: number | null;
};

const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};

let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPABASE.url.startsWith("http")) {
  supabase = createClient(SUPABASE.url, SUPABASE.anon);
}

// number format helpers
const nf0 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
const nf1 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);
const pctFmt = (n: number) =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)}%`;

export default function GrazingPlanner({ tenantId }: { tenantId: string }) {
  // planner controls
  const [days, setDays] = useState(30);               // planning horizon
  const [growthDmLbAcDay, setGrowthDmLbAcDay] = useState(35); // lb DM / ac / day
  const [targetResidualDmLbAc, setTargetResidualDmLbAc] = useState(1200); // leave behind target
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // herd state
  const [herd, setHerd] = useState<Herd>({
    tenant_id: tenantId,
    name: "Main Herd",
    headcount: 25,
    avg_weight_lb: 1200,
    intake_pct_bw: 2.6,
  });

  // paddocks
  const [paddocks, setPaddocks] = useState<Paddock[]>([
    { tenant_id: tenantId, name: "North 1", acres: 12, forage_dm_lb_ac: 2500, util_pct: 45, rest_days: 30 },
    { tenant_id: tenantId, name: "North 2", acres: 10, forage_dm_lb_ac: 2400, util_pct: 45, rest_days: 30 },
  ]);

  // optional feed inventory (read-only for now; you can later deduct deficits)
  const [feed, setFeed] = useState<FeedItem[]>([]);

  // derived calculations
  const dailyNeedLbDM = useMemo(
    () => herd.headcount * herd.avg_weight_lb * (herd.intake_pct_bw / 100),
    [herd]
  );

  const grazeableDM = useMemo(() => {
    // sum of ( (standing - residual) * util% ) * acres across paddocks
    return paddocks.reduce((a, p) => {
      const takeablePerAc = Math.max(0, p.forage_dm_lb_ac - targetResidualDmLbAc) * (p.util_pct / 100);
      return a + takeablePerAc * p.acres;
    }, 0);
  }, [paddocks, targetResidualDmLbAc]);

  const growthDMOverHorizon = useMemo(
    () => paddocks.reduce((a, p) => a + growthDmLbAcDay * p.acres * days, 0),
    [paddocks, growthDmLbAcDay, days]
  );

  const totalAvailableDM = grazeableDM + growthDMOverHorizon;
  const coverageDaysFromPasture = dailyNeedLbDM > 0 ? totalAvailableDM / dailyNeedLbDM : 0;
  const deficitLbDM = Math.max(0, days * dailyNeedLbDM - totalAvailableDM);

  // simple rotation suggestion (proportional DM allocation)
  const rotation = useMemo(() => {
    const totalTakeable = paddocks.reduce((a, p) => {
      const takeablePerAc = Math.max(0, p.forage_dm_lb_ac - targetResidualDmLbAc) * (p.util_pct / 100);
      return a + takeablePerAc * p.acres;
    }, 0) || 1;

    return paddocks.map((p) => {
      const takeablePerAc = Math.max(0, p.forage_dm_lb_ac - targetResidualDmLbAc) * (p.util_pct / 100);
      const takeableDM = takeablePerAc * p.acres;
      const share = takeableDM / totalTakeable;
      const growthShare = growthDMOverHorizon * share;
      const dmForHerd = takeableDM + growthShare;
      const daysHere = dailyNeedLbDM > 0 ? dmForHerd / dailyNeedLbDM : 0;
      return { name: p.name, acres: p.acres, takeableDM, daysHere };
    });
  }, [paddocks, targetResidualDmLbAc, growthDMOverHorizon, dailyNeedLbDM]);

  // cloud sync
  async function loadCloud() {
    if (!supabase) return alert("Supabase not configured");
    setLoading(true);
    const [h, padds, inv] = await Promise.all([
      supabase.from("agriops_herds").select("*").eq("tenant_id", tenantId).limit(1).maybeSingle(),
      supabase.from("agriops_paddocks").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("agriops_feed_inventory").select("*").eq("tenant_id", tenantId),
    ]);
    setLoading(false);

    if (h.error) alert(h.error.message);
    if (padds.error) alert(padds.error.message);
    if (inv.error) alert(inv.error.message);

    if (h.data) {
      setHerd({
        tenant_id: tenantId,
        name: h.data.name,
        headcount: Number(h.data.headcount),
        avg_weight_lb: Number(h.data.avg_weight_lb),
        intake_pct_bw: Number(h.data.intake_pct_bw),
      });
    }
    if (padds.data) {
      setPaddocks(
        (padds.data as any[]).map((p) => ({
          tenant_id: tenantId,
          name: p.name,
          acres: Number(p.acres),
          forage_dm_lb_ac: Number(p.forage_dm_lb_ac),
          util_pct: Number(p.util_pct),
          rest_days: Number(p.rest_days),
        }))
      );
    }
    if (inv.data) setFeed(inv.data as any);
  }

  async function saveCloud() {
    if (!supabase) return alert("Supabase not configured");
    setLoading(true);

    const { error: e1 } = await supabase
      .from("agriops_herds")
      .upsert(
        {
          tenant_id: tenantId,
          name: herd.name,
          headcount: herd.headcount,
          avg_weight_lb: herd.avg_weight_lb,
          intake_pct_bw: herd.intake_pct_bw,
        },
        { onConflict: "tenant_id,name" } as any
      );

    const { error: e2 } = await supabase
      .from("agriops_paddocks")
      .upsert(
        paddocks.map((p) => ({
          tenant_id: tenantId,
          name: p.name,
          acres: p.acres,
          forage_dm_lb_ac: p.forage_dm_lb_ac,
          util_pct: p.util_pct,
          rest_days: p.rest_days,
        })),
        { onConflict: "tenant_id,name" } as any
      );

    setLoading(false);
    if (e1 || e2) return alert(e1?.message || e2?.message);
    setSaveMsg("Saved ✓");
    setTimeout(() => setSaveMsg(null), 1500);
  }

  // small UI helpers
  function updatePaddock(i: number, patch: Partial<Paddock>) {
    setPaddocks((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function addPaddock() {
    setPaddocks((prev) => [
      ...prev,
      { tenant_id: tenantId, name: `Paddock ${prev.length + 1}`, acres: 8, forage_dm_lb_ac: 2400, util_pct: 45, rest_days: 30 },
    ]);
  }
  function removePaddock(i: number) {
    setPaddocks((prev) => prev.filter((_, idx) => idx !== i));
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Grazing & Feed Planner – Summary", 14, 16);
    doc.setFontSize(10);
    doc.text(`Tenant: ${tenantId}`, 14, 24);
    doc.text(`Herd: ${herd.name}  Head: ${herd.headcount}  Avg Wt: ${herd.avg_weight_lb} lb  Intake: ${herd.intake_pct_bw}% BW`, 14, 30);
    doc.text(`Plan horizon: ${days} days`, 14, 36);

    doc.text(`Daily herd need: ${nf0(dailyNeedLbDM)} lb DM`, 14, 46);
    doc.text(`Grazeable DM: ${nf0(grazeableDM)} lb`, 14, 52);
    doc.text(`Growth over horizon: ${nf0(growthDMOverHorizon)} lb`, 14, 58);
    doc.text(`Total available: ${nf0(totalAvailableDM)} lb`, 14, 64);
    doc.text(`Coverage (pasture): ${nf1(coverageDaysFromPasture)} days`, 14, 70);
    if (deficitLbDM > 0) doc.text(`Supplement needed: ${nf0(deficitLbDM)} lb DM over ${days} days`, 14, 76);

    let y = 86;
    doc.setFontSize(11);
    doc.text("Rotation suggestion:", 14, y);
    doc.setFontSize(10);
    y += 6;

    rotation.forEach((r) => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(`• ${r.name}: ${nf0(r.takeableDM)} lb DM  ≈  ${nf1(r.daysHere)} days`, 16, y);
      y += 6;
    });

    doc.save("grazing-plan.pdf");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Grazing & Feed Planner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Planner controls */}
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <Label>Plan Horizon (days)</Label>
            <Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value || 0))} />
          </div>
          <div>
            <Label>Growth (lb DM/ac/day)</Label>
            <Input type="number" value={growthDmLbAcDay} onChange={(e) => setGrowthDmLbAcDay(Number(e.target.value || 0))} />
          </div>
          <div>
            <Label>Target Residual (lb DM/ac)</Label>
            <Input type="number" value={targetResidualDmLbAc} onChange={(e) => setTargetResidualDmLbAc(Number(e.target.value || 0))} />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={loadCloud} disabled={loading}>Load</Button>
            <Button variant="outline" onClick={saveCloud} disabled={loading}>{saveMsg || "Save"}</Button>
            <Button onClick={exportPDF}>Export PDF</Button>
          </div>
        </div>

        {/* Herd form */}
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label>Herd Name</Label>
            <Input value={herd.name} onChange={(e) => setHerd({ ...herd, name: e.target.value })} />
          </div>
          <div>
            <Label>Headcount</Label>
            <Input type="number" value={herd.headcount} onChange={(e) => setHerd({ ...herd, headcount: Number(e.target.value || 0) })} />
          </div>
          <div>
            <Label>Avg Weight (lb)</Label>
            <Input type="number" value={herd.avg_weight_lb} onChange={(e) => setHerd({ ...herd, avg_weight_lb: Number(e.target.value || 0) })} />
          </div>
          <div>
            <Label>Intake % BW</Label>
            <Input type="number" step="0.1" value={herd.intake_pct_bw} onChange={(e) => setHerd({ ...herd, intake_pct_bw: Number(e.target.value || 0) })} />
          </div>
        </div>

        {/* Paddocks table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-medium">Paddocks</Label>
            <Button size="sm" variant="outline" onClick={addPaddock}>Add Paddock</Button>
          </div>
          <div className="overflow-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Acres</th>
                  <th className="text-left p-2">Standing DM (lb/ac)</th>
                  <th className="text-left p-2">Utilization %</th>
                  <th className="text-left p-2">Rest Days</th>
                  <th className="text-left p-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {paddocks.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">
                      <Input value={p.name} onChange={(e) => updatePaddock(i, { name: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={p.acres} onChange={(e) => updatePaddock(i, { acres: Number(e.target.value || 0) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={p.forage_dm_lb_ac} onChange={(e) => updatePaddock(i, { forage_dm_lb_ac: Number(e.target.value || 0) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={p.util_pct} onChange={(e) => updatePaddock(i, { util_pct: Number(e.target.value || 0) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={p.rest_days} onChange={(e) => updatePaddock(i, { rest_days: Number(e.target.value || 0) })} />
                    </td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="destructive" onClick={() => removePaddock(i)}>Remove</Button>
                    </td>
                  </tr>
                ))}
                {paddocks.length === 0 && (
                  <tr><td className="p-2" colSpan={6}>No paddocks yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="grid md:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl border bg-white/60 text-sm">Daily Herd Need: <b>{nf0(dailyNeedLbDM)}</b> lb DM</div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">Grazeable DM: <b>{nf0(grazeableDM)}</b> lb</div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">Growth (horizon): <b>{nf0(growthDMOverHorizon)}</b> lb</div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">Total Available: <b>{nf0(totalAvailableDM)}</b> lb</div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">Coverage (pasture): <b>{nf1(coverageDaysFromPasture)}</b> days</div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Supplement Needed: <b>{deficitLbDM > 0 ? nf0(deficitLbDM) + " lb" : "None"}</b>
          </div>
        </div>

        {/* Rotation suggestion */}
        <div>
          <Label className="font-medium">Rotation Suggestion</Label>
          <div className="mt-2 space-y-1">
            {rotation.map((r, i) => (
              <div key={i} className="text-sm">
                • <b>{r.name}</b>: {nf0(r.takeableDM)} lb DM ≈ {nf1(r.daysHere)} days
              </div>
            ))}
            {rotation.length === 0 && <div className="text-sm">Add paddocks to see a rotation.</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

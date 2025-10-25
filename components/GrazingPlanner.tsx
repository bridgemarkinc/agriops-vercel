"use client";

import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ───────── Types ───────── */
type PaddockFromServer = {
  id: number;
  tenant_id: string;
  name: string;
  acres: number;
  zone: string | null;
  notes: string | null;
  head_count?: number | null;
};

type PlannerPaddock = {
  id: number;
  tenant_id: string;
  name: string;
  acres: number;
  /** local-only fields for planning */
  forage_dm_lb_ac: number; // standing DM (lb/ac)
  util_pct: number;        // planned utilization %
  rest_days: number;
};

type Herd = {
  name: string;
  headcount: number;
  avg_weight_lb: number;
  intake_pct_bw: number; // % bodyweight intake as DM
};

/* number formatters */
const nf0 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
const nf1 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);

/* ───────── Component ───────── */
export default function GrazingPlanner({ tenantId }: { tenantId: string }) {
  // planner controls
  const [days, setDays] = useState(30);                       // planning horizon
  const [growthDmLbAcDay, setGrowthDmLbAcDay] = useState(35); // lb DM / ac / day
  const [targetResidualDmLbAc, setTargetResidualDmLbAc] = useState(1200); // leave-behind target

  // herd (local only)
  const [herd, setHerd] = useState<Herd>({
    name: "Main Herd",
    headcount: 25,
    avg_weight_lb: 1200,
    intake_pct_bw: 2.6,
  });

  // paddocks (pulled from server, then augmented with planning fields)
  const [paddocks, setPaddocks] = useState<PlannerPaddock[]>([]);
  const [loadingPads, setLoadingPads] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  /* Load paddocks from your server API so they reflect Pasture Maintenance */
  async function loadPaddocks() {
    try {
      setLoadingPads(true);
      setLoadErr(null);
      const res = await fetch("/api/paddocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listWithCounts", tenant_id: tenantId }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load paddocks");

      const rows: PaddockFromServer[] = json.data || [];
      // Map to local-with-defaults for planning fields (not persisted)
      const mapped: PlannerPaddock[] = rows.map((p) => ({
        id: p.id,
        tenant_id: p.tenant_id,
        name: p.name,
        acres: Number(p.acres) || 0,
        forage_dm_lb_ac: 2400, // default; feel free to tweak
        util_pct: 45,          // default utilization %
        rest_days: 30,         // default
      }));
      setPaddocks(mapped);
    } catch (e: any) {
      console.error(e);
      setLoadErr(e.message || "Failed to load paddocks");
    } finally {
      setLoadingPads(false);
    }
  }

  useEffect(() => {
    if (!tenantId) return;
    loadPaddocks().catch(() => {});
  }, [tenantId]);

  /* derived calcs */
  const dailyNeedLbDM = useMemo(
    () => herd.headcount * herd.avg_weight_lb * (herd.intake_pct_bw / 100),
    [herd]
  );

  const grazeableDM = useMemo(() => {
    // sum of ( (standing - residual) * util% ) * acres across paddocks
    return paddocks.reduce((a, p) => {
      const standing = Math.max(0, Number(p.forage_dm_lb_ac) || 0);
      const takeablePerAc =
        Math.max(0, standing - targetResidualDmLbAc) * ((Number(p.util_pct) || 0) / 100);
      const acres = Number(p.acres) || 0;
      return a + takeablePerAc * acres;
    }, 0);
  }, [paddocks, targetResidualDmLbAc]);

  const growthDMOverHorizon = useMemo(
    () => paddocks.reduce((a, p) => a + (Number(growthDmLbAcDay) || 0) * (Number(p.acres) || 0) * (Number(days) || 0), 0),
    [paddocks, growthDmLbAcDay, days]
  );

  const totalAvailableDM = grazeableDM + growthDMOverHorizon;
  const coverageDaysFromPasture = dailyNeedLbDM > 0 ? totalAvailableDM / dailyNeedLbDM : 0;
  const deficitLbDM = Math.max(0, (Number(days) || 0) * dailyNeedLbDM - totalAvailableDM);

  // simple rotation suggestion (proportional DM allocation)
  const rotation = useMemo(() => {
    const totalTakeable =
      paddocks.reduce((a, p) => {
        const standing = Math.max(0, Number(p.forage_dm_lb_ac) || 0);
        const takeablePerAc =
          Math.max(0, standing - targetResidualDmLbAc) * ((Number(p.util_pct) || 0) / 100);
        const acres = Number(p.acres) || 0;
        return a + takeablePerAc * acres;
      }, 0) || 1;

    return paddocks.map((p) => {
      const standing = Math.max(0, Number(p.forage_dm_lb_ac) || 0);
      const takeablePerAc =
        Math.max(0, standing - targetResidualDmLbAc) * ((Number(p.util_pct) || 0) / 100);
      const acres = Number(p.acres) || 0;
      const takeableDM = takeablePerAc * acres;
      const share = takeableDM / totalTakeable;
      const growthShare = growthDMOverHorizon * share;
      const dmForHerd = takeableDM + growthShare;
      const daysHere = dailyNeedLbDM > 0 ? dmForHerd / dailyNeedLbDM : 0;
      return { name: p.name, acres, takeableDM, daysHere };
    });
  }, [paddocks, targetResidualDmLbAc, growthDMOverHorizon, dailyNeedLbDM]);

  // UI helpers
  function updatePaddock(i: number, patch: Partial<PlannerPaddock>) {
    setPaddocks((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  /* PDF export */
  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Grazing & Feed Planner – Summary", 14, 16);
    doc.setFontSize(10);
    doc.text(`Tenant: ${tenantId}`, 14, 24);
    doc.text(
      `Herd: ${herd.name}  Head: ${herd.headcount}  Avg Wt: ${herd.avg_weight_lb} lb  Intake: ${herd.intake_pct_bw}% BW`,
      14,
      30
    );
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
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(`• ${r.name}: ${nf0(r.takeableDM)} lb DM  ≈  ${nf1(r.daysHere)} days`, 16, y);
      y += 6;
    });

    doc.save("grazing-plan.pdf");
  }

  /* ───────── Render ───────── */
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
            <Input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value || 0))}
            />
          </div>
          <div>
            <Label>Growth (lb DM/ac/day)</Label>
            <Input
              type="number"
              value={growthDmLbAcDay}
              onChange={(e) => setGrowthDmLbAcDay(Number(e.target.value || 0))}
            />
          </div>
          <div>
            <Label>Target Residual (lb DM/ac)</Label>
            <Input
              type="number"
              value={targetResidualDmLbAc}
              onChange={(e) => setTargetResidualDmLbAc(Number(e.target.value || 0))}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={loadPaddocks} disabled={loadingPads}>
              {loadingPads ? "Loading…" : "Reload Paddocks"}
            </Button>
            <Button onClick={exportPDF}>Export PDF</Button>
          </div>
        </div>

        {/* Herd form */}
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label>Herd Name</Label>
            <Input
              value={herd.name}
              onChange={(e) => setHerd({ ...herd, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Headcount</Label>
            <Input
              type="number"
              value={herd.headcount}
              onChange={(e) =>
                setHerd({ ...herd, headcount: Number(e.target.value || 0) })
              }
            />
          </div>
          <div>
            <Label>Avg Weight (lb)</Label>
            <Input
              type="number"
              value={herd.avg_weight_lb}
              onChange={(e) =>
                setHerd({ ...herd, avg_weight_lb: Number(e.target.value || 0) })
              }
            />
          </div>
          <div>
            <Label>Intake % BW</Label>
            <Input
              type="number"
              step="0.1"
              value={herd.intake_pct_bw}
              onChange={(e) =>
                setHerd({ ...herd, intake_pct_bw: Number(e.target.value || 0) })
              }
            />
          </div>
        </div>

        {/* Paddocks table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-medium">Paddocks (from Pasture Maintenance)</Label>
            {loadErr ? (
              <span className="text-sm text-red-600">{loadErr}</span>
            ) : (
              <span className="text-sm text-slate-600">
                {loadingPads ? "Loading…" : `Loaded ${paddocks.length}`}
              </span>
            )}
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
                </tr>
              </thead>
              <tbody>
                {paddocks.map((p, i) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
                      <Input
                        value={p.name}
                        onChange={(e) => updatePaddock(i, { name: e.target.value })}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={p.acres}
                        onChange={(e) =>
                          updatePaddock(i, { acres: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={p.forage_dm_lb_ac}
                        onChange={(e) =>
                          updatePaddock(i, { forage_dm_lb_ac: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={p.util_pct}
                        onChange={(e) =>
                          updatePaddock(i, { util_pct: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        value={p.rest_days}
                        onChange={(e) =>
                          updatePaddock(i, { rest_days: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                  </tr>
                ))}
                {paddocks.length === 0 && (
                  <tr>
                    <td className="p-2" colSpan={5}>
                      No paddocks yet. Add paddocks in Pasture Maintenance, then click “Reload Paddocks”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="grid md:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Daily Herd Need: <b>{nf0(dailyNeedLbDM)}</b> lb DM
          </div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Grazeable DM: <b>{nf0(grazeableDM)}</b> lb
          </div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Growth (horizon): <b>{nf0(growthDMOverHorizon)}</b> lb
          </div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Total Available: <b>{nf0(totalAvailableDM)}</b> lb
          </div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Coverage (pasture): <b>{nf1(coverageDaysFromPasture)}</b> days
          </div>
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
            {rotation.length === 0 && (
              <div className="text-sm">Add paddocks (or reload) to see a rotation.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

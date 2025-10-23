"use client";

import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePaddocks } from "@/components/hooks/usePaddocks";

/** Paddocks from shared API/hook. */
type Paddock = {
  id: number;
  name: string;
  acres: number | null;   // <-- may be null from DB
  head_count?: number;
};

/** Local (in-memory) per-paddock planner settings. */
type PadSettings = {
  forage_dm_lb_ac: number;
  util_pct: number;
  rest_days: number;
};

type Herd = {
  name: string;
  headcount: number;
  avg_weight_lb: number;
  intake_pct_bw: number;
};

const nf0 = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
const nf1 = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);

export default function GrazingPlanner({ tenantId }: { tenantId: string }) {
  const [herd, setHerd] = useState<Herd>({
    name: "Main Herd",
    headcount: 25,
    avg_weight_lb: 1200,
    intake_pct_bw: 2.6,
  });

  const { paddocks, deletePaddock } = usePaddocks(tenantId);

  const [padSettings, setPadSettings] = useState<Record<number, PadSettings>>({});

  useEffect(() => {
    if (!paddocks || paddocks.length === 0) return;
    setPadSettings((prev) => {
      const next = { ...prev };
      for (const p of paddocks) {
        if (!next[p.id]) {
          next[p.id] = { forage_dm_lb_ac: 2400, util_pct: 45, rest_days: 30 };
        }
      }
      for (const k of Object.keys(next)) {
        const id = Number(k);
        if (!paddocks.find((pd) => pd.id === id)) delete next[id];
      }
      return next;
    });
  }, [paddocks]);

  const [days, setDays] = useState(30);
  const [growthDmLbAcDay, setGrowthDmLbAcDay] = useState(35);
  const [targetResidualDmLbAc, setTargetResidualDmLbAc] = useState(1200);

  const dailyNeedLbDM = useMemo(
    () => herd.headcount * herd.avg_weight_lb * (herd.intake_pct_bw / 100),
    [herd]
  );

  const grazeableDM = useMemo(() => {
    return paddocks.reduce((a, p) => {
      const s = padSettings[p.id];
      if (!s) return a;
      const acres = p.acres ?? 0; // <-- guard
      const takeablePerAc =
        Math.max(0, s.forage_dm_lb_ac - targetResidualDmLbAc) * (s.util_pct / 100);
      return a + takeablePerAc * acres;
    }, 0);
  }, [paddocks, padSettings, targetResidualDmLbAc]);

  const growthDMOverHorizon = useMemo(() => {
    return paddocks.reduce((a, p) => {
      const acres = p.acres ?? 0; // <-- guard
      return a + growthDmLbAcDay * acres * days;
    }, 0);
  }, [paddocks, growthDmLbAcDay, days]);

  const totalAvailableDM = grazeableDM + growthDMOverHorizon;
  const coverageDaysFromPasture = dailyNeedLbDM > 0 ? totalAvailableDM / dailyNeedLbDM : 0;
  const deficitLbDM = Math.max(0, days * dailyNeedLbDM - totalAvailableDM);

  const rotation = useMemo(() => {
    const totalTakeable =
      paddocks.reduce((a, p) => {
        const s = padSettings[p.id];
        if (!s) return a;
        const acres = p.acres ?? 0;
        const takeablePerAc =
          Math.max(0, s.forage_dm_lb_ac - targetResidualDmLbAc) * (s.util_pct / 100);
        return a + takeablePerAc * acres;
      }, 0) || 1;

    return paddocks.map((p) => {
      const s = padSettings[p.id];
      const acres = p.acres ?? 0;
      const takeablePerAc = s
        ? Math.max(0, s.forage_dm_lb_ac - targetResidualDmLbAc) * (s.util_pct / 100)
        : 0;
      const takeableDM = takeablePerAc * acres;
      const share = takeableDM / totalTakeable;
      const growthShare = growthDMOverHorizon * share;
      const dmForHerd = takeableDM + growthShare;
      const daysHere = dailyNeedLbDM > 0 ? dmForHerd / dailyNeedLbDM : 0;
      return { id: p.id, name: p.name, daysHere };
    });
  }, [paddocks, padSettings, targetResidualDmLbAc, growthDMOverHorizon, dailyNeedLbDM]);

  function updatePadSetting(id: number, patch: Partial<PadSettings>) {
    setPadSettings((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Grazing & Feed Planner – Summary", 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Herd: ${herd.name}  Head: ${herd.headcount}  Avg Wt: ${herd.avg_weight_lb} lb  Intake: ${herd.intake_pct_bw}% BW`,
      14,
      26
    );
    doc.text(`Plan horizon: ${days} days`, 14, 34);
    doc.text(`Coverage (pasture): ${nf1(coverageDaysFromPasture)} days`, 14, 44);
    if (deficitLbDM > 0) doc.text(`Supplement needed: ${nf0(deficitLbDM)} lb`, 14, 52);

    let y = 62;
    doc.setFontSize(11);
    doc.text("Rotation suggestion:", 14, y);
    y += 6;
    doc.setFontSize(10);
    rotation.forEach((r) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(`• ${r.name}: ${nf1(r.daysHere)} days`, 16, y);
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
              onChange={(e) =>
                setTargetResidualDmLbAc(Number(e.target.value || 0))
              }
            />
          </div>
          <div className="flex items-end">
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
                setHerd({
                  ...herd,
                  avg_weight_lb: Number(e.target.value || 0),
                })
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
                setHerd({
                  ...herd,
                  intake_pct_bw: Number(e.target.value || 0),
                })
              }
            />
          </div>
        </div>

        {/* Paddocks + local settings */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-medium">Paddocks</Label>
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
                {paddocks.map((p) => {
                  const s = padSettings[p.id];
                  const acres = p.acres ?? 0; // <-- guard for display
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="p-2">{p.name}</td>
                      <td className="p-2">{acres}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={s?.forage_dm_lb_ac ?? 2400}
                          onChange={(e) =>
                            updatePadSetting(p.id, {
                              forage_dm_lb_ac: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={s?.util_pct ?? 45}
                          onChange={(e) =>
                            updatePadSetting(p.id, {
                              util_pct: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={s?.rest_days ?? 30}
                          onChange={(e) =>
                            updatePadSetting(p.id, {
                              rest_days: Number(e.target.value || 0),
                            })
                          }
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deletePaddock(p.id)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {paddocks.length === 0 && (
                  <tr>
                    <td className="p-2" colSpan={6}>
                      No paddocks yet — add them in Pasture Maintenance.
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
            Total Available: <b>{nf0(grazeableDM + growthDMOverHorizon)}</b> lb
          </div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Coverage (pasture): <b>{nf1(coverageDaysFromPasture)}</b> days
          </div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Supplement Needed:{" "}
            <b>{deficitLbDM > 0 ? nf0(deficitLbDM) + " lb" : "None"}</b>
          </div>
        </div>

        {/* Rotation suggestion */}
        <div>
          <Label className="font-medium">Rotation Suggestion</Label>
          <div className="mt-2 space-y-1">
            {rotation.map((r) => (
              <div key={r.id} className="text-sm">
                • <b>{r.name}</b>: {nf1(r.daysHere)} days
              </div>
            ))}
            {rotation.length === 0 && (
              <div className="text-sm">Add paddocks to see a rotation.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

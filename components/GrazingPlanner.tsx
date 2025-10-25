"use client";

import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** API helper (same as PastureMaintenance) */
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

type Herd = {
  tenant_id: string;
  name: string;
  headcount: number;
  avg_weight_lb: number;
  intake_pct_bw: number;
};

type Paddock = {
  id: number;
  tenant_id: string;
  name: string;
  acres: number | null;
  forage_dm_lb_ac: number | null;
  util_pct: number | null;
  rest_days: number | null;
  zone?: string | null;
  notes?: string | null;
};

const nf0 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
const nf1 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);
const pctFmt = (n: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)}%`;

export default function GrazingPlanner({ tenantId }: { tenantId: string }) {
  const [days, setDays] = useState(30);
  const [growthDmLbAcDay, setGrowthDmLbAcDay] = useState(35);
  const [targetResidualDmLbAc, setTargetResidualDmLbAc] = useState(1200);
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [herd, setHerd] = useState<Herd>({
    tenant_id: tenantId,
    name: "Main Herd",
    headcount: 25,
    avg_weight_lb: 1200,
    intake_pct_bw: 2.6,
  });

  const [paddocks, setPaddocks] = useState<Paddock[]>([]);

  const dailyNeedLbDM = useMemo(
    () => herd.headcount * herd.avg_weight_lb * (herd.intake_pct_bw / 100),
    [herd]
  );

  const grazeableDM = useMemo(() => {
    return paddocks.reduce((a, p) => {
      const standing = Number(p.forage_dm_lb_ac ?? 0);
      const util = Number(p.util_pct ?? 0) / 100;
      const acres = Number(p.acres ?? 0);
      const takeablePerAc = Math.max(0, standing - targetResidualDmLbAc) * util;
      return a + takeablePerAc * acres;
    }, 0);
  }, [paddocks, targetResidualDmLbAc]);

  const growthDMOverHorizon = useMemo(
    () => paddocks.reduce((a, p) => a + Number(p.acres ?? 0) * growthDmLbAcDay * days, 0),
    [paddocks, growthDmLbAcDay, days]
  );

  const totalAvailableDM = grazeableDM + growthDMOverHorizon;
  const coverageDaysFromPasture = dailyNeedLbDM > 0 ? totalAvailableDM / dailyNeedLbDM : 0;
  const deficitLbDM = Math.max(0, days * dailyNeedLbDM - totalAvailableDM);

  const rotation = useMemo(() => {
    const totalTakeable =
      paddocks.reduce((a, p) => {
        const standing = Number(p.forage_dm_lb_ac ?? 0);
        const util = Number(p.util_pct ?? 0) / 100;
        const acres = Number(p.acres ?? 0);
        const takeablePerAc = Math.max(0, standing - targetResidualDmLbAc) * util;
        return a + takeablePerAc * acres;
      }, 0) || 1;

    return paddocks.map((p) => {
      const standing = Number(p.forage_dm_lb_ac ?? 0);
      const util = Number(p.util_pct ?? 0) / 100;
      const acres = Number(p.acres ?? 0);
      const takeablePerAc = Math.max(0, standing - targetResidualDmLbAc) * util;
      const takeableDM = takeablePerAc * acres;
      const share = takeableDM / totalTakeable;
      const growthShare = growthDMOverHorizon * share;
      const dmForHerd = takeableDM + growthShare;
      const daysHere = dailyNeedLbDM > 0 ? dmForHerd / dailyNeedLbDM : 0;
      return { name: p.name, acres, takeableDM, daysHere };
    });
  }, [paddocks, targetResidualDmLbAc, growthDMOverHorizon, dailyNeedLbDM]);

  async function loadCloud() {
    setLoading(true);
    try {
      const rows: Paddock[] = await paddocksApi("listWithCounts", { tenant_id: tenantId });
      setPaddocks(rows || []);
    } catch (e: any) {
      alert(e.message || "Failed to load paddocks");
    } finally {
      setLoading(false);
    }
  }

  async function savePaddocks() {
    setLoading(true);
    try {
      for (const p of paddocks) {
        await paddocksApi("upsertPaddock", {
          tenant_id: tenantId,
          row: {
            id: p.id,
            name: p.name,
            acres: p.acres,
            forage_dm_lb_ac: p.forage_dm_lb_ac,
            util_pct: p.util_pct,
            rest_days: p.rest_days,
            zone: p.zone ?? null,
            notes: p.notes ?? null,
          },
        });
      }
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(null), 1500);
    } catch (e: any) {
      alert(e.message || "Failed to save paddocks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCloud().catch(() => {}); }, [tenantId]);

  function updatePaddock(i: number, patch: Partial<Paddock>) {
    setPaddocks((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
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
            <Button variant="outline" onClick={savePaddocks} disabled={loading}>{saveMsg || "Save Paddocks"}</Button>
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
                      <Input value={p.name} onChange={(e) => updatePaddock(i, { name: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={p.acres ?? 0} onChange={(e) => updatePaddock(i, { acres: Number(e.target.value || 0) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={p.forage_dm_lb_ac ?? 0} onChange={(e) => updatePaddock(i, { forage_dm_lb_ac: Number(e.target.value || 0) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={p.util_pct ?? 0} onChange={(e) => updatePaddock(i, { util_pct: Number(e.target.value || 0) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={p.rest_days ?? 0} onChange={(e) => updatePaddock(i, { rest_days: Number(e.target.value || 0) })} />
                    </td>
                  </tr>
                ))}
                {paddocks.length === 0 && (
                  <tr><td className="p-2" colSpan={5}>No paddocks yet.</td></tr>
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


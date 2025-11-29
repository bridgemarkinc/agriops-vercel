"use client";

import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Types mirrored from your app */
type Animal = {
  id: number;
  tenant_id: string;
  tag: string;
  name?: string | null;
  sex?: "M" | "F" | null;
  breed?: string | null;
  birth_date?: string | null;
  current_paddock_id?: number | null;
  current_paddock?: string | null;
  status?: string | null;
  primary_photo_url?: string | null;
  death_date?: string | null;
  death_notes?: string | null;
};

type Weight = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  weigh_date: string;
  weight_lb: number;
  notes?: string | null;
};

type Treatment = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  treat_date: string;
  product?: string | null;
  dose?: string | null;
  notes?: string | null;
};

type Processing = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  tag: string;
  status: string;
  sent_date: string;
  processor?: string | null;
  transport_id?: string | null;
  live_weight_lb?: number | null;
  hot_carcass_weight_lb?: number | null;
  carcass_weight_lb?: number | null;
  grade?: string | null;
  yield_pct?: number | null;
  lot_code?: string | null;
  cut_sheet_url?: string | null;
  invoice_url?: string | null;
  notes?: string | null;
};

type PaddockLite = { id: number; name: string; acres?: number | null };

async function cattleApi<T = any>(action: string, body?: any): Promise<T> {
  const res = await fetch("/api/cattle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(body || {}) }),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}: ${raw?.slice(0, 140)}`);
  return json.data as T;
}

async function paddocksApi<T = any>(tenant_id: string, action: string, body?: any): Promise<T> {
  const res = await fetch("/api/paddocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, tenant_id, ...(body || {}) }),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}: ${raw?.slice(0, 140)}`);
  return json.data as T;
}

const nf0 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
const nf1 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);

type TabKey = "inventory" | "health" | "processing" | "pasture";

export default function ReportsDashboard({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState<TabKey>("inventory");

  // global filters
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // datasets
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [paddocks, setPaddocks] = useState<PaddockLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // derived maps
  const paddockMap = useMemo(() => {
    const m = new Map<number, string>();
    paddocks.forEach((p) => m.set(p.id, p.name));
    return m;
  }, [paddocks]);

  async function loadAll() {
    setErr(null);
    setLoading(true);
    try {
      const [as, ps] = await Promise.all([
        cattleApi<Animal[]>("listAnimals", { tenant_id: tenantId, include_deceased: true }),
        paddocksApi<any[]>(tenantId, "listForPlanner"),
      ]);
      setAnimals(as || []);
      setPaddocks((ps || []).map((r) => ({ id: r.id, name: r.name, acres: r.acres ?? null })));
    } catch (e: any) {
      setErr(e.message || "Failed to load reports data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tenantId) return;
    loadAll().catch(() => {});
  }, [tenantId]);

  /* =============== Inventory Tab =============== */
  const activeAnimals = useMemo(() => animals.filter(a => (a.status || "active").toLowerCase() !== "deceased"), [animals]);
  const deceasedAnimals = useMemo(() => animals.filter(a => (a.status || "").toLowerCase() === "deceased"), [animals]);

  const bySex = useMemo(() => {
    const m = new Map<string, number>();
    activeAnimals.forEach(a => m.set(a.sex || "Unknown", (m.get(a.sex || "Unknown") || 0) + 1));
    return Array.from(m.entries()).map(([sex, count]) => ({ sex, count }));
  }, [activeAnimals]);

  const byPaddock = useMemo(() => {
    const m = new Map<string, number>();
    activeAnimals.forEach(a => {
      const name = a.current_paddock_id != null ? (paddockMap.get(a.current_paddock_id) || "(Unassigned)")
                                                : (a.current_paddock || "(Unassigned)");
      m.set(name, (m.get(name) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]);
  }, [activeAnimals, paddockMap]);

  /* =============== Health Tab (weights & treatments) =============== */
  const [adgRows, setAdgRows] = useState<{ tag: string; name?: string | null; adg: number }[]>([]);
  const [treatSummary, setTreatSummary] = useState<{ product: string; count: number }[]>([]);
  const [healthBusy, setHealthBusy] = useState(false);

  async function runHealthReports() {
    if (!from || !to) return alert("Pick a From and To date for Health reports.");
    setHealthBusy(true);
    try {
      // Treatments summary (one request to listAnimals then per-animal listTreatments)
      const treatCounts = new Map<string, number>();
      // ADG leaderboard (per-animal listWeights)
      const adgList: { tag: string; name?: string | null; adg: number }[] = [];

      // naive per-animal fetch; fine for small/medium herds
      await Promise.all(
        animals.map(async (a) => {
          // Weights
          const ws = await cattleApi<Weight[]>("listWeights", { tenant_id: tenantId, animal_id: a.id });
          const within = ws.filter(w => (!from || w.weigh_date >= from) && (!to || w.weigh_date <= to))
                           .sort((x,y)=>x.weigh_date.localeCompare(y.weigh_date));
          if (within.length >= 2) {
            const first = within[0], last = within[within.length-1];
            const days = (new Date(last.weigh_date).getTime() - new Date(first.weigh_date).getTime()) / 86400000;
            if (days > 0) {
              const adg = (Number(last.weight_lb) - Number(first.weight_lb)) / days;
              adgList.push({ tag: a.tag, name: a.name, adg });
            }
          }

          // Treatments
          const ts = await cattleApi<Treatment[]>("listTreatments", { tenant_id: tenantId, animal_id: a.id });
          ts.forEach(t => {
            if ((!from || t.treat_date >= from) && (!to || t.treat_date <= to)) {
              const key = (t.product || "Unspecified").trim();
              treatCounts.set(key, (treatCounts.get(key) || 0) + 1);
            }
          });
        })
      );

      adgList.sort((a,b)=>b.adg - a.adg);
      setAdgRows(adgList);
      setTreatSummary(Array.from(treatCounts.entries()).map(([product,count])=>({product, count})));
    } catch (e: any) {
      alert(e.message || "Failed to run health reports");
    } finally {
      setHealthBusy(false);
    }
  }

  /* =============== Processing Tab =============== */
  const [processingRows, setProcessingRows] = useState<Processing[]>([]);
  const [procBusy, setProcBusy] = useState(false);

  async function runProcessingReports() {
    setProcBusy(true);
    try {
      // Pull processing per-animal (you can replace with a bulk server action later)
      const rows: Processing[] = [];
      await Promise.all(
        animals.map(async (a) => {
          const ps = await cattleApi<Processing[]>("listProcessing", { tenant_id: tenantId, animal_id: a.id });
          ps.forEach(p => rows.push(p));
        })
      );
      // optional date filter
      const filtered = rows.filter(r => (!from || r.sent_date >= from) && (!to || r.sent_date <= to));
      setProcessingRows(filtered);
    } catch (e: any) {
      alert(e.message || "Failed to load processing reports");
    } finally {
      setProcBusy(false);
    }
  }

  const procByStatus = useMemo(() => {
    const m = new Map<string, number>();
    processingRows.forEach(r => m.set(r.status, (m.get(r.status) || 0) + 1));
    return Array.from(m.entries()).map(([status, count]) => ({ status, count }));
  }, [processingRows]);

  /* =============== Pasture Tab =============== */
  // Quick glance: paddock occupancy and “animals per acre”
  const pastureRows = useMemo(() => {
    const byPad = new Map<number, number>();
    activeAnimals.forEach(a => {
      if (a.current_paddock_id != null) {
        byPad.set(a.current_paddock_id, (byPad.get(a.current_paddock_id) || 0) + 1);
      }
    });
    return paddocks.map(p => {
      const head = byPad.get(p.id) || 0;
      const acres = Number(p.acres ?? 0) || 0;
      const headPerAc = acres > 0 ? head / acres : 0;
      return { id: p.id, name: p.name, acres, head, headPerAc };
    }).sort((a,b)=> (b.headPerAc - a.headPerAc));
  }, [activeAnimals, paddocks]);

  /* =============== Export helpers =============== */
  function exportTableToCSV(filename: string, headers: string[], rows: (string | number)[][]) {
    const csv = [headers, ...rows]
      .map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSectionPDF(title: string, lines: string[]) {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    let y = 54;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, 54, y); y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    lines.forEach(line => {
      if (y > 760) { doc.addPage(); y = 54; }
      doc.text(line, 54, y);
      y += 14;
    });
    doc.save(title.toLowerCase().replace(/\s+/g,"_") + ".pdf");
  }

  /* =============== UI =============== */
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reports</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Global controls */}
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e)=>setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={loadAll} disabled={loading}>{loading ? "Loading…" : "Reload Data"}</Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="text-sm text-slate-500">{err ? <span className="text-red-600">{err}</span> : null}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab==="inventory"} onClick={()=>setTab("inventory")}>Inventory</TabButton>
          <TabButton active={tab==="health"} onClick={()=>setTab("health")}>Health</TabButton>
          <TabButton active={tab==="processing"} onClick={()=>setTab("processing")}>Processing</TabButton>
          <TabButton active={tab==="pasture"} onClick={()=>setTab("pasture")}>Pasture</TabButton>
        </div>

        {/* Inventory */}
        {tab === "inventory" && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-4 gap-3">
              <Kpi title="Total Animals" value={nf0(animals.length)} />
              <Kpi title="Active" value={nf0(activeAnimals.length)} />
              <Kpi title="Deceased" value={nf0(deceasedAnimals.length)} />
              <Kpi title="Paddocks" value={nf0(paddocks.length)} />
            </div>

            <Section
              title="Active by Sex"
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportTableToCSV("active_by_sex.csv", ["Sex","Count"], bySex.map(r=>[r.sex, r.count]))}
                  >
                    Export CSV
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => exportSectionPDF("Active by Sex", bySex.map(r => `${r.sex}: ${r.count}`))}
                  >
                    Export PDF
                  </Button>
                </>
              }
            >
              <table className="w-full text-sm">
                <thead className="bg-slate-100"><tr><th className="p-2 text-left">Sex</th><th className="p-2 text-left">Count</th></tr></thead>
                <tbody>
                  {bySex.map((r,i)=>(
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.sex}</td>
                      <td className="p-2">{r.count}</td>
                    </tr>
                  ))}
                  {!bySex.length && <tr><td className="p-2" colSpan={2}>No active animals.</td></tr>}
                </tbody>
              </table>
            </Section>

            <Section
              title="Active by Paddock"
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportTableToCSV(
                      "active_by_paddock.csv",
                      ["Paddock","Head"],
                      byPaddock.map(([name, count])=>[name, count])
                    )}
                  >
                    Export CSV
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => exportSectionPDF("Active by Paddock", byPaddock.map(([name,count])=> `${name}: ${count}`))}
                  >
                    Export PDF
                  </Button>
                </>
              }
            >
              <table className="w-full text-sm">
                <thead className="bg-slate-100"><tr><th className="p-2 text-left">Paddock</th><th className="p-2 text-left">Head</th></tr></thead>
                <tbody>
                  {byPaddock.map(([name,count])=>(
                    <tr key={name} className="border-t">
                      <td className="p-2">{name}</td>
                      <td className="p-2">{count}</td>
                    </tr>
                  ))}
                  {!byPaddock.length && <tr><td className="p-2" colSpan={2}>No active animals.</td></tr>}
                </tbody>
              </table>
            </Section>

            <Section
              title="Deceased Animals"
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportTableToCSV(
                    "deceased_animals.csv",
                    ["Tag","Name","Date","Notes"],
                    deceasedAnimals.map(a=>[a.tag, a.name ?? "", a.death_date ?? "", a.death_notes ?? ""])
                  )}
                >
                  Export CSV
                </Button>
              }
            >
              <table className="w-full text-sm">
                <thead className="bg-slate-100"><tr>
                  <th className="p-2 text-left">Tag</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Notes</th>
                </tr></thead>
                <tbody>
                  {deceasedAnimals.map(a=>(
                    <tr key={a.id} className="border-t">
                      <td className="p-2">{a.tag}</td>
                      <td className="p-2">{a.name}</td>
                      <td className="p-2">{a.death_date}</td>
                      <td className="p-2">{a.death_notes}</td>
                    </tr>
                  ))}
                  {!deceasedAnimals.length && <tr><td className="p-2" colSpan={4}>No deceased animals.</td></tr>}
                </tbody>
              </table>
            </Section>
          </div>
        )}

        {/* Health */}
        {tab === "health" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={runHealthReports} disabled={healthBusy}>{healthBusy ? "Running…" : "Run Health Reports"}</Button>
            </div>

            <Section
              title={`ADG Leaderboard ${from && to ? `(${from} → ${to})` : ""}`}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportTableToCSV("adg_leaderboard.csv", ["Tag","Name","ADG (lb/day)"], adgRows.map(r=>[r.tag, r.name ?? "", r.adg.toFixed(2)]))}
                >
                  Export CSV
                </Button>
              }
            >
              <table className="w-full text-sm">
                <thead className="bg-slate-100"><tr>
                  <th className="p-2 text-left">Tag</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">ADG (lb/day)</th>
                </tr></thead>
                <tbody>
                  {adgRows.map((r,i)=>(
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.tag}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.adg.toFixed(2)}</td>
                    </tr>
                  ))}
                  {!adgRows.length && <tr><td className="p-2" colSpan={3}>No ADG rows for the selected range.</td></tr>}
                </tbody>
              </table>
            </Section>

            <Section
              title={`Treatments Summary ${from && to ? `(${from} → ${to})` : ""}`}
              actions={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportTableToCSV("treatments_summary.csv", ["Product","Count"], treatSummary.map(t=>[t.product, t.count]))}
                  >
                    Export CSV
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => exportSectionPDF("Treatments Summary", treatSummary.map(t => `${t.product}: ${t.count}`))}
                  >
                    Export PDF
                  </Button>
                </>
              }
            >
              <table className="w-full text-sm">
                <thead className="bg-slate-100"><tr><th className="p-2 text-left">Product</th><th className="p-2 text-left">Count</th></tr></thead>
                <tbody>
                  {treatSummary.map((t,i)=>(
                    <tr key={i} className="border-t">
                      <td className="p-2">{t.product}</td>
                      <td className="p-2">{t.count}</td>
                    </tr>
                  ))}
                  {!treatSummary.length && <tr><td className="p-2" colSpan={2}>No treatments for the selected range.</td></tr>}
                </tbody>
              </table>
            </Section>
          </div>
        )}

        {/* Processing */}
        {tab === "processing" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={runProcessingReports} disabled={procBusy}>{procBusy ? "Loading…" : "Load Processing"}</Button>
              {processingRows.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => exportTableToCSV(
                      "processing_rows.csv",
                      ["Date","Tag","Status","Processor","Live Wt","Notes"],
                      processingRows.map(r=>[r.sent_date, r.tag, r.status, r.processor ?? "", r.live_weight_lb ?? "", r.notes ?? ""])
                    )}
                  >
                    Export CSV
                  </Button>
                  <Button
                    onClick={() => exportSectionPDF(
                      "Processing Summary",
                      [
                        ...procByStatus.map(r => `${r.status}: ${r.count}`),
                        "",
                        ...processingRows.map(r=>`${r.sent_date} • ${r.tag} • ${r.status} • ${r.processor ?? ""}`)
                      ]
                    )}
                  >
                    Export PDF
                  </Button>
                </>
              )}
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              {procByStatus.map((r,i)=>(
                <Kpi key={i} title={`Status: ${r.status}`} value={nf0(r.count)} />
              ))}
              {!procByStatus.length && <div className="text-sm text-slate-600">No processing rows (apply date filter and load).</div>}
            </div>

            {processingRows.length > 0 && (
              <div className="overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-left">Tag</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Processor</th>
                      <th className="p-2 text-left">Live Wt</th>
                      <th className="p-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processingRows.map((r,i)=>(
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.sent_date}</td>
                        <td className="p-2">{r.tag}</td>
                        <td className="p-2">{r.status}</td>
                        <td className="p-2">{r.processor}</td>
                        <td className="p-2">{r.live_weight_lb}</td>
                        <td className="p-2">{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Pasture */}
        {tab === "pasture" && (
          <div className="space-y-4">
            <Section
              title="Paddock Occupancy & Animals per Acre"
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportTableToCSV(
                    "paddock_occupancy.csv",
                    ["Paddock","Acres","Head","Head/Ac"],
                    pastureRows.map(r=>[r.name, r.acres ?? "", r.head, r.headPerAc.toFixed(2)])
                  )}
                >
                  Export CSV
                </Button>
              }
            >
              <div className="overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-2 text-left">Paddock</th>
                      <th className="p-2 text-left">Acres</th>
                      <th className="p-2 text-left">Head</th>
                      <th className="p-2 text-left">Head/Ac</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastureRows.map((r)=>(
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.name}</td>
                        <td className="p-2">{r.acres ?? ""}</td>
                        <td className="p-2">{r.head}</td>
                        <td className="p-2">{nf1(r.headPerAc)}</td>
                      </tr>
                    ))}
                    {!pastureRows.length && <tr><td className="p-2" colSpan={4}>No paddocks.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Small UI bits ---------- */

function TabButton({ active, onClick, children }:{ active:boolean; onClick:()=>void; children:React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-lg text-sm border",
        active ? "bg-emerald-600 text-white border-emerald-600" : "bg-white hover:bg-slate-50 border-slate-300"
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Kpi({ title, value }:{ title:string; value:string | number }) {
  return (
    <div className="p-3 rounded-xl border bg-white/70">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-medium">{title}</div>
        <div className="flex gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ─────────────────────────────────────────
   Types
────────────────────────────────────────── */
type Processing = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  tag: string;
  status: string;                   // scheduled | in_transit | received | processed | picked_up | sold
  sent_date: string;                // yyyy-mm-dd
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

type Animal = {
  id?: number;
  tenant_id: string;
  tag: string;
  name?: string | null;
  sex?: "M" | "F" | null;
  breed?: string | null;
  birth_date?: string | null; // yyyy-mm-dd
  current_paddock?: string | null;
  status?: string | null; // active, sold, culled, dead, processing
};

type Weight = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  weigh_date: string; // yyyy-mm-dd
  weight_lb: number;
  notes?: string | null;
};

type Treatment = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  treat_date: string; // yyyy-mm-dd
  product?: string | null;
  dose?: string | null;
  notes?: string | null;
};

/* ─────────────────────────────────────────
   Supabase anon client (browser)
────────────────────────────────────────── */
const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};

let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPABASE.url.startsWith("http")) {
  supabase = createClient(SUPABASE.url, SUPABASE.anon);
}

/* ─────────────────────────────────────────
   Component
────────────────────────────────────────── */
export default function CattleByTag({ tenantId }: { tenantId: string }) {
  // Lists & editing
  const [search, setSearch] = useState("");
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [editing, setEditing] = useState<Animal | null>(null);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [treats, setTreats] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(false);

  // Processing state (✅ moved inside component)
  const [processing, setProcessing] = useState<Processing[]>([]);
  const [procDraft, setProcDraft] = useState<Partial<Processing>>({
    sent_date: "",
    processor: "",
    transport_id: "",
    live_weight_lb: undefined,
    notes: "",
  });

  // Scanner (native input to avoid ref typing issues)
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanValue, setScanValue] = useState("");

  // CSV import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // Reports date range
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // New animal form
  const [draft, setDraft] = useState<Animal>({
    tenant_id: tenantId,
    tag: "",
    name: "",
    sex: undefined,
    breed: "",
    birth_date: "",
    current_paddock: "",
    status: "active",
  });

  /* ─────────────────────────────────────────
     Data loads
  ────────────────────────────────────────── */
  async function loadAnimals() {
    if (!supabase) return alert("Supabase not configured");
    setLoading(true);
    const q = supabase
      .from("agriops_cattle")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("tag");
    const { data, error } = search.trim()
      ? await q.ilike("tag", `%${search.trim()}%`)
      : await q;
    setLoading(false);
    if (error) return alert(error.message);
    setAnimals((data || []) as Animal[]);
  }

  async function loadDetail(animalId: number) {
    if (!supabase) return;
    const [ws, ts] = await Promise.all([
      supabase
        .from("agriops_cattle_weights")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("animal_id", animalId)
        .order("weigh_date", { ascending: false }),
      supabase
        .from("agriops_cattle_treatments")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("animal_id", animalId)
        .order("treat_date", { ascending: false }),
    ]);
    setWeights((ws.data || []) as Weight[]);
    setTreats((ts.data || []) as Treatment[]);
  }

  // ✅ load processing (now inside component so tenantId is in scope)
  async function loadProcessing(animalId: number) {
    const res = await fetch("/api/cattle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "listProcessing",
        tenant_id: tenantId,
        animal_id: animalId,
      }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    setProcessing(json.data || []);
  }

  useEffect(() => {
    loadAnimals().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  /* ─────────────────────────────────────────
     Secure write helper (server route uses service role)
  ────────────────────────────────────────── */
  async function api(action: string, body: any) {
    const res = await fetch("/api/cattle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  /* ─────────────────────────────────────────
     Animal CRUD
  ────────────────────────────────────────── */
  async function saveAnimal() {
    if (!draft.tag.trim()) return alert("Tag is required");
    const payload = {
      tenant_id: tenantId,
      tag: draft.tag.trim(),
      name: draft.name || null,
      sex: draft.sex ? draft.sex.toUpperCase() : null,
      breed: draft.breed || null,
      birth_date: draft.birth_date || null,
      current_paddock: draft.current_paddock || null,
      status: draft.status || null,
    };
    await api("upsertAnimal", { payload });
    setDraft({
      tenant_id: tenantId,
      tag: "",
      name: "",
      sex: undefined,
      breed: "",
      birth_date: "",
      current_paddock: "",
      status: "active",
    });
    await loadAnimals();
  }

  async function updateAnimal(a: Animal) {
    if (!a.id) return;
    const patch = {
      name: a.name || null,
      sex: a.sex || null,
      breed: a.breed || null,
      birth_date: a.birth_date || null,
      current_paddock: a.current_paddock || null,
      status: a.status || null,
    };
    await api("updateAnimal", { id: a.id, tenant_id: tenantId, patch });
    await loadAnimals();
  }

  /* ─────────────────────────────────────────
     Weight & Treatment
  ────────────────────────────────────────── */
  async function addWeight(
    animalId: number,
    weigh_date: string,
    weight_lb: number,
    notes?: string
  ) {
    if (!weigh_date || !weight_lb) return alert("Date and weight are required");
    await api("addWeight", {
      tenant_id: tenantId,
      animal_id: animalId,
      weigh_date,
      weight_lb,
      notes,
    });
    await loadDetail(animalId);
  }

  async function addTreatment(
    animalId: number,
    treat_date: string,
    product?: string,
    dose?: string,
    notes?: string
  ) {
    if (!treat_date) return alert("Date is required");
    await api("addTreatment", {
      tenant_id: tenantId,
      animal_id: animalId,
      treat_date,
      product,
      dose,
      notes,
    });
    await loadDetail(animalId);
  }

  /* ─────────────────────────────────────────
     Processing workflow
  ────────────────────────────────────────── */
  function startEdit(a: Animal) {
    setEditing(a);
    loadDetail(a.id!);
    loadProcessing(a.id!);
  }

  async function sendToProcessing() {
    if (!editing) return;
    if (!procDraft.sent_date) return alert("Sent date is required");

    const payload = {
      action: "sendToProcessing",
      tenant_id: tenantId,
      animal_id: editing.id,
      tag: editing.tag,
      sent_date: procDraft.sent_date,
      processor: procDraft.processor || null,
      transport_id: procDraft.transport_id || null,
      live_weight_lb: procDraft.live_weight_lb
        ? Number(procDraft.live_weight_lb)
        : null,
      notes: procDraft.notes || null,
    };

    const res = await fetch("/api/cattle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.ok) return alert(json.error);

    setProcDraft({
      sent_date: "",
      processor: "",
      transport_id: "",
      live_weight_lb: undefined,
      notes: "",
    });
    await Promise.all([loadAnimals(), loadProcessing(editing.id!)]);
  }

  async function updateProcessingRow(
    row: Processing,
    patch: Partial<Processing>
  ) {
    const res = await fetch("/api/cattle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateProcessing",
        id: row.id,
        tenant_id: tenantId,
        patch,
      }),
    });
    const json = await res.json();
    if (!json.ok) return alert(json.error);
    if (editing?.id) await loadProcessing(editing.id);
  }
// ─────────────────────────────────────────────
// CSV helpers (MUST be inside CattleByTag, above return)
// ─────────────────────────────────────────────
function exportCSV() {
  const header = [
    "tenant_id",
    "tag",
    "name",
    "sex",
    "breed",
    "birth_date",
    "current_paddock",
    "status",
  ];
  const rows = animals.map((a) => [
    tenantId,
    a.tag ?? "",
    a.name ?? "",
    a.sex ?? "",
    a.breed ?? "",
    a.birth_date ?? "",
    a.current_paddock ?? "",
    a.status ?? "",
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cattle_${tenantId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importCSV(file: File) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return setImportMsg("Empty CSV");

  const header = lines[0]
    .split(",")
    .map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols =
      lines[i]
        .match(/("([^"]|"")*"|[^,]*)/g)
        ?.map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"')) || [];
    const get = (n: string) => cols[idx(n)] || "";
    const tag = (get("tag") || "").trim();
    if (!tag) continue;

    rows.push({
      tenant_id: tenantId,
      tag,
      name: get("name") || null,
      sex: (get("sex") || "").toUpperCase() || null,
      breed: get("breed") || null,
      birth_date: get("birth_date") || null,
      current_paddock: get("current_paddock") || null,
      status: get("status") || "active",
    });
  }

  await api("bulkUpsertAnimals", { rows });
  setImportMsg(`Imported ${rows.length} rows`);
  await loadAnimals();
}

  /* ─────────────────────────────────────────
     Scanner & reports
  ────────────────────────────────────────── */
  useEffect(() => {
    scanRef.current?.focus();
  }, [editing]);

  function onScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const tag = scanValue.trim();
      if (!tag) return;
      const found = animals.find(
        (a) => a.tag.toLowerCase() === tag.toLowerCase()
      );
      if (found) startEdit(found);
      else alert(`No animal with tag: ${tag}`);
      setScanValue("");
    }
  }

  const filteredWeights = useMemo(() => {
    let arr = weights;
    if (from) arr = arr.filter((w) => w.weigh_date >= from);
    if (to) arr = arr.filter((w) => w.weigh_date <= to);
    return [...arr].sort((a, b) => a.weigh_date.localeCompare(b.weigh_date));
  }, [weights, from, to]);

  const adg = useMemo(() => {
    if (filteredWeights.length < 2) return null;
    const first = filteredWeights[0],
      last = filteredWeights[filteredWeights.length - 1];
    const days =
      (new Date(last.weigh_date).getTime() -
        new Date(first.weigh_date).getTime()) /
      86400000;
    if (days <= 0) return null;
    return (Number(last.weight_lb) - Number(first.weight_lb)) / days;
  }, [filteredWeights]);

  const treatmentSummary = useMemo(() => {
    const inRange = treats.filter(
      (t) => (!from || t.treat_date >= from) && (!to || t.treat_date <= to)
    );
    const map = new Map<string, number>();
    for (const t of inRange) {
      const key = (t.product || "Unspecified").trim();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([product, count]) => ({
      product,
      count,
    }));
  }, [treats, from, to]);

  /* ─────────────────────────────────────────
     UI
  ────────────────────────────────────────── */
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cattle by Tag</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add / Search / CSV / Scan */}
        <div className="grid lg:grid-cols-3 gap-3">
          {/* New Animal */}
          <div className="border rounded-xl p-3 bg-white/70">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label>Tag *</Label>
                <Input
                  value={draft.tag}
                  onChange={(e) =>
                    setDraft({ ...draft, tag: e.target.value })
                  }
                  placeholder="e.g., BR123"
                />
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  value={draft.name || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Sex</Label>
                <Input
                  value={draft.sex || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sex: (e.target.value.toUpperCase() as any) || undefined,
                    })
                  }
                  placeholder="M or F"
                />
              </div>
              <div>
                <Label>Breed</Label>
                <Input
                  value={draft.breed || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, breed: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Birth Date</Label>
                <Input
                  type="date"
                  value={draft.birth_date || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, birth_date: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Paddock</Label>
                <Input
                  value={draft.current_paddock || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, current_paddock: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input
                  value={draft.status || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value })
                  }
                  placeholder="active/sold/culled/dead"
                />
              </div>
              <div className="col-span-2">
                <Button onClick={saveAnimal} className="w-full">
                  Save Animal
                </Button>
              </div>
            </div>
          </div>

          {/* Search + Scanner + CSV */}
          <div className="lg:col-span-2 border rounded-xl p-3 bg-white/70">
            <div className="grid md:grid-cols-2 gap-2">
              <div>
                <Label>Search</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="Filter by tag (e.g., BR)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={loadAnimals}
                    disabled={loading}
                  >
                    {loading ? "Loading…" : "Refresh"}
                  </Button>
                </div>
              </div>
              <div>
                <Label>Scan Tag (QR/Barcode)</Label>
                {/* native input to guarantee ref works */}
                <input
                  ref={scanRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={onScanKeyDown}
                  placeholder="Focus here and scan; press Enter"
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/5"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              <Button variant="outline" onClick={exportCSV}>
                Export CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCSV(f);
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
              >
                Import CSV
              </Button>
              {importMsg && (
                <span className="text-sm text-green-700">{importMsg}</span>
              )}
            </div>

            {/* List */}
            <div className="overflow-auto mt-3 border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left p-2">Tag</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Sex</th>
                    <th className="text-left p-2">Breed</th>
                    <th className="text-left p-2">Birth</th>
                    <th className="text-left p-2">Paddock</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2 w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {animals.map((a) => (
                    <tr key={a.id || a.tag} className="border-t">
                      <td className="p-2 font-mono">{a.tag}</td>
                      <td className="p-2">{a.name}</td>
                      <td className="p-2">{a.sex}</td>
                      <td className="p-2">{a.breed}</td>
                      <td className="p-2">{a.birth_date}</td>
                      <td className="p-2">{a.current_paddock}</td>
                      <td className="p-2">{a.status}</td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(a)}
                        >
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {animals.length === 0 && (
                    <tr>
                      <td className="p-2" colSpan={8}>
                        No cattle yet. Add your first animal on the left.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detail + Reports + Processing */}
        {editing && (
          <div className="border rounded-xl p-4 bg-white/80">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">
                Tag <span className="font-mono">{editing.tag}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(null)}
              >
                Close
              </Button>
            </div>

            {/* Edit animal info */}
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={editing.name || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Sex</Label>
                <Input
                  value={editing.sex || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      sex: (e.target.value.toUpperCase() as any) || null,
                    })
                  }
                  placeholder="M or F"
                />
              </div>
              <div>
                <Label>Breed</Label>
                <Input
                  value={editing.breed || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, breed: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Birth Date</Label>
                <Input
                  type="date"
                  value={editing.birth_date || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, birth_date: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Paddock</Label>
                <Input
                  value={editing.current_paddock || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, current_paddock: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input
                  value={editing.status || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value })
                  }
                />
              </div>
              <div className="md:col-span-3">
                <Button onClick={() => updateAnimal(editing!)}>
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Weights */}
            <div className="mt-6">
              <div className="font-medium mb-2">Weights</div>
              <WeightEditor
                tenantId={tenantId}
                animalId={editing.id!}
                onAdd={addWeight}
                weights={weights}
              />
            </div>

            {/* Treatments */}
            <div className="mt-6">
              <div className="font-medium mb-2">Treatments</div>
              <TreatEditor
                tenantId={tenantId}
                animalId={editing.id!}
                onAdd={addTreatment}
                treats={treats}
              />
            </div>

            {/* Reports */}
            <div className="mt-6">
              <div className="font-medium mb-2">Reports (date range)</div>
              <div className="grid md:grid-cols-3 gap-2 mb-3">
                <div>
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div>
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => {}}>
                    Apply
                  </Button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="border rounded-lg p-3 bg-white/60">
                  <div className="font-semibold mb-1">
                    Average Daily Gain (ADG)
                  </div>
                  {adg !== null ? (
                    <div className="text-sm">
                      ADG: <b>{adg.toFixed(2)}</b> lb/day
                    </div>
                  ) : (
                    <div className="text-sm">
                      Not enough weight records in range.
                    </div>
                  )}
                  <div className="text-xs text-slate-600 mt-1">
                    ADG uses earliest and latest weights in the selected date
                    range.
                  </div>
                </div>

                <div className="border rounded-lg p-3 bg-white/60">
                  <div className="font-semibold mb-1">Treatments Summary</div>
                  <div className="text-sm">
                    {treatmentSummary.length ? (
                      <ul className="list-disc ml-4">
                        {treatmentSummary.map((t) => (
                          <li key={t.product}>
                            {t.product}: {t.count}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "No treatments in range."
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Processing */}
            <div className="mt-6">
              <div className="font-medium mb-2">Processing</div>

              {/* Create new processing record */}
              <div className="border rounded-lg p-3 bg-white/60 mb-3">
                <div className="grid md:grid-cols-5 gap-2">
                  <div>
                    <Label>Sent Date *</Label>
                    <Input
                      type="date"
                      value={procDraft.sent_date || ""}
                      onChange={(e) =>
                        setProcDraft({ ...procDraft, sent_date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Processor</Label>
                    <Input
                      value={procDraft.processor || ""}
                      onChange={(e) =>
                        setProcDraft({ ...procDraft, processor: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Transport ID</Label>
                    <Input
                      value={procDraft.transport_id || ""}
                      onChange={(e) =>
                        setProcDraft({
                          ...procDraft,
                          transport_id: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Live Wt (lb)</Label>
                    <Input
                      type="number"
                      value={(procDraft.live_weight_lb as any) || ""}
                      onChange={(e) =>
                        setProcDraft({
                          ...procDraft,
                          live_weight_lb: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="md:col-span-5">
                    <Label>Notes</Label>
                    <Input
                      value={procDraft.notes || ""}
                      onChange={(e) =>
                        setProcDraft({ ...procDraft, notes: e.target.value })
                      }
                    />
                  </div>
                  <div className="md:col-span-5">
                    <Button onClick={sendToProcessing}>Send to Processing</Button>
                  </div>
                </div>
              </div>

              {/* Existing processing rows */}
              <div className="overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-2">Sent</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Processor</th>
                      <th className="text-left p-2">Live</th>
                      <th className="text-left p-2">HCW</th>
                      <th className="text-left p-2">Carcass</th>
                      <th className="text-left p-2">Yield%</th>
                      <th className="text-left p-2">Grade</th>
                      <th className="text-right p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processing.map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="p-2">{p.sent_date}</td>
                        <td className="p-2">{p.status}</td>
                        <td className="p-2">{p.processor}</td>
                        <td className="p-2">{p.live_weight_lb ?? ""}</td>
                        <td className="p-2">{p.hot_carcass_weight_lb ?? ""}</td>
                        <td className="p-2">{p.carcass_weight_lb ?? ""}</td>
                        <td className="p-2">
                          {p.yield_pct ??
                            (p.hot_carcass_weight_lb && p.live_weight_lb
                              ? (
                                  (Number(p.hot_carcass_weight_lb) /
                                    Number(p.live_weight_lb)) *
                                  100
                                ).toFixed(1)
                              : "")}
                        </td>
                        <td className="p-2">{p.grade ?? ""}</td>
                        <td className="p-2 text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateProcessingRow(p, { status: "received" })
                              }
                            >
                              Mark Received
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                updateProcessingRow(p, { status: "processed" })
                              }
                            >
                              Mark Processed
                            </Button>
                          </div>

                          {/* Inline editors */}
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <Input
                              placeholder="HCW"
                              type="number"
                              value={p.hot_carcass_weight_lb ?? ""}
                              onChange={(e) =>
                                updateProcessingRow(p, {
                                  hot_carcass_weight_lb: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                            />
                            <Input
                              placeholder="Carcass"
                              type="number"
                              value={p.carcass_weight_lb ?? ""}
                              onChange={(e) =>
                                updateProcessingRow(p, {
                                  carcass_weight_lb: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                            />
                            <Input
                              placeholder="Grade"
                              value={p.grade ?? ""}
                              onChange={(e) =>
                                updateProcessingRow(p, {
                                  grade: e.target.value || null,
                                })
                              }
                            />
                            <Input
                              placeholder="Yield %"
                              type="number"
                              value={p.yield_pct ?? ""}
                              onChange={(e) =>
                                updateProcessingRow(p, {
                                  yield_pct: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                            />
                            <Input
                              placeholder="Lot"
                              value={p.lot_code ?? ""}
                              onChange={(e) =>
                                updateProcessingRow(p, {
                                  lot_code: e.target.value || null,
                                })
                              }
                            />
                            <Input
                              placeholder="Cut Sheet URL"
                              value={p.cut_sheet_url ?? ""}
                              onChange={(e) =>
                                updateProcessingRow(p, {
                                  cut_sheet_url: e.target.value || null,
                                })
                              }
                            />
                            <Input
                              placeholder="Invoice URL"
                              value={p.invoice_url ?? ""}
                              onChange={(e) =>
                                updateProcessingRow(p, {
                                  invoice_url: e.target.value || null,
                                })
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {processing.length === 0 && (
                      <tr>
                        <td className="p-2" colSpan={9}>
                          No processing records yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────
   Subcomponents
────────────────────────────────────────── */
function WeightEditor({
  tenantId,
  animalId,
  onAdd,
  weights,
}: {
  tenantId: string;
  animalId: number;
  onAdd: (
    animalId: number,
    date: string,
    weight: number,
    notes?: string
  ) => Promise<void>;
  weights: Weight[];
}) {
  const [date, setDate] = useState("");
  const [w, setW] = useState<number | string>("");
  const [notes, setNotes] = useState("");

  return (
    <div className="border rounded-lg p-3 bg-white/60">
      <div className="grid md:grid-cols-4 gap-2">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label>Weight (lb)</Label>
          <Input
            type="number"
            value={w}
            onChange={(e) => setW(e.target.value)}
            placeholder="e.g., 1200"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="md:col-span-4">
          <Button
            onClick={() =>
              onAdd(animalId, date, Number(w || 0), notes || undefined)
            }
          >
            Add Weight
          </Button>
        </div>
      </div>

      <div className="overflow-auto mt-3 border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Weight (lb)</th>
              <th className="text-left p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {weights.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.weigh_date}</td>
                <td className="p-2">{r.weight_lb}</td>
                <td className="p-2">{r.notes}</td>
              </tr>
            ))}
            {weights.length === 0 && (
              <tr>
                <td className="p-2" colSpan={3}>
                  No weights added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TreatEditor({
  tenantId,
  animalId,
  onAdd,
  treats,
}: {
  tenantId: string;
  animalId: number;
  onAdd: (
    animalId: number,
    date: string,
    product?: string,
    dose?: string,
    notes?: string
  ) => Promise<void>;
  treats: Treatment[];
}) {
  const [date, setDate] = useState("");
  const [product, setProduct] = useState("");
  const [dose, setDose] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="border rounded-lg p-3 bg-white/60">
      <div className="grid md:grid-cols-5 gap-2">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label>Product</Label>
          <Input value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <div>
          <Label>Dose</Label>
          <Input value={dose} onChange={(e) => setDose(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="md:col-span-5">
          <Button
            onClick={() =>
              onAdd(
                animalId,
                date,
                product || undefined,
                dose || undefined,
                notes || undefined
              )
            }
          >
            Add Treatment
          </Button>
        </div>
      </div>

      <div className="overflow-auto mt-3 border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Product</th>
              <th className="text-left p-2">Dose</th>
              <th className="text-left p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {treats.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.treat_date}</td>
                <td className="p-2">{r.product}</td>
                <td className="p-2">{r.dose}</td>
                <td className="p-2">{r.notes}</td>
              </tr>
            ))}
            {treats.length === 0 && (
              <tr>
                <td className="p-2" colSpan={4}>
                  No treatments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

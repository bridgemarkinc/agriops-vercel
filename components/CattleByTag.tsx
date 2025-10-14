"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Animal = {
  id?: number;
  tenant_id: string;
  tag: string;
  name?: string | null;
  sex?: "M" | "F" | null;
  breed?: string | null;
  birth_date?: string | null;
  current_paddock?: string | null;
  status?: string | null;
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

const SUPABASE = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};

let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPABASE.url.startsWith("http")) {
  supabase = createClient(SUPABASE.url, SUPABASE.anon);
}

export default function CattleByTag({ tenantId }: { tenantId: string }) {
  const [search, setSearch] = useState("");
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [editing, setEditing] = useState<Animal | null>(null);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [treats, setTreats] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);
  const [scanValue, setScanValue] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

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

  useEffect(() => {
    loadAnimals().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

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

  async function saveAnimal() {
    if (!draft.tag.trim()) return alert("Tag is required");
    const payload = {
      ...draft,
      tenant_id: tenantId,
      tag: draft.tag.trim(),
      sex: draft.sex ? draft.sex.toUpperCase() : null,
      name: draft.name || null,
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

  function startEdit(a: Animal) {
    setEditing(a);
    loadDetail(a.id!);
  }

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
      .map((r) =>
        r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")
      )
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cattle by Tag</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Top controls */}
        <div className="grid lg:grid-cols-3 gap-3">
          {/* Add new animal */}
          <div className="border rounded-xl p-3 bg-white/70">
            <Label>Tag *</Label>
            <Input
              value={draft.tag}
              onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
              placeholder="e.g., BR123"
            />
            <Button onClick={saveAnimal} className="mt-2 w-full">
              Save Animal
            </Button>
          </div>

          {/* Search + Scanner */}
          <div className="lg:col-span-2 border rounded-xl p-3 bg-white/70">
            <Label>Search</Label>
            <Input
              placeholder="Search by tag"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Label className="mt-3 block">Scan Tag (QR/Barcode)</Label>
            <input
  ref={scanRef}
  value={scanValue}
  onChange={(e) => setScanValue(e.target.value)}
  onKeyDown={onScanKeyDown}
  placeholder="Focus here and scan; press Enter"
  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/5"
/>

            <div className="flex gap-2 mt-3">
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
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                Import CSV
              </Button>
              {importMsg && (
                <span className="text-sm text-green-700">{importMsg}</span>
              )}
            </div>
          </div>
        </div>

        {/* Animal list */}
        <div className="overflow-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2">Tag</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Breed</th>
                <th className="text-left p-2">Status</th>
                <th className="text-right p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {animals.map((a) => (
                <tr key={a.id || a.tag} className="border-t">
                  <td className="p-2">{a.tag}</td>
                  <td className="p-2">{a.name}</td>
                  <td className="p-2">{a.breed}</td>
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
            </tbody>
          </table>
        </div>

        {/* Detail + Reports */}
        {editing && (
          <div className="border rounded-xl p-4 bg-white/80">
            <h3 className="font-semibold mb-2">
              Tag: <span className="font-mono">{editing.tag}</span>
            </h3>

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
                <Label>Breed</Label>
                <Input
                  value={editing.breed || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, breed: e.target.value })
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

            {/* Reports */}
            <div className="mt-6">
              <h4 className="font-semibold mb-2">Reports</h4>
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
              </div>
              <div className="border rounded p-3 bg-white/60 mb-3">
                <b>Average Daily Gain (ADG):</b>{" "}
                {adg ? `${adg.toFixed(2)} lb/day` : "Not enough data"}
              </div>
              <div className="border rounded p-3 bg-white/60">
                <b>Treatment Summary:</b>
                {treatmentSummary.length ? (
                  <ul className="list-disc ml-4 mt-2">
                    {treatmentSummary.map((t) => (
                      <li key={t.product}>
                        {t.product}: {t.count}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>No treatments recorded.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

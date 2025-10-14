"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  birth_date?: string | null; // yyyy-mm-dd
  current_paddock?: string | null;
  status?: string | null; // active, sold, culled, dead
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

  // new animal draft
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

  // load weights/treatments for the selected animal
  async function loadDetail(animalId: number) {
    if (!supabase) return;
    const [{ data: ws }, { data: ts }] = await Promise.all([
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
    setWeights((ws || []) as Weight[]);
    setTreats((ts || []) as Treatment[]);
  }

  useEffect(() => {
    loadAnimals().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function saveAnimal() {
    if (!supabase) return;
    if (!draft.tag.trim()) return alert("Tag is required");
    const payload = { ...draft, tenant_id: tenantId, tag: draft.tag.trim() };
    const { error } = await supabase.from("agriops_cattle").upsert(payload, {
      onConflict: "tenant_id,tag",
    } as any);
    if (error) return alert(error.message);
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
    if (!supabase || !a.id) return;
    const { error } = await supabase
      .from("agriops_cattle")
      .update({
        name: a.name ?? null,
        sex: a.sex ?? null,
        breed: a.breed ?? null,
        birth_date: a.birth_date ?? null,
        current_paddock: a.current_paddock ?? null,
        status: a.status ?? null,
      })
      .eq("id", a.id)
      .eq("tenant_id", tenantId);
    if (error) return alert(error.message);
    await loadAnimals();
  }

  async function addWeight(animalId: number, weigh_date: string, weight_lb: number, notes?: string) {
    if (!supabase) return;
    if (!weigh_date || !weight_lb) return alert("Date and weight are required");
    const { error } = await supabase.from("agriops_cattle_weights").insert({
      tenant_id: tenantId,
      animal_id: animalId,
      weigh_date,
      weight_lb,
      notes: notes || null,
    });
    if (error) return alert(error.message);
    await loadDetail(animalId);
  }

  async function addTreatment(animalId: number, treat_date: string, product?: string, dose?: string, notes?: string) {
    if (!supabase) return;
    if (!treat_date) return alert("Date is required");
    const { error } = await supabase.from("agriops_cattle_treatments").insert({
      tenant_id: tenantId,
      animal_id: animalId,
      treat_date,
      product: product || null,
      dose: dose || null,
      notes: notes || null,
    });
    if (error) return alert(error.message);
    await loadDetail(animalId);
  }

  function startEdit(a: Animal) {
    setEditing(a);
    loadDetail(a.id!);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cattle by Tag</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add/search row */}
        <div className="grid md:grid-cols-3 gap-3">
          <div className="border rounded-xl p-3 bg-white/70">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label>Tag *</Label>
                <Input
                  value={draft.tag}
                  onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                  placeholder="e.g., BR123"
                />
              </div>
              <div>
                <Label>Name</Label>
                <Input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <Label>Sex</Label>
                <Input
                  value={draft.sex || ""}
                  onChange={(e) => setDraft({ ...draft, sex: (e.target.value.toUpperCase() as any) || undefined })}
                  placeholder="M or F"
                />
              </div>
              <div>
                <Label>Breed</Label>
                <Input value={draft.breed || ""} onChange={(e) => setDraft({ ...draft, breed: e.target.value })} />
              </div>
              <div>
                <Label>Birth Date</Label>
                <Input
                  type="date"
                  value={draft.birth_date || ""}
                  onChange={(e) => setDraft({ ...draft, birth_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Paddock</Label>
                <Input
                  value={draft.current_paddock || ""}
                  onChange={(e) => setDraft({ ...draft, current_paddock: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input
                  value={draft.status || ""}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
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

          <div className="md:col-span-2 border rounded-xl p-3 bg-white/70">
            <Label>Search</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="Filter by tag (e.g., BR)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button variant="outline" onClick={loadAnimals} disabled={loading}>
                {loading ? "Loading…" : "Refresh"}
              </Button>
            </div>

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
                        <Button size="sm" variant="outline" onClick={() => startEdit(a)}>
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

        {/* Detail drawer */}
        {editing && (
          <div className="border rounded-xl p-4 bg-white/80">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">
                Tag <span className="font-mono">{editing.tag}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                Close
              </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Sex</Label>
                <Input
                  value={editing.sex || ""}
                  onChange={(e) => setEditing({ ...editing, sex: (e.target.value.toUpperCase() as any) || null })}
                  placeholder="M or F"
                />
              </div>
              <div>
                <Label>Breed</Label>
                <Input
                  value={editing.breed || ""}
                  onChange={(e) => setEditing({ ...editing, breed: e.target.value })}
                />
              </div>
              <div>
                <Label>Birth Date</Label>
                <Input
                  type="date"
                  value={editing.birth_date || ""}
                  onChange={(e) => setEditing({ ...editing, birth_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Paddock</Label>
                <Input
                  value={editing.current_paddock || ""}
                  onChange={(e) => setEditing({ ...editing, current_paddock: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input
                  value={editing.status || ""}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                />
              </div>
              <div className="md:col-span-3">
                <Button onClick={() => updateAnimal(editing!)}>Save Changes</Button>
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeightEditor({
  tenantId,
  animalId,
  onAdd,
  weights,
}: {
  tenantId: string;
  animalId: number;
  onAdd: (animalId: number, date: string, weight: number, notes?: string) => Promise<void>;
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
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
            onClick={() => onAdd(animalId, date, Number(w || 0), notes || undefined)}
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
              <tr><td className="p-2" colSpan={3}>No weights added yet.</td></tr>
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
  onAdd: (animalId: number, date: string, product?: string, dose?: string, notes?: string) => Promise<void>;
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
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
            onClick={() => onAdd(animalId, date, product || undefined, dose || undefined, notes || undefined)}
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
              <tr><td className="p-2" colSpan={4}>No treatments recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

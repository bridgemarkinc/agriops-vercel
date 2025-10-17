"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Protocol = {
  id: number;
  tenant_id: string;
  name: string;
  trigger?: string | null;
  steps?: string[] | any[];       // stored as JSON array
  notes?: string | null;
  created_at?: string | null;     // ISO string
};

type SortKey = "name" | "trigger" | "steps" | "created_at";
type SortDir = "asc" | "desc";

export default function HealthProtocols({ tenantId }: { tenantId: string }) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [draft, setDraft] = useState({ name: "", trigger: "", steps: "", notes: "" });
  const [loading, setLoading] = useState(false);

  // sorting
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function arrowFor(key: SortKey) {
    if (key !== sortKey) return "↕";
    return sortDir === "asc" ? "▲" : "▼";
    // (kept simple for no-icon environments)
  }

  /* Load all existing protocols */
  async function loadProtocols() {
    setLoading(true);
    try {
      const res = await fetch("/api/care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listProtocols", tenant_id: tenantId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load protocols");
      setProtocols(json.data || []);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* Add a new protocol */
  async function addProtocol() {
    if (!draft.name.trim()) return alert("Protocol name is required");
    const payload = {
      action: "addProtocol",
      tenant_id: tenantId,
      name: draft.name.trim(),
      trigger: draft.trigger || null,
      steps: draft.steps ? draft.steps.split(",").map((s) => s.trim()) : [],
      notes: draft.notes || null,
    };
    try {
      const res = await fetch("/api/care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to add protocol");
      setDraft({ name: "", trigger: "", steps: "", notes: "" });
      await loadProtocols();
    } catch (err: any) {
      alert(err.message);
    }
  }

  /* Delete an existing protocol */
  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this protocol?")) return;
    try {
      const res = await fetch("/api/care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteProtocol", id, tenant_id: tenantId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Delete failed");
      await loadProtocols(); // refresh list
    } catch (err: any) {
      alert(err.message);
    }
  }

  useEffect(() => {
    loadProtocols().catch(() => {});
  }, [tenantId]);

  const sorted = useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base" });
    const toVal = (p: Protocol, key: SortKey) => {
      switch (key) {
        case "name":
          return p.name ?? "";
        case "trigger":
          return (p.trigger ?? "") as string;
        case "steps":
          return Array.isArray(p.steps) ? p.steps.length : 0;
        case "created_at":
          return p.created_at ? Date.parse(p.created_at) : 0;
      }
    };
    const arr = [...protocols];
    arr.sort((a, b) => {
      const va = toVal(a, sortKey);
      const vb = toVal(b, sortKey);
      let cmp = 0;
      if (sortKey === "steps" || sortKey === "created_at") {
        cmp = (va as number) - (vb as number);
      } else {
        cmp = collator.compare(String(va), String(vb));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [protocols, sortKey, sortDir]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health Protocols</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add protocol form */}
        <div className="border rounded-xl p-3 bg-white/70">
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g., Calf Vaccination"
              />
            </div>
            <div>
              <Label>Trigger</Label>
              <Input
                value={draft.trigger}
                onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}
                placeholder="e.g., 2 weeks after birth"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Steps (comma-separated)</Label>
              <Input
                value={draft.steps}
                onChange={(e) => setDraft({ ...draft, steps: e.target.value })}
                placeholder="e.g., Weigh calf, Give 5ml vaccine, Record batch"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Input
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Additional info"
              />
            </div>
            <div className="md:col-span-2">
              <Button onClick={addProtocol} disabled={loading}>
                {loading ? "Saving…" : "Add Protocol"}
              </Button>
            </div>
          </div>
        </div>

        {/* Protocol list (sortable) */}
        <div className="overflow-auto border rounded-lg bg-white/80">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:underline"
                    onClick={() => toggleSort("name")}
                    title="Sort by name"
                  >
                    Name <span className="text-xs">{arrowFor("name")}</span>
                  </button>
                </th>
                <th className="text-left p-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:underline"
                    onClick={() => toggleSort("trigger")}
                    title="Sort by trigger"
                  >
                    Trigger <span className="text-xs">{arrowFor("trigger")}</span>
                  </button>
                </th>
                <th className="text-left p-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:underline"
                    onClick={() => toggleSort("steps")}
                    title="Sort by number of steps"
                  >
                    Steps <span className="text-xs">{arrowFor("steps")}</span>
                  </button>
                </th>
                <th className="text-left p-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:underline"
                    onClick={() => toggleSort("created_at")}
                    title="Sort by created date"
                  >
                    Created <span className="text-xs">{arrowFor("created_at")}</span>
                  </button>
                </th>
                <th className="text-right p-2 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.name}</td>
                  <td className="p-2">{p.trigger ?? "—"}</td>
                  <td className="p-2">{Array.isArray(p.steps) ? p.steps.length : 0}</td>
                  <td className="p-2">
                    {p.created_at
                      ? new Date(p.created_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-2 text-right">
                    <button
                      className="text-xs px-2 py-1 rounded-md border border-red-400 text-red-600 hover:bg-red-50 transition"
                      onClick={() => handleDelete(p.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td className="p-2 text-center text-slate-500" colSpan={5}>
                    No protocols added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// app/maintenance/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * If you already have a tenant context, you can pass tenantId
 * into this page. For now we let the user type it (pre-filled from env if present).
 */
const DEFAULT_TENANT =
  process.env.NEXT_PUBLIC_TENANT ||
  process.env.TENANT_ID ||
  "";

const TABLES = [
  { key: "agriops_paddocks", label: "Paddocks" },
  { key: "agriops_paddock_seeding", label: "Paddock Seeding" },
  { key: "agriops_paddock_amendments", label: "Paddock Amendments" },
  { key: "agriops_cattle", label: "Cattle" },
  { key: "agriops_cattle_weights", label: "Cattle Weights" },
  { key: "agriops_cattle_treatments", label: "Cattle Treatments" },
  { key: "agriops_cattle_processing", label: "Cattle Processing" },
  { key: "agriops_cattle_photos", label: "Animal Photos (metadata)" },
  
];

export default function MaintenancePage() {
  const [tenantId, setTenantId] = useState(DEFAULT_TENANT);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(
    TABLES.map(t => t.key) // default: all
  );

  const allChecked = useMemo(
    () => selected.length === TABLES.length,
    [selected]
  );

  function toggleOne(key: string) {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function setAll(v: boolean) {
    setSelected(v ? TABLES.map(t => t.key) : []);
  }

  async function download(action: string, filename: string, body: any) {
    setBusy(action);
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "Download failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance & Backups</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label>Tenant ID</Label>
            <Input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="your-tenant-id"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant={allChecked ? "secondary" : "outline"}
              onClick={() => setAll(!allChecked)}
            >
              {allChecked ? "Unselect All" : "Select All"}
            </Button>
          </div>
        </div>

        <div className="border rounded-xl p-3">
          <div className="text-sm font-medium mb-2">Tables</div>
          <div className="grid md:grid-cols-2 gap-2">
            {TABLES.map((t) => (
              <label key={t.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.includes(t.key)}
                  onChange={() => toggleOne(t.key)}
                />
                {t.label} <span className="text-slate-400">({t.key})</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Multi-table ZIP */}
          <Button
            onClick={() =>
              download(
                "exportAllZip",
                `backup_${tenantId || "tenant"}.zip`,
                { action: "exportAllZip", tenant_id: tenantId, tables: selected }
              )
            }
            disabled={!tenantId || selected.length === 0 || !!busy}
          >
            {busy === "exportAllZip" ? "Preparing ZIP…" : "Download All (ZIP)"}
          </Button>

          {/* Quick single-table CSV buttons */}
          {TABLES.map((t) => (
            <Button
              key={t.key}
              variant="outline"
              onClick={() =>
                download(
                  "exportCSV",
                  `${t.key}_${tenantId || "tenant"}.csv`,
                  { action: "exportCSV", tenant_id: tenantId, table: t.key }
                )
              }
              disabled={!tenantId || !!busy}
            >
              {busy === "exportCSV" ? "Preparing…" : `CSV: ${t.label}`}
            </Button>
          ))}
        </div>

        <div className="text-xs text-slate-500">
          Exports filter by <code>tenant_id</code> and include all columns from each table.
        </div>
      </CardContent>
    </Card>
  );
}

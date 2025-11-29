// components/HealthMonitor.tsx
"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertCircle, Thermometer, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";

type Alert = {
  id: number;
  tenant_id: string;
  animal_id?: number | null;
  type: string;
  severity: "high" | "warn" | "info";
  message: string;
  detected_at: string;
  resolved_at?: string | null;
};

export default function HealthMonitor({ tenantId }: { tenantId: string }) {
  const [animalId, setAnimalId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [temp, setTemp] = useState("");
  const [rum, setRum] = useState("");
  const [steps, setSteps] = useState("");
  const [bcs, setBcs] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const api = async (action: string, body: any) => {
    const res = await fetch("/api/care", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, tenant_id: tenantId, ...body }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Request failed");
    return json.data;
  };

  const loadAlerts = async () => {
    try {
      const data = await api("getAlerts", {});
      setAlerts(data || []);
    } catch {
      toast.error("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
    const id = setInterval(loadAlerts, 30000);
    return () => clearInterval(id);
  }, [tenantId]);

  const saveVitals = async () => {
    if (!animalId || !date) return toast.error("Animal ID and date required");

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        animal_id: Number(animalId),
        reading_date: date,
        temp_c: temp ? Number(temp) : null,
        rumination_min: rum ? Number(rum) : null,
        steps: steps ? Number(steps) : null,
        bcs: bcs ? Number(bcs) : null,
      };

      await api("logVitals", { payload });

      if (payload.temp_c && payload.temp_c >= 39.5) {
        await api("createAlert", {
          payload: {
            tenant_id: tenantId,
            animal_id: payload.animal_id,
            type: "fever",
            severity: "high",
            message: `Fever: ${payload.temp_c}°C`,
          },
        });
      }

      if (payload.rumination_min != null && payload.rumination_min < 350) {
        await api("createAlert", {
          payload: {
            tenant_id: tenantId,
            animal_id: payload.animal_id,
            type: "low_rumination",
            severity: "warn",
            message: `Low rumination: ${payload.rumination_min} min`,
          },
        });
      }

      toast.success("Vitals saved!");
      setAnimalId("");
      setTemp("");
      setRum("");
      setSteps("");
      setBcs("");
      await loadAlerts();
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resolveAlert = async (id: number) => {
    try {
      await api("resolveAlert", { id });
      toast.success("Alert resolved");
      await loadAlerts();
    } catch {
      toast.error("Failed to resolve");
    }
  };

  const severityClass = (s: string) =>
    s === "high"
      ? "bg-red-100 text-red-800"
      : s === "warn"
      ? "bg-yellow-100 text-yellow-800"
      : "bg-gray-100 text-gray-800";

  return (
    <div className="space-y-10 pb-12">
      {/* LOG VITALS */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Thermometer className="w-8 h-8 text-red-600" />
            <h2 className="text-2xl font-bold">Log Animal Vitals</h2>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6">
            Record temperature, rumination, steps & BCS
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <Label>Tag #</Label>
              <Input type="number" placeholder="1234" value={animalId} onChange={e => setAnimalId(e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Temp °C</Label>
              <Input type="number" step="0.1" placeholder="38.7" value={temp} onChange={e => setTemp(e.target.value)} />
            </div>
            <div>
              <Label>Rumination (min)</Label>
              <Input type="number" placeholder="480" value={rum} onChange={e => setRum(e.target.value)} />
            </div>
            <div>
              <Label>Steps</Label>
              <Input type="number" placeholder="8200" value={steps} onChange={e => setSteps(e.target.value)} />
            </div>
            <div>
              <Label>BCS (1–5)</Label>
              <Input type="number" step="0.25" min="1" max="5" placeholder="3.25" value={bcs} onChange={e => setBcs(e.target.value)} />
            </div>
          </div>

          <Button onClick={saveVitals} disabled={saving} className="mt-6">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {saving ? "Saving..." : "Save Vitals"}
          </Button>
        </CardContent>
      </Card>

      {/* HEALTH ALERTS */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-orange-600" />
            <h2 className="text-2xl font-bold">Health Alerts</h2>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6">
            Active issues that need attention
          </p>

          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-muted-foreground" />
            </div>
          ) : alerts.filter(a => !a.resolved_at).length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-4" />
              <p className="text-lg font-medium text-green-700">All clear — no active alerts!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-3">Time</th>
                    <th className="text-left py-3">Animal</th>
                    <th className="text-left py-3">Issue</th>
                    <th className="text-left py-3">Level</th>
                    <th className="text-left py-3">Message</th>
                    <th className="text-right py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts
                    .filter(a => !a.resolved_at)
                    .sort((a, b) => b.id - a.id)
                    .map(alert => (
                      <tr key={alert.id} className="border-b hover:bg-muted/50">
                        <td className="py-3">{format(new Date(alert.detected_at), "MMM d, h:mm a")}</td>
                        <td className="py-3 font-medium">#{alert.animal_id ?? "—"}</td>
                        <td className="py-3 capitalize">{alert.type.replace("_", " ")}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${severityClass(alert.severity)}`}>
                            {alert.severity.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3">{alert.message}</td>
                        <td className="py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => resolveAlert(alert.id)}>
                            Resolve
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
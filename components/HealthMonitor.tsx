"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Vitals = { tenant_id:string; animal_id:number; reading_date:string; temp_c?:number|null; rumination_min?:number|null; steps?:number|null; bcs?:number|null; notes?:string|null; };
type Alert = { id?:number; tenant_id:string; animal_id?:number|null; type:string; severity?:string; message:string; detected_at?:string; resolved_at?:string|null; };

export default function HealthMonitor({ tenantId }: { tenantId: string }) {
  const [animalId, setAnimalId] = useState("");
  const [date, setDate] = useState("");
  const [temp, setTemp] = useState("");
  const [rum, setRum] = useState("");
  const [steps, setSteps] = useState("");
  const [bcs, setBcs] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);

  async function api(action: string, body: any) {
    const res = await fetch("/api/care", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ action, ...body }) });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Request failed"); return json;
  }

  async function loadAlerts() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const base = `${url}/rest/v1`; const h = { apikey:key, Authorization:`Bearer ${key}` };
    const r = await fetch(`${base}/agriops_alerts?tenant_id=eq.${tenantId}&select=*`, { headers:h });
    setAlerts(await r.json());
  }
  useEffect(()=>{ loadAlerts().catch(()=>{}); }, [tenantId]);

  async function saveVitals() {
    const payload:Vitals = {
      tenant_id: tenantId,
      animal_id: Number(animalId),
      reading_date: date,
      temp_c: temp? Number(temp): null,
      rumination_min: rum? Number(rum): null,
      steps: steps? Number(steps): null,
      bcs: bcs? Number(bcs): null
    };
    await api("logVitals",{ payload });

    // basic rule examples → alerts
    if (payload.temp_c && payload.temp_c >= 39.5) {
      await api("createAlert", { payload: {
        tenant_id: tenantId, animal_id: payload.animal_id,
        type:"fever", severity:"high", message:`Fever ${payload.temp_c}C`
      }});
    }
    if (payload.rumination_min !== null && payload.rumination_min !== undefined && payload.rumination_min < 350) {
      await api("createAlert", { payload: {
        tenant_id: tenantId, animal_id: payload.animal_id,
        type:"low_rumination", severity:"warn", message:`Rumination low: ${payload.rumination_min} min`
      }});
    }

    setAnimalId(""); setDate(""); setTemp(""); setRum(""); setSteps(""); setBcs("");
    await loadAlerts();
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-4 bg-white/80">
        <div className="font-semibold mb-2">Log Vitals</div>
        <div className="grid md:grid-cols-6 gap-2">
          <div><Label>Animal ID</Label><Input value={animalId} onChange={e=>setAnimalId(e.target.value)} /></div>
          <div><Label>Date</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
          <div><Label>Temp (°C)</Label><Input type="number" value={temp} onChange={e=>setTemp(e.target.value)} /></div>
          <div><Label>Rumination (min)</Label><Input type="number" value={rum} onChange={e=>setRum(e.target.value)} /></div>
          <div><Label>Steps</Label><Input type="number" value={steps} onChange={e=>setSteps(e.target.value)} /></div>
          <div><Label>BCS</Label><Input type="number" step="0.1" value={bcs} onChange={e=>setBcs(e.target.value)} /></div>
          <div className="md:col-span-6"><Button onClick={saveVitals}>Save Vitals</Button></div>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white/80">
        <div className="font-semibold mb-2">Alerts</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr>
            <th className="text-left p-2">When</th><th className="text-left p-2">Animal</th>
            <th className="text-left p-2">Type</th><th className="text-left p-2">Severity</th>
            <th className="text-left p-2">Message</th><th className="text-right p-2">Actions</th>
          </tr></thead>
          <tbody>
            {alerts.map(a=>(
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.detected_at?.slice(0,19).replace("T"," ")}</td>
                <td className="p-2">{a.animal_id ?? "-"}</td>
                <td className="p-2">{a.type}</td>
                <td className="p-2">{a.severity}</td>
                <td className="p-2">{a.message}</td>
                <td className="p-2 text-right">
                  {!a.resolved_at ? (
                    <Button size="sm" variant="outline"
                      onClick={async()=>{ await api("resolveAlert",{ id:a.id, tenant_id:tenantId }); await loadAlerts(); }}>
                      Resolve
                    </Button>
                  ) : <span className="text-xs text-slate-500">Resolved</span>}
                </td>
              </tr>
            ))}
            {!alerts.length && <tr><td className="p-2" colSpan={6}>No alerts.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

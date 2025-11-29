"use client";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Ration = { id?: number; tenant_id: string; name: string; dmi_target_kg?: number|null; ingredients: any[]; notes?: string|null; };
type Sched  = { id?: number; tenant_id: string; group_key: string; ration_id: number; start_date: string; end_date?: string|null; times?: string[]; notes?: string|null; };

export default function FeedingSchedules({ tenantId }: { tenantId: string }) {
  const [rName, setRName] = useState("");
  const [rDmi, setRDmi] = useState("");
  const [rIngr, setRIngr] = useState("forage,70\npellets,30");
  const [group, setGroup] = useState("");
  const [rationId, setRationId] = useState("");
  const [start, setStart] = useState("");
  const [rations, setRations] = useState<Ration[]>([]);
  const [schedules, setSchedules] = useState<Sched[]>([]);

  async function api(action: string, body: any) {
    const res = await fetch("/api/care", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ action, ...body }) });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Request failed"); return json;
  }

  async function load() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const base = `${url}/rest/v1`; const h = { apikey:key, Authorization:`Bearer ${key}` };
    const [r, s] = await Promise.all([
      fetch(`${base}/agriops_feed_rations?tenant_id=eq.${tenantId}&select=*`, { headers:h }),
      fetch(`${base}/agriops_feeding_schedule?tenant_id=eq.${tenantId}&select=*`, { headers:h }),
    ]);
    setRations(await r.json()); setSchedules(await s.json());
  }
  useEffect(()=>{ load().catch(()=>{}); }, [tenantId]);

  function parseIngredients(text:string){
    return text.split(/\r?\n/).filter(Boolean).map(l=>{
      const [name, pct] = l.split(",").map(x=>x.trim());
      return { name, pct: Number(pct||0) };
    });
  }

  async function saveRation(){
    const payload:Ration = {
      tenant_id: tenantId, name: rName.trim(),
      dmi_target_kg: rDmi? Number(rDmi): null,
      ingredients: parseIngredients(rIngr)
    };
    await api("upsertRation",{payload});
    setRName(""); setRDmi(""); await load();
  }

  async function saveSchedule(){
    const payload:Sched = {
      tenant_id: tenantId, group_key: group.trim(),
      ration_id: Number(rationId), start_date: start, times: ["06:00","17:00"]
    };
    await api("upsertFeedingSchedule",{payload}); setGroup(""); setRationId(""); setStart(""); await load();
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-4 bg-white/80">
        <div className="font-semibold mb-2">Create Ration</div>
        <div className="grid md:grid-cols-3 gap-2">
          <div><Label>Name</Label><Input value={rName} onChange={e=>setRName(e.target.value)} /></div>
          <div><Label>DMI Target (kg)</Label><Input type="number" value={rDmi} onChange={e=>setRDmi(e.target.value)} /></div>
          <div className="md:col-span-3">
            <Label>Ingredients (name,pct per line)</Label>
            <textarea className="w-full border rounded p-2 h-24" value={rIngr} onChange={e=>setRIngr(e.target.value)} />
          </div>
          <div className="md:col-span-3"><Button onClick={saveRation}>Save Ration</Button></div>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white/80">
        <div className="font-semibold mb-2">Schedule Feeding</div>
        <div className="grid md:grid-cols-4 gap-2">
          <div><Label>Group/Paddock</Label><Input value={group} onChange={e=>setGroup(e.target.value)} /></div>
          <div><Label>Ration ID</Label><Input value={rationId} onChange={e=>setRationId(e.target.value)} /></div>
          <div><Label>Start</Label><Input type="date" value={start} onChange={e=>setStart(e.target.value)} /></div>
          <div className="flex items-end"><Button onClick={saveSchedule}>Save Schedule</Button></div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 bg-white/80">
          <div className="font-semibold mb-2">Rations</div>
          <ul className="list-disc ml-4 text-sm">
            {rations.map(r=> <li key={r.id}><b>{r.name}</b> — DMI {r.dmi_target_kg ?? "n/a"} kg</li>)}
            {!rations.length && <li>No rations yet.</li>}
          </ul>
        </div>
        <div className="border rounded-xl p-4 bg-white/80">
          <div className="font-semibold mb-2">Schedules</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr>
              <th className="text-left p-2">Group</th><th className="text-left p-2">Ration</th>
              <th className="text-left p-2">Start</th>
            </tr></thead>
            <tbody>
              {schedules.map(s=>(
                <tr key={s.id} className="border-t">
                  <td className="p-2">{s.group_key}</td>
                  <td className="p-2">{s.ration_id}</td>
                  <td className="p-2">{s.start_date}</td>
                </tr>
              ))}
              {!schedules.length && <tr><td className="p-2" colSpan={3}>No schedules.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

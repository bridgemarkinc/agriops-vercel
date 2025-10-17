"use client";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Protocol = {
  id?: number;
  tenant_id: string;
  name: string;
  species?: string | null;
  trigger?: string | null;
  steps: Array<{ dayOffset: number; product?: string; dose?: string; notes?: string }>;
  notes?: string | null;
};
type Assignment = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  protocol_id: number;
  start_date: string;
  status?: string;
  next_due_date?: string | null;
};

export default function HealthProtocols({ tenantId }: { tenantId: string }) {
  const [pname, setPname] = useState("");
  const [stepsText, setStepsText] = useState("0,Draxxin,1.1 ml/100lb\n3,Banamine,as directed");
  const [assignAnimalId, setAssignAnimalId] = useState("");
  const [assignProtocolId, setAssignProtocolId] = useState("");
  const [assignStart, setAssignStart] = useState("");
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  async function api(action: string, body: any) {
    const res = await fetch("/api/care", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  async function load() {
    // read via anon client fetch RPC: use rest API
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const base = `${url}/rest/v1`;
    const h = { apikey: key, Authorization: `Bearer ${key}` };

    const [pResp, aResp] = await Promise.all([
      fetch(`${base}/agriops_protocols?tenant_id=eq.${tenantId}&select=*`, { headers: h }),
      fetch(`${base}/agriops_protocol_assignments?tenant_id=eq.${tenantId}&select=*`, { headers: h }),
    ]);
    setProtocols(await pResp.json());
    setAssignments(await aResp.json());
  }

  useEffect(() => { load().catch(()=>{}); }, [tenantId]);

  function parseSteps(text: string) {
    // CSV lines: dayOffset,product,dose
    return text.split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        const [d, product, dose, notes] = l.split(",").map(x=>x?.trim());
        return { dayOffset: Number(d||0), product, dose, notes };
      });
  }

  async function createProtocol() {
    if (!pname.trim()) return alert("Protocol name required");
    const payload: Protocol = {
      tenant_id: tenantId,
      name: pname.trim(),
      steps: parseSteps(stepsText),
    };
    await api("upsertProtocol", { payload });
    setPname("");
    await load();
  }

  async function assignProtocol() {
    const animal_id = Number(assignAnimalId);
    const protocol_id = Number(assignProtocolId);
    if (!animal_id || !protocol_id || !assignStart) return alert("All fields required");
    const payload: Assignment = {
      tenant_id: tenantId,
      animal_id, protocol_id,
      start_date: assignStart,
      status: "active",
    };
    await api("assignProtocol", { payload });
    setAssignAnimalId(""); setAssignProtocolId(""); setAssignStart("");
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-4 bg-white/80">
        <div className="font-semibold mb-2">Create Protocol</div>
        <div className="grid md:grid-cols-3 gap-2">
          <div>
            <Label>Name</Label>
            <Input value={pname} onChange={e=>setPname(e.target.value)} placeholder="BRD Calf Protocol"/>
          </div>
          <div className="md:col-span-2">
            <Label>Steps (one per line: dayOffset,product,dose[,notes])</Label>
            <textarea className="w-full border rounded p-2 h-28"
              value={stepsText} onChange={e=>setStepsText(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Button onClick={createProtocol}>Save Protocol</Button>
          </div>
        </div>
      </div>

      <div className="border rounded-xl p-4 bg-white/80">
        <div className="font-semibold mb-2">Assign Protocol</div>
        <div className="grid md:grid-cols-4 gap-2">
          <div>
            <Label>Animal ID</Label>
            <Input value={assignAnimalId} onChange={e=>setAssignAnimalId(e.target.value)} placeholder="e.g., 123"/>
          </div>
          <div>
            <Label>Protocol</Label>
            <Input value={assignProtocolId} onChange={e=>setAssignProtocolId(e.target.value)} placeholder="protocol id"/>
          </div>
          <div>
            <Label>Start Date</Label>
            <Input type="date" value={assignStart} onChange={e=>setAssignStart(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={assignProtocol}>Assign</Button>
          </div>
        </div>
      </div>

      {/* Lists */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4 bg-white/80">
          <div className="font-semibold mb-2">Protocols</div>
          <ul className="list-disc ml-4 text-sm">
            {protocols.map(p=><li key={p.id}><b>{p.name}</b> — {p.steps.length} steps</li>)}
            {!protocols.length && <li>No protocols yet.</li>}
          </ul>
        </div>
        <div className="border rounded-xl p-4 bg-white/80">
          <div className="font-semibold mb-2">Assignments</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr>
              <th className="text-left p-2">Animal</th>
              <th className="text-left p-2">Protocol</th>
              <th className="text-left p-2">Start</th>
              <th className="text-left p-2">Status</th>
            </tr></thead>
            <tbody>
              {assignments.map(a=>(
                <tr key={a.id} className="border-t">
                  <td className="p-2">{a.animal_id}</td>
                  <td className="p-2">{a.protocol_id}</td>
                  <td className="p-2">{a.start_date}</td>
                  <td className="p-2">{a.status}</td>
                </tr>
              ))}
              {!assignments.length && <tr><td className="p-2" colSpan={4}>No assignments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

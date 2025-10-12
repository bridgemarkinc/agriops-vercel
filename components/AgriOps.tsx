
"use client";
import React, { useEffect, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileDown } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";
import GrazingPlanner from "@/components/GrazingPlanner";


const SUPABASE = { url: process.env.NEXT_PUBLIC_SUPABASE_URL || "", anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" };
let supabase: SupabaseClient | null = null;
if (typeof window !== "undefined" && SUPABASE.url.startsWith("http")) supabase = createClient(SUPABASE.url, SUPABASE.anon);

type Brand = { orgName: string; appName: string; accent: string; logoUrl: string };
type BrandProfileRow = { tenant_id: string; org_name: string; app_name: string; accent: string; logo_url: string; updated_at?: string };
type TierRow = { tenant_id: string; plan: string; show_ads: boolean; ad_provider?: string|null; sponsor_label?: string|null; banner_url?: string|null; click_url?: string|null; updated_at?: string };
type ZoneRow = { tenant_id: string; zone_id: string; enabled: boolean; sponsor_label?: string|null; banner_url?: string|null; click_url?: string|null; updated_at?: string };
type FeedItem = { id: string; name: string; units: number; weightPerUnitLb: number; dryMatterPct: number; costPerUnit?: number };

function fmt(n:number,d=0){ return new Intl.NumberFormat(undefined,{maximumFractionDigits:d,minimumFractionDigits:d}).format(n); }
function feedItemDMLb(f:any){ return Number(f.units||0)*Number(f.weightPerUnitLb||0)*(Number(f.dryMatterPct||0)/100); }

export default function AgriOps(){
  const [tenantId, setTenantId] = useState<string>(() => typeof window!=="undefined" ? (process.env.NEXT_PUBLIC_TENANT as string) || window.location.hostname : "default");
  const [brand, setBrand] = useState<Brand>({ orgName: process.env.NEXT_PUBLIC_BRAND_NAME || "Black River Farm", appName: process.env.NEXT_PUBLIC_APP_NAME || "AgriOps – Grazing & Feed Planner", accent: process.env.NEXT_PUBLIC_BRAND_COLOR || "#14532d", logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO || "https://placehold.co/200x60?text=Black+River+Farm" });
  const [tier, setTier] = useState<TierRow|null>(null);
  const planName = (tier?.plan || "").toLowerCase();
  const [zones, setZones] = useState<Record<string, ZoneRow>>({});
  const showAds = !!tier?.show_ads && !["pro","enterprise"].includes(planName);

  const [feed,setFeed]=useState<FeedItem[]>([{id:crypto.randomUUID(),name:"Fescue Hay (Round)",units:40,weightPerUnitLb:1000,dryMatterPct:90,costPerUnit:45},{id:crypto.randomUUID(),name:"Pellet Supplement (ton)",units:10,weightPerUnitLb:2000,dryMatterPct:88,costPerUnit:200}]);
  const [herd,setHerd]=useState({head:25,avgWeightLb:1200,intakePctBW:2.6});
  const [noGrazingDays,setNoGrazingDays]=useState(90);
  const [hayPct,setHayPct]=useState(70);
  const [suppPct,setSuppPct]=useState(30);

  const dailyNeed=herd.head*herd.avgWeightLb*(herd.intakePctBW/100);
  const totalFeedDM=feed.reduce((a,f)=>a+feedItemDMLb(f),0);
  const hayItem=feed.find(f=>f.dryMatterPct>=80)||null;
  const suppItem=feed.find(f=>f.dryMatterPct<80)||null;
  const hayPerUnitDM=hayItem?hayItem.weightPerUnitLb*(hayItem.dryMatterPct/100):0;
  const suppPerUnitDM=suppItem?suppItem.weightPerUnitLb*(suppItem.dryMatterPct/100):0;
  const hayDMNeeded=dailyNeed*(hayPct/100)*noGrazingDays;
  const suppDMNeeded=dailyNeed*(suppPct/100)*noGrazingDays;
  const reservedDM=hayDMNeeded+suppDMNeeded;
  const effDM=Math.max(0,totalFeedDM-reservedDM);
  const coverageDays=dailyNeed>0?effDM/dailyNeed:0;

  async function brandCloudLoad() {
    if (!supabase) return alert("Supabase not configured");
    const { data, error } = await supabase.from("agriops_brands").select("tenant_id, org_name, app_name, accent, logo_url").eq("tenant_id", tenantId).maybeSingle();
    if (error) return alert(error.message);
    if (!data) return alert("No brand for this tenant");
    const b: Brand = { orgName: data.org_name, appName: data.app_name, accent: data.accent, logoUrl: data.logo_url };
    setBrand(b); localStorage.setItem('agri.brand', JSON.stringify(b));
  }
  async function brandCloudSave() {
    if (!supabase) return alert("Supabase not configured");
    const row: BrandProfileRow = { tenant_id: tenantId, org_name: brand.orgName, app_name: brand.appName, accent: brand.accent, logo_url: brand.logoUrl };
    const { error } = await supabase.from("agriops_brands").upsert(row, { onConflict: "tenant_id" });
    if (error) return alert(error.message);
    alert('Brand saved');
  }
  async function tierLoad() {
    if (!supabase) return alert("Supabase not configured");
    const { data, error } = await supabase.from("agriops_tiers").select("tenant_id, plan, show_ads, sponsor_label, banner_url, click_url").eq("tenant_id", tenantId).maybeSingle();
    if (error) return alert(error.message);
    setTier(data || { tenant_id: tenantId, plan: 'free', show_ads: true, sponsor_label: null, banner_url: null, click_url: null });
  }
  async function tierSave() {
    if (!supabase || !tier) return alert("Supabase not configured");
    const { error } = await supabase.from("agriops_tiers").upsert(tier, { onConflict: "tenant_id" });
    if (error) return alert(error.message);
    alert('Tier saved');
  }
  async function zonesLoad(){
    if(!supabase) return;
    const { data } = await supabase.from("agriops_ad_zones").select("tenant_id, zone_id, enabled, sponsor_label, banner_url, click_url").eq("tenant_id", tenantId);
    const map: Record<string, ZoneRow> = {}; for(const r of (data||[])) map[r.zone_id] = r as ZoneRow; setZones(map);
  }
  async function zoneSave(row: ZoneRow){
    if(!supabase) return alert("Supabase not configured");
    await supabase.from("agriops_ad_zones").upsert(row, { onConflict: "tenant_id,zone_id" }); await zonesLoad();
  }
  useEffect(()=>{ tierLoad(); zonesLoad(); }, [tenantId]);

  function exportPDF(){
    const doc=new jsPDF(); doc.setFontSize(14); doc.text(`${brand.orgName} – Grazing & Feed Summary`,14,16);
    doc.setFontSize(10); doc.text(`Daily need: ${fmt(dailyNeed,0)} lb`,14,26); doc.text(`Reserved: ${fmt(reservedDM,0)} lb`,14,32); doc.text(`Coverage: ${fmt(coverageDays,1)} days`,14,38);
    doc.save('brief.pdf');
  }
  async function logAdEvent(type:'impression'|'click', zone:string){
    try{ const r = await fetch('/api/log-ad-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tenantId,type,zone})}); if(r.ok) return; }catch(e){}
    if(!supabase) return; await supabase.from('agriops_ad_events').insert({ tenant_id: tenantId, type, zone });
  }
  const AdPanel = ({ zone='sidebar-1' }: { zone?: string }) => {
    if (!showAds) return null;
    const zrow = zones[zone]; if (zrow && zrow.enabled === false) return null;
    React.useEffect(()=>{ void logAdEvent('impression', zone); },[zone]);
    const onClick = ()=>{ void logAdEvent('click', zone); };
    const label = zrow?.sponsor_label || tier?.sponsor_label || 'Sponsored';
    const banner = zrow?.banner_url || tier?.banner_url; const href = zrow?.click_url || tier?.click_url || '#';
    return (<div className="rounded-xl border p-3 bg-white/60"><div className="text-xs text-slate-500 mb-1">{label}</div>{banner?(<a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}><img src={banner} alt="sponsor" className="w-full rounded-md"/></a>):(<div className="text-sm">Your sponsor here.</div>)}</div>);
  };

  return (<div className="p-6 max-w-6xl mx-auto space-y-6">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
  <div className="flex items-center gap-3">
    <img src="/blackriver-logo.png"
    alt="Black River Logo"
    className="h-10 w-auto opacity-90" />
    <h1 className="text-xl font-semibold">{brand?.orgName || "AgriOps"}</h1>
  </div>
  <div className="flex flex-wrap gap-2 justify-end">
    <Button size="sm" variant="outline">Load Brand</Button>
    <div className="space-y-6">
  <GrazingPlanner tenantId={tenantId} />
   <AdsReportPlus tenantId={tenantId} />
</div>

    <Button size="sm" variant="outline">Load Tier</Button>
  </div>
</div>

    <div className="grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <Card><CardHeader><CardTitle>Feed & Coverage Preview</CardTitle></CardHeader><CardContent className="space-y-2">
          <div>Total Feed DM: <b>{fmt(totalFeedDM,0)}</b> lb</div>
          <div>Reserved (non‑grazing): <b>{fmt(reservedDM,0)}</b> lb</div>
          <div>Effective DM: <b>{fmt(effDM,0)}</b> lb</div>
          <div>Coverage Days: <Badge>{fmt(coverageDays,1)}</Badge></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Tier & Ads Settings (Tenant)</CardTitle></CardHeader><CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3 items-center">
            <Label>Plan</Label><Input value={tier?.plan||''} onChange={e=>setTier(t=>({...(t||{tenant_id:tenantId,plan:'free',show_ads:true}), plan:e.target.value}))} placeholder="free | pro | enterprise | sponsor"/>
            <Label>Show Ads</Label><select value={tier?.show_ads?'true':'false'} onChange={e=>setTier(t=>({...(t||{tenant_id:tenantId,plan:'free',show_ads:true}), show_ads: e.target.value==='true'}))} className="border rounded p-2"><option value="true">true</option><option value="false">false</option></select>
            <Label>Sponsor Label</Label><Input value={tier?.sponsor_label||''} onChange={e=>setTier(t=>({...(t||{tenant_id:tenantId,plan:'free',show_ads:true}), sponsor_label:e.target.value}))} placeholder="Sponsored by ..."/>
            <Label>Banner URL</Label><Input value={tier?.banner_url||''} onChange={e=>setTier(t=>({...(t||{tenant_id:tenantId,plan:'free',show_ads:true}), banner_url:e.target.value}))} placeholder="https://... .png/.jpg"/>
            <Label>Click URL</Label><Input value={tier?.click_url||''} onChange={e=>setTier(t=>({...(t||{tenant_id:tenantId,plan:'free',show_ads:true}), click_url:e.target.value}))} placeholder="https://partner-site"/>
          </div>
          <div className="flex gap-2"><Button variant="secondary" onClick={tierLoad}>Load Tier</Button><Button variant="outline" onClick={tierSave}>Save Tier</Button></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Zones Manager</CardTitle></CardHeader><CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3 items-center"><Label>Sidebar 1</Label>
            <select value={zones['sidebar-1']?.enabled!==false?'true':'false'} onChange={e=>zoneSave({tenant_id:tenantId, zone_id:'sidebar-1', enabled: e.target.value==='true', sponsor_label: zones['sidebar-1']?.sponsor_label||null, banner_url: zones['sidebar-1']?.banner_url||null, click_url: zones['sidebar-1']?.click_url||null })} className="border rounded p-2"><option value="true">enabled</option><option value="false">disabled</option></select>
            <Input placeholder="Banner URL" value={zones['sidebar-1']?.banner_url||''} onChange={e=>zoneSave({tenant_id:tenantId, zone_id:'sidebar-1', enabled: zones['sidebar-1']?.enabled!==false, sponsor_label: zones['sidebar-1']?.sponsor_label||null, banner_url: e.target.value||null, click_url: zones['sidebar-1']?.click_url||null })}/>
          </div>
          <div className="grid md:grid-cols-3 gap-3 items-center"><Label>Sidebar 2</Label>
            <select value={zones['sidebar-2']?.enabled!==false?'true':'false'} onChange={e=>zoneSave({tenant_id:tenantId, zone_id:'sidebar-2', enabled: e.target.value==='true', sponsor_label: zones['sidebar-2']?.sponsor_label||null, banner_url: zones['sidebar-2']?.banner_url||null, click_url: zones['sidebar-2']?.click_url||null })} className="border rounded p-2"><option value="true">enabled</option><option value="false">disabled</option></select>
            <Input placeholder="Banner URL" value={zones['sidebar-2']?.banner_url||''} onChange={e=>zoneSave({tenant_id:tenantId, zone_id:'sidebar-2', enabled: zones['sidebar-2']?.enabled!==false, sponsor_label: zones['sidebar-2']?.sponsor_label||null, banner_url: e.target.value||null, click_url: zones['sidebar-2']?.click_url||null })}/>
          </div>
          <p className="text-xs text-slate-500">Zone settings override tenant tier creative when provided.</p>
        </CardContent></Card>
      </div>

      <div className="space-y-4"><AdPanel zone="sidebar-1"/><AdPanel zone="sidebar-2"/></div>
    </div>

    <AdsReportPlus tenantId={tenantId} />
    <AdminBrandDirectory />
  </div>);
}

function AdsReportPlus({ tenantId }: { tenantId: string }) {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState<{ impressions: number; clicks: number }>({
    impressions: 0,
    clicks: 0,
  });
  const [byZone, setByZone] = useState<
    Record<string, { impressions: number; clicks: number }>
  >({});
  const [series, setSeries] = useState<
    Array<{ date: string; impressions: number; clicks: number }>
  >([]);
  const [raw, setRaw] = useState<
    Array<{ type: string; zone: string; created_at: string }>
  >([]);

  // Default window = last 30 days
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  }, []);

  function setPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  }

  function pct(n: number, d: number) {
    return d > 0 ? ((n / d) * 100).toFixed(2) + "%" : "—";
  }

  async function refresh() {
    if (!supabase) {
      alert("Supabase not configured");
      return;
    }
    if (!startDate || !endDate) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("agriops_ad_events")
      .select("type, zone, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", new Date(startDate).toISOString())
      // inclusive end-of-day
      .lte(
        "created_at",
        new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      );
    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    const rows = (data || []) as Array<{
      type: "impression" | "click";
      zone: string | null;
      created_at: string;
    }>;
    setRaw(rows as any);

    // Build totals & by-zone
    const zoneMap: Record<string, { impressions: number; clicks: number }> = {};
    const dayMap: Record<string, { impressions: number; clicks: number }> = {};
    let imp = 0,
      clk = 0;

    for (const r of rows) {
      const z = r.zone || "unknown";
      if (!zoneMap[z]) zoneMap[z] = { impressions: 0, clicks: 0 };

      const day = new Date(r.created_at).toISOString().slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { impressions: 0, clicks: 0 };

      if (r.type === "impression") {
        zoneMap[z].impressions++;
        dayMap[day].impressions++;
        imp++;
      } else if (r.type === "click") {
        zoneMap[z].clicks++;
        dayMap[day].clicks++;
        clk++;
      }
    }

    setByZone(zoneMap);
    setTotals({ impressions: imp, clicks: clk });

    const dates = Object.keys(dayMap).sort();
    setSeries(
      dates.map((d) => ({
        date: d,
        impressions: dayMap[d].impressions,
        clicks: dayMap[d].clicks,
      }))
    );
  }

  // Auto refresh when tenant or dates change
  useEffect(() => {
    if (startDate && endDate) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, startDate, endDate]);

  const zones = Object.keys(byZone).sort();

  function exportCSV() {
    const headers = ["date", "zone", "type"];
    const lines = [headers.join(",")].concat(
      raw.map(
        (r) =>
          `${new Date(r.created_at).toISOString().slice(0, 10)},${r.zone},${r.type}`
      )
    );
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ads_${tenantId}_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ads Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <div className="md:col-span-2">
            <Label>Start</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>End</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setPreset(7)}>
              7d
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPreset(30)}>
              30d
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPreset(90)}>
              90d
            </Button>
            <Button type="button" onClick={refresh} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            <Button type="button" variant="outline" onClick={exportCSV}>
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Total Impressions: <b>{totals.impressions}</b>
          </div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Total Clicks: <b>{totals.clicks}</b>
          </div>
          <div className="p-3 rounded-xl border bg-white/60 text-sm">
            Overall CTR: <b>{pct(totals.clicks, totals.impressions)}</b>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series}
              margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="impressions"
                name="Impressions"
                stroke="#8884d8"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="clicks"
                name="Clicks"
                stroke="#82ca9d"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-auto border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2">Zone</th>
                <th className="text-left p-2">Impressions</th>
                <th className="text-left p-2">Clicks</th>
                <th className="text-left p-2">CTR</th>
              </tr>
            </thead>
            <tbody>
              {zones.length === 0 && (
                <tr>
                  <td className="p-2" colSpan={4}>
                    No events in range.
                  </td>
                </tr>
              )}
              {zones.map((z) => (
                <tr key={z} className="border-top">
                  <td className="p-2">{z}</td>
                  <td className="p-2">{byZone[z].impressions}</td>
                  <td className="p-2">{byZone[z].clicks}</td>
                  <td className="p-2">
                    {pct(byZone[z].clicks, byZone[z].impressions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500">
          CTR = Clicks ÷ Impressions. Export includes one row per event within the
          selected dates.
        </p>
      </CardContent>
    </Card>
  );

}
function AdminBrandDirectory(){ return null; }

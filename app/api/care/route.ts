export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use the service role key here for secure writes/deletes
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action: string };

    if (action === "ping") return NextResponse.json({ ok: true, route: "care" });

    // PROTOCOLS
    if (action === "upsertProtocol") {
      const { payload } = body;
      const { error } = await admin.from("agriops_protocols").upsert(payload);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "assignProtocol") {
      const { payload } = body; // {tenant_id, animal_id, protocol_id, start_date, next_due_date}
      const { error } = await admin.from("agriops_protocol_assignments").insert(payload);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "updateProtocolAssignment") {
      const { id, tenant_id, patch } = body;
      const { error } = await admin
        .from("agriops_protocol_assignments")
        .update({ ...patch })
        .eq("id", id)
        .eq("tenant_id", tenant_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
if (action === "deleteProtocol") {
  const { id, tenant_id } = body;
  const { error } = await supabase
    .from("agriops_protocols")
    .delete()
    .eq("tenant_id", tenant_id)
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message });
  return NextResponse.json({ ok: true });
}
    // FEEDING
    if (action === "upsertRation") {
      const { payload } = body;
      const { error } = await admin.from("agriops_feed_rations").upsert(payload);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "upsertFeedingSchedule") {
      const { payload } = body;
      const { error } = await admin.from("agriops_feeding_schedule").upsert(payload);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "recordFeedingEvent") {
      const { payload } = body;
      const { error } = await admin.from("agriops_feeding_events").insert(payload);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // MONITORING
    if (action === "logVitals") {
      const { payload } = body;
      const { error } = await admin.from("agriops_vitals").insert(payload);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "createAlert") {
      const { payload } = body;
      const { error } = await admin.from("agriops_alerts").insert(payload);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === "resolveAlert") {
      const { id, tenant_id } = body;
      const { error } = await admin
        .from("agriops_alerts")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenant_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

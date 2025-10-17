/* app/api/care/route.ts
   Secure server actions for Care OS:
   - Protocols: listProtocols, addProtocol, updateProtocol, deleteProtocol, assignProtocol, updateProtocolAssignment
   - Feeding:   upsertRation, upsertFeedingSchedule, recordFeedingEvent
   - Monitoring/Alerts: logVitals, createAlert, resolveAlert
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ───────── Supabase (service-role) — SERVER ONLY ───────── */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn("[/api/care] Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

/* Helpers */
function ok(data?: any) {
  return NextResponse.json({ ok: true, ...(data !== undefined ? { data } : {}) });
}
function err(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/* Optional: health check */
export async function GET() {
  return ok({ route: "care", status: "ready" });
}

/* Main entry */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (!action) return err("Missing 'action'");

    /* ───────────── PROTOCOLS ───────────── */

    // List protocols for a tenant
    if (action === "listProtocols") {
      const { tenant_id } = body;
      if (!tenant_id) return err("tenant_id is required");

      const { data } = await admin
        .from("agriops_protocols")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .throwOnError();

      return ok(data);
    }

    // Add a protocol (simple insert)
    if (action === "addProtocol") {
      const { tenant_id, name, trigger, steps, notes } = body;
      if (!tenant_id || !name) return err("tenant_id and name are required");

      let stepsJson: any[] = [];
      if (Array.isArray(steps)) stepsJson = steps;
      else if (typeof steps === "string") {
        stepsJson = steps.split(",").map((s) => s.trim()).filter(Boolean);
      }

      await admin
        .from("agriops_protocols")
        .insert({
          tenant_id,
          name,
          trigger: trigger ?? null,
          steps: stepsJson ?? [],
          notes: notes ?? null,
        })
        .throwOnError();

      return ok();
    }

    // Update a protocol by id + tenant
    // body: { id, tenant_id, patch: { name?, trigger?, steps?, notes? } }
    if (action === "updateProtocol") {
      const { id, tenant_id, patch } = body;
      if (!id || !tenant_id || !patch) return err("id, tenant_id and patch are required");

      await admin
        .from("agriops_protocols")
        .update({ ...patch })
        .eq("id", id)
        .eq("tenant_id", tenant_id)
        .throwOnError();

      return ok();
    }

    // Delete protocol by id + tenant_id
    if (action === "deleteProtocol") {
      const { id, tenant_id } = body;
      if (!id || !tenant_id) return err("id and tenant_id are required");

      await admin
        .from("agriops_protocols")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", id)
        .throwOnError();

      return ok();
    }

    // Assign a protocol to an animal
    // body.payload: { tenant_id, animal_id, protocol_id, start_date, status?, next_due_date? }
    if (action === "assignProtocol") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.animal_id || !payload?.protocol_id || !payload?.start_date) {
        return err("payload.tenant_id, payload.animal_id, payload.protocol_id, payload.start_date are required");
      }

      await admin
        .from("agriops_protocol_assignments")
        .insert(payload)
        .throwOnError();

      return ok();
    }

    // Update a protocol assignment
    // body: { id, tenant_id, patch }
    if (action === "updateProtocolAssignment") {
      const { id, tenant_id, patch } = body;
      if (!id || !tenant_id || !patch) return err("id, tenant_id and patch are required");

      await admin
        .from("agriops_protocol_assignments")
        .update({ ...patch })
        .eq("id", id)
        .eq("tenant_id", tenant_id)
        .throwOnError();

      return ok();
    }

    /* ───────────── FEEDING ───────────── */

    // Upsert a ration
    // body.payload: { tenant_id, name, dmi_target_kg?, ingredients:[], notes? }
    if (action === "upsertRation") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.name) return err("payload.tenant_id and payload.name are required");

      await admin
        .from("agriops_feed_rations")
        .upsert(payload)
        .throwOnError();

      return ok();
    }

    // Upsert a feeding schedule
    // body.payload: { tenant_id, group_key, ration_id, start_date, end_date?, times?, notes? }
    if (action === "upsertFeedingSchedule") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.group_key || !payload?.ration_id || !payload?.start_date) {
        return err("payload.tenant_id, payload.group_key, payload.ration_id, payload.start_date are required");
      }

      await admin
        .from("agriops_feeding_schedule")
        .upsert(payload)
        .throwOnError();

      return ok();
    }

    // Record a feeding event
    // body.payload: { tenant_id, event_ts, group_key?, animal_id?, ration_id?, offered_kg?, refused_kg?, notes? }
    if (action === "recordFeedingEvent") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.event_ts) return err("payload.tenant_id and payload.event_ts are required");

      await admin
        .from("agriops_feeding_events")
        .insert(payload)
        .throwOnError();

      return ok();
    }

    /* ───────────── MONITORING / ALERTS ───────────── */

    // Log animal vitals
    // body.payload: { tenant_id, animal_id, reading_date, temp_c?, rumination_min?, steps?, bcs?, notes? }
    if (action === "logVitals") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.animal_id || !payload?.reading_date) {
        return err("payload.tenant_id, payload.animal_id and payload.reading_date are required");
      }

      await admin
        .from("agriops_vitals")
        .insert(payload)
        .throwOnError();

      return ok();
    }

    // Create an alert
    // body.payload: { tenant_id, animal_id?, type, severity?, message }
    if (action === "createAlert") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.type || !payload?.message) {
        return err("payload.tenant_id, payload.type and payload.message are required");
      }

      await admin
        .from("agriops_alerts")
        .insert(payload)
        .throwOnError();

      return ok();
    }

    // Resolve an alert (set resolved_at = now)
    // body: { id, tenant_id }
    if (action === "resolveAlert") {
      const { id, tenant_id } = body;
      if (!id || !tenant_id) return err("id and tenant_id are required");

      await admin
        .from("agriops_alerts")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenant_id)
        .throwOnError();

      return ok();
    }

    /* Unknown action */
    return err(`Unknown action: ${action}`, 400);
  } catch (e: any) {
    console.error("[/api/care] error:", e);
    return err(e?.message || "Server error", 500);
  }
}

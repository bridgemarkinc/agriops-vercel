/* app/api/care/route.ts
   Secure server actions for Care OS:
   - Protocols: upsertProtocol, deleteProtocol, assignProtocol, updateProtocolAssignment
   - Feeding:   upsertRation, upsertFeedingSchedule, recordFeedingEvent
   - Monitoring/Alerts: logVitals, createAlert, resolveAlert
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ──────────────────────────────────────────────────────────
   Supabase (service-role) — SERVER ONLY
   Make sure these env vars are set in Vercel:
   - NEXT_PUBLIC_SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   (DO NOT expose the service key on the client)
────────────────────────────────────────────────────────── */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn(
    "[/api/care] Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

/* ──────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────── */
function ok(data?: any) {
  return NextResponse.json({ ok: true, ...(data ? { data } : {}) });
}
function err(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/* Optional: quick health check (GET) */
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

    // Upsert a protocol template
    // body.payload: { tenant_id, name, species?, trigger?, steps:[], notes? }
    if (action === "upsertProtocol") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.name) {
        return err("payload.tenant_id and payload.name are required");
      }
      const { error } = await admin.from("agriops_protocols").upsert(payload);
      if (error) return err(error.message, 500);
      return ok();
    }

    // Delete protocol by id + tenant_id
    // body: { id, tenant_id }
    if (action === "deleteProtocol") {
      const { id, tenant_id } = body;
      if (!id || !tenant_id) return err("id and tenant_id are required");
      const { error } = await admin
        .from("agriops_protocols")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", id);
      if (error) return err(error.message, 500);
      return ok();
    }

    // Assign a protocol to an animal
    // body.payload: { tenant_id, animal_id, protocol_id, start_date, status?, next_due_date? }
    if (action === "assignProtocol") {
      const { payload } = body;
      if (
        !payload?.tenant_id ||
        !payload?.animal_id ||
        !payload?.protocol_id ||
        !payload?.start_date
      ) {
        return err(
          "payload.tenant_id, payload.animal_id, payload.protocol_id, payload.start_date are required"
        );
      }
      const { error } = await admin
        .from("agriops_protocol_assignments")
        .insert(payload);
      if (error) return err(error.message, 500);
      return ok();
    }

    // Update a protocol assignment (e.g., status, next_due_date, completed_steps)
    // body: { id, tenant_id, patch }
    if (action === "updateProtocolAssignment") {
      const { id, tenant_id, patch } = body;
      if (!id || !tenant_id || !patch) {
        return err("id, tenant_id and patch are required");
      }
      const { error } = await admin
        .from("agriops_protocol_assignments")
        .update({ ...patch })
        .eq("id", id)
        .eq("tenant_id", tenant_id);
      if (error) return err(error.message, 500);
      return ok();
    }

    /* ───────────── FEEDING ───────────── */

    // Upsert a ration
    // body.payload: { tenant_id, name, dmi_target_kg?, ingredients:[], notes? }
    if (action === "upsertRation") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.name) {
        return err("payload.tenant_id and payload.name are required");
      }
      const { error } = await admin
        .from("agriops_feed_rations")
        .upsert(payload);
      if (error) return err(error.message, 500);
      return ok();
    }

    // Upsert a feeding schedule
    // body.payload: { tenant_id, group_key, ration_id, start_date, end_date?, times?, notes? }
    if (action === "upsertFeedingSchedule") {
      const { payload } = body;
      if (
        !payload?.tenant_id ||
        !payload?.group_key ||
        !payload?.ration_id ||
        !payload?.start_date
      ) {
        return err(
          "payload.tenant_id, payload.group_key, payload.ration_id, payload.start_date are required"
        );
      }
      const { error } = await admin
        .from("agriops_feeding_schedule")
        .upsert(payload);
      if (error) return err(error.message, 500);
      return ok();
    }

    // Record a feeding event
    // body.payload: { tenant_id, event_ts, group_key?, animal_id?, ration_id?, offered_kg?, refused_kg?, notes? }
    if (action === "recordFeedingEvent") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.event_ts) {
        return err("payload.tenant_id and payload.event_ts are required");
      }
      const { error } = await admin
        .from("agriops_feeding_events")
        .insert(payload);
      if (error) return err(error.message, 500);
      return ok();
    }

    /* ───────────── MONITORING / ALERTS ───────────── */

    // Log animal vitals
    // body.payload: { tenant_id, animal_id, reading_date, temp_c?, rumination_min?, steps?, bcs?, notes? }
    if (action === "logVitals") {
      const { payload } = body;
      if (
        !payload?.tenant_id ||
        !payload?.animal_id ||
        !payload?.reading_date
      ) {
        return err(
          "payload.tenant_id, payload.animal_id and payload.reading_date are required"
        );
      }
      const { error } = await admin.from("agriops_vitals").insert(payload);
      if (error) return err(error.message, 500);
      return ok();
    }

    // Create an alert
    // body.payload: { tenant_id, animal_id?, type, severity?, message }
    if (action === "createAlert") {
      const { payload } = body;
      if (!payload?.tenant_id || !payload?.type || !payload?.message) {
        return err("payload.tenant_id, payload.type and payload.message are required");
      }
      const { error } = await admin.from("agriops_alerts").insert(payload);
      if (error) return err(error.message, 500);
      return ok();
    }

    // Resolve an alert (set resolved_at = now)
    // body: { id, tenant_id }
    if (action === "resolveAlert") {
      const { id, tenant_id } = body;
      if (!id || !tenant_id) return err("id and tenant_id are required");
      const { error } = await admin
        .from("agriops_alerts")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenant_id);
      if (error) return err(error.message, 500);
      return ok();
    }

    /* Unknown action */
    return err(`Unknown action: ${action}`, 400);
  } catch (e: any) {
    console.error("[/api/care] error:", e);
    return err(e?.message || "Server error", 500);
  }
}

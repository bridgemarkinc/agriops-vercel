export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function ok(data?: any) {
  return NextResponse.json({ ok: true, data });
}
function err(message = "Request failed", status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const { action, tenant_id, animal_id, patch, vitals } = await req.json();

    /* ──────────────── A. LIST VITALS ──────────────── */
    if (action === "listVitals") {
      if (!tenant_id || !animal_id) return err("tenant_id and animal_id required");
      const { data, error } = await admin
        .from("agriops_vitals")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("measure_time", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ok(data);
    }

    /* ──────────────── B. ADD NEW VITAL RECORD ──────────────── */
    if (action === "addVital") {
      if (!tenant_id || !animal_id || !vitals)
        return err("tenant_id, animal_id, and vitals required");

      // vitals example: { temperature: 101.3, heart_rate: 80, respiration_rate: 28 }
      const { error } = await admin.from("agriops_vitals").insert({
        tenant_id,
        animal_id,
        temperature: vitals.temperature ?? null,
        heart_rate: vitals.heart_rate ?? null,
        respiration_rate: vitals.respiration_rate ?? null,
        notes: vitals.notes ?? null,
      });

      if (error) throw error;
      return ok({ added: true });
    }

    /* ──────────────── C. UPDATE EXISTING VITAL ──────────────── */
    if (action === "updateVital") {
      if (!tenant_id || !animal_id || !patch?.id)
        return err("tenant_id, animal_id, patch.id required");

      const { error } = await admin
        .from("agriops_vitals")
        .update(patch)
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .eq("id", patch.id);
      if (error) throw error;
      return ok({ updated: true });
    }

    /* ──────────────── D. DEFAULT ──────────────── */
    return err(`Unknown action: ${action}`, 400);
  } catch (e: any) {
    console.error("API /api/vitals error:", e.message || e);
    return NextResponse.json(
      { ok: false, error: e.message || "Server error", details: e },
      { status: 500 }
    );
  }
}

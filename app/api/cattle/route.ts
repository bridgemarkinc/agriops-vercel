// app/api/cattle/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function ok(data?: any) {
  return NextResponse.json({ ok: true, ...(data !== undefined ? { data } : {}) });
}
function err(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Health check */
export async function GET() {
  return ok({ route: "cattle", status: "ready" });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (!action) return err("Missing 'action'");

    /* ─────────────────────────────
       BULK UPSERT ANIMALS (CSV)
       action: "bulkUpsertAnimals"
    ───────────────────────────── */
    if (action === "bulkUpsertAnimals") {
      const { rows } = body as { rows: any[] };

      if (!Array.isArray(rows) || rows.length === 0) {
        return err("rows (array) is required");
      }
      // Validate required fields
      for (const r of rows) {
        if (!r?.tenant_id || !r?.tag) {
          return err("each row requires tenant_id and tag");
        }
      }

      // Chunk to avoid payload/row limits
      const chunkSize = 500;
      let imported = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await admin
          .from("agriops_cattle")
          .upsert(chunk, {
            onConflict: "tenant_id,tag",
            ignoreDuplicates: false,
          } as any)
          .throwOnError();
        imported += chunk.length;
      }

      return ok({ imported });
    }

    /* ─────────────────────────────
       SEND TO PROCESSING
       action: "sendToProcessing"
    ───────────────────────────── */
    else if (action === "sendToProcessing") {
      const {
        tenant_id,
        animal_id,
        tag,
        sent_date,
        processor,
        transport_id,
        live_weight_lb,
        notes,
      } = body;

      if (!tenant_id || !animal_id || !tag || !sent_date) {
        return err("tenant_id, animal_id, tag, sent_date are required");
      }

      await admin
        .from("agriops_cattle_processing")
        .insert({
          tenant_id,
          animal_id,
          tag,
          sent_date,
          processor: processor ?? null,
          transport_id: transport_id ?? null,
          live_weight_lb: live_weight_lb ?? null,
          notes: notes ?? null,
          status: "scheduled",
        })
        .throwOnError();

      await admin
        .from("agriops_cattle")
        .update({ status: "processing" })
        .eq("id", animal_id)
        .eq("tenant_id", tenant_id)
        .throwOnError();

      return ok();
    }

    /* Unknown action */
    return err(`Unknown action: ${action}`, 400);
  } catch (e: any) {
    console.error("[/api/cattle] error:", e);
    return err(e?.message || "Server error", 500);
  }
}

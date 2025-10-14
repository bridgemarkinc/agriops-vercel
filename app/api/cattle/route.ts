// app/api/cattle/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize using your Supabase service role key (server-side only)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action: string };

    // 🧪 Test route (ping)
    if (action === "ping") {
      return NextResponse.json({ ok: true, role: "service_role_connected" });
    }

    // 🐄 Add or update single animal
    if (action === "upsertAnimal") {
      const { payload } = body;
      const { error } = await admin
        .from("agriops_cattle")
        .upsert(payload, { onConflict: "tenant_id,tag" } as any);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ✏️ Update existing animal
    if (action === "updateAnimal") {
      const { id, tenant_id, patch } = body;
      const { error } = await admin
        .from("agriops_cattle")
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenant_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ⚖️ Add weight record
    if (action === "addWeight") {
      const { tenant_id, animal_id, weigh_date, weight_lb, notes } = body;
      const { error } = await admin.from("agriops_cattle_weights").insert({
        tenant_id,
        animal_id,
        weigh_date,
        weight_lb,
        notes: notes || null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // 💉 Add treatment record
    if (action === "addTreatment") {
      const { tenant_id, animal_id, treat_date, product, dose, notes } = body;
      const { error } = await admin.from("agriops_cattle_treatments").insert({
        tenant_id,
        animal_id,
        treat_date,
        product: product || null,
        dose: dose || null,
        notes: notes || null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // 📦 Bulk import from CSV
    if (action === "bulkUpsertAnimals") {
      const { rows } = body as { rows: any[] };
      const { error } = await admin
        .from("agriops_cattle")
        .upsert(rows, { onConflict: "tenant_id,tag" } as any);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: rows.length });
    }

    // Default handler
    return NextResponse.json(
      { ok: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: 500 }
    );
  }
}

// app/api/cattle/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // set in Vercel

const admin = createClient(url, serviceKey);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action: string };

    if (action === "upsertAnimal") {
      const { payload } = body; // expects agriops_cattle columns
      const { error } = await admin.from("agriops_cattle").upsert(payload, {
        onConflict: "tenant_id,tag",
      } as any);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

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

    if (action === "addWeight") {
      const { tenant_id, animal_id, weigh_date, weight_lb, notes } = body;
      const { error } = await admin.from("agriops_cattle_weights").insert({
        tenant_id, animal_id, weigh_date, weight_lb, notes: notes || null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "addTreatment") {
      const { tenant_id, animal_id, treat_date, product, dose, notes } = body;
      const { error } = await admin.from("agriops_cattle_treatments").insert({
        tenant_id, animal_id, treat_date,
        product: product || null, dose: dose || null, notes: notes || null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "bulkUpsertAnimals") {
      const { rows } = body as { rows: any[] }; // array of cattle rows
      const { error } = await admin.from("agriops_cattle").upsert(rows, {
        onConflict: "tenant_id,tag",
      } as any);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: rows.length });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

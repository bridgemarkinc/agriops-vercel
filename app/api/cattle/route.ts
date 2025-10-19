import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-side only

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // ──────────────────────────────── DEBUG ────────────────────────────────
    if (action === "debugRole") {
      return NextResponse.json({
        ok: true,
        usingServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        urlSet: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      });
    }

    // ──────────────────────────────── BULK UPSERT ────────────────────────────────
    if (action === "bulkUpsertAnimals") {
      const { rows } = body as { rows: any[] };
      const { error } = await admin
        .from("agriops_cattle")
        .upsert(rows, { onConflict: "tenant_id,tag" } as any);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: rows.length });
    }

    // ──────────────────────────────── SEND TO PROCESSING ────────────────────────────────
    if (action === "sendToProcessing") {
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

      const { error } = await admin.from("agriops_cattle_processing").insert({
        tenant_id,
        animal_id,
        tag,
        sent_date,
        processor,
        transport_id,
        live_weight_lb,
        notes,
        status: "scheduled",
      });

      if (error) throw error;

      if (animal_id) {
        const { error: e2 } = await admin
          .from("agriops_cattle")
          .update({ status: "processing" })
          .eq("id", animal_id)
          .eq("tenant_id", tenant_id);
        if (e2) throw e2;
      }

      return NextResponse.json({ ok: true });
    }

    // ──────────────────────────────── ADD ANIMAL PHOTO ────────────────────────────────
    if (action === "addAnimalPhoto") {
      const { tenant_id, animal_id, url, caption } = body;
      const { error } = await admin
        .from("agriops_cattle_photos")
        .insert({ tenant_id, animal_id, url, caption });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // ──────────────────────────────── LIST PHOTOS ────────────────────────────────
    if (action === "listAnimalPhotos") {
      const { tenant_id, animal_id } = body;
      const { data, error } = await admin
        .from("agriops_cattle_photos")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("position", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    // ──────────────────────────────── UPDATE PHOTO ORDER ────────────────────────────────
    if (action === "updatePhotoOrder") {
      const { tenant_id, animal_id, photos } = body;
      for (const p of photos) {
        const { error } = await admin
          .from("agriops_cattle_photos")
          .update({ position: p.position })
          .eq("id", p.id)
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    // ──────────────────────────────── EXPORT CATTLE DETAILS PDF ────────────────────────────────
    if (action === "exportCattlePdf") {
      // For now, just a placeholder response
      // Your front end will request this action with { animal_id, tenant_id }
      // and you can generate a PDF in the next iteration
      return NextResponse.json({
        ok: true,
        message: "PDF generation placeholder",
      });
    }

    // ──────────────────────────────── UNKNOWN ACTION ────────────────────────────────
    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` });
  } catch (e: any) {
    console.error("API /api/cattle error:", e?.message || e, e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error", details: e },
      { status: 500 }
    );
  }
}

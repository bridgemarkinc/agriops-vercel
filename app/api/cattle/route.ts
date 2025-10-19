export const runtime = "nodejs";          // ensure Node (not Edge)
export const dynamic = "force-dynamic";   // don't cache

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* Helpers */
function ok(data?: any) {
  return NextResponse.json({ ok: true, data });
}
function err(message = "Request failed", status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/* Supabase (SERVER — uses service role) */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // no NEXT_PUBLIC_
const PHOTOS_BUCKET = "cattle-photos";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* Make one primary + sync primary_photo_url on cattle */
async function setPrimaryInternal(
  tenant_id: string,
  animal_id: number,
  photo_id: number,
  photo_url: string
) {
  const { error: e1 } = await admin
    .from("agriops_cattle_photos")
    .update({ is_primary: false })
    .eq("tenant_id", tenant_id)
    .eq("animal_id", animal_id);
  if (e1) throw e1;

  const { error: e2 } = await admin
    .from("agriops_cattle_photos")
    .update({ is_primary: true })
    .eq("tenant_id", tenant_id)
    .eq("animal_id", animal_id)
    .eq("id", photo_id);
  if (e2) throw e2;

  const { error: e3 } = await admin
    .from("agriops_cattle")
    .update({ primary_photo_url: photo_url })
    .eq("id", animal_id)
    .eq("tenant_id", tenant_id);
  if (e3) throw e3;
}

export async function POST(req: Request) {
  try {
    const ctype = req.headers.get("content-type") || "";

    /* ───────── A. multipart/form-data (file upload via service role) ───────── */
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const action = String(form.get("action") || "");
      if (action !== "uploadAnimalPhoto") {
        return err(`Unsupported multipart action: ${action}`, 400);
      }

      const tenant_id = String(form.get("tenant_id") || "");
      const animal_id = Number(form.get("animal_id") || 0);
      const tag = String(form.get("tag") || "");
      const file = form.get("file") as File | null;
      const set_primary = String(form.get("set_primary") || "") === "true";

      if (!tenant_id || !animal_id || !tag || !file) {
        return err("tenant_id, animal_id, tag, file required");
      }

      // Build a unique path: tenant/animal/tag/timestamp_filename
      const ts = Date.now();
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const filePath = `${tenant_id}/${animal_id}/${tag}/${ts}_${safeName}`;

      // Upload to Storage with service role
      const arrayBuf = await file.arrayBuffer();
      const { error: upErr } = await admin.storage
        .from(PHOTOS_BUCKET)
        .upload(filePath, new Uint8Array(arrayBuf), {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
      if (upErr) throw upErr;

      // Public URL
      const { data: pub } = admin.storage.from(PHOTOS_BUCKET).getPublicUrl(filePath);
      const photo_url = pub?.publicUrl || "";
      const photo_path = filePath;

      // Determine next sort_order
      const { data: existing, error: exErr } = await admin
        .from("agriops_cattle_photos")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id);
      if (exErr) throw exErr;
      const sort_order = (existing?.length || 0);

      // Insert row
      const { data: row, error: insErr } = await admin
        .from("agriops_cattle_photos")
        .insert({
          tenant_id, animal_id, tag, photo_url, photo_path,
          is_primary: false, sort_order,
        })
        .select("*")
        .single();
      if (insErr) throw insErr;

      // Set primary if asked or first image
      if (set_primary || (existing?.length ?? 0) === 0) {
        await setPrimaryInternal(tenant_id, animal_id, row.id, photo_url);
      }

      return ok({ id: row.id, photo_url, photo_path });
    }

    /* ───────── B. JSON actions (normal API) ───────── */
    const body = await req.json();
    const action = String(body?.action || "");

    /* Debug: prove service key is loaded in Production */
    if (action === "debugRole") {
      return NextResponse.json({
        ok: true,
        version: "cattle-route v1",
        usingServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        urlSet: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      });
    }

    /* Animals basic */
    if (action === "upsertAnimal") {
      const { payload } = body as { payload: any };
      if (!payload?.tenant_id || !payload?.tag) return err("payload.tenant_id and payload.tag are required");
      const { error } = await admin
        .from("agriops_cattle")
        .upsert(payload, { onConflict: "tenant_id,tag" } as any);
      if (error) throw error;
      return ok({ upserted: true });
    }

    if (action === "updateAnimal") {
      const { id, tenant_id, patch } = body as { id: number; tenant_id: string; patch: any };
      if (!id || !tenant_id) return err("id and tenant_id required");
      const { error } = await admin.from("agriops_cattle").update(patch).eq("id", id).eq("tenant_id", tenant_id);
      if (error) throw error;
      return ok({ updated: true });
    }

    if (action === "bulkUpsertAnimals") {
      const { rows } = body as { rows: any[] };
      if (!Array.isArray(rows) || rows.length === 0) return err("rows[] required");
      const { error } = await admin
        .from("agriops_cattle")
        .upsert(rows, { onConflict: "tenant_id,tag" } as any);
      if (error) throw error;
      return ok({ imported: rows.length });
    }

    /* Weights / Treatments */
    if (action === "addWeight") {
      const { tenant_id, animal_id, weigh_date, weight_lb, notes } = body;
      if (!tenant_id || !animal_id || !weigh_date || !weight_lb) {
        return err("tenant_id, animal_id, weigh_date, weight_lb required");
      }
      const { error } = await admin.from("agriops_cattle_weights").insert({
        tenant_id, animal_id, weigh_date, weight_lb, notes: notes || null,
      });
      if (error) throw error;
      return ok({ added: true });
    }

    if (action === "addTreatment") {
      const { tenant_id, animal_id, treat_date, product, dose, notes } = body;
      if (!tenant_id || !animal_id || !treat_date) return err("tenant_id, animal_id, treat_date required");
      const { error } = await admin.from("agriops_cattle_treatments").insert({
        tenant_id, animal_id, treat_date, product: product || null, dose: dose || null, notes: notes || null,
      });
      if (error) throw error;
      return ok({ added: true });
    }

    /* Processing (optional) */
    if (action === "sendToProcessing") {
      const {
        tenant_id, animal_id, tag,
        sent_date, processor, transport_id, live_weight_lb, notes
      } = body;
      if (!tenant_id || !animal_id || !tag || !sent_date) {
        return err("tenant_id, animal_id, tag, sent_date required");
      }
      const { error } = await admin.from("agriops_cattle_processing").insert({
        tenant_id, animal_id, tag, sent_date,
        processor: processor || null,
        transport_id: transport_id || null,
        live_weight_lb: live_weight_lb ?? null,
        status: "scheduled",
        notes: notes || null,
      });
      if (error) throw error;

      const { error: e2 } = await admin
        .from("agriops_cattle")
        .update({ status: "processing" })
        .eq("id", animal_id)
        .eq("tenant_id", tenant_id);
      if (e2) throw e2;

      return ok({ sent: true });
    }

    /* Photos (list/add/setPrimary/delete/reorder) */
    if (action === "listAnimalPhotos") {
      const { tenant_id, animal_id } = body;
      if (!tenant_id || !animal_id) return err("tenant_id and animal_id are required");
      const { data, error } = await admin
        .from("agriops_cattle_photos")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ok(data);
    }

    if (action === "addAnimalPhoto") {
      const { tenant_id, animal_id, tag, photo_url, photo_path, set_primary } = body;
      if (!tenant_id || !animal_id || !tag || !photo_url || !photo_path) {
        return err("tenant_id, animal_id, tag, photo_url, photo_path required");
      }

      const { data: existing, error: exErr } = await admin
        .from("agriops_cattle_photos")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id);
      if (exErr) throw exErr;
      const sort_order = (existing?.length || 0);

      const { data, error } = await admin
        .from("agriops_cattle_photos")
        .insert({
          tenant_id, animal_id, tag, photo_url, photo_path,
          is_primary: false, sort_order,
        })
        .select("*")
        .single();
      if (error) throw error;

      if (set_primary || (existing?.length ?? 0) === 0) {
        await setPrimaryInternal(tenant_id, animal_id, data.id, photo_url);
      }

      return ok({ id: data.id });
    }

    if (action === "setPrimaryPhoto") {
      const { tenant_id, animal_id, id } = body as { tenant_id: string; animal_id: number; id: number };
      if (!tenant_id || !animal_id || !id) return err("tenant_id, animal_id, id required");

      const { data: photo, error: fErr } = await admin
        .from("agriops_cattle_photos")
        .select("photo_url")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .eq("id", id)
        .maybeSingle();
      if (fErr) throw fErr;
      if (!photo) return err("photo not found", 404);

      await setPrimaryInternal(tenant_id, animal_id, id, photo.photo_url);
      return ok({ primary_set: true });
    }

    if (action === "deleteAnimalPhoto") {
      const { tenant_id, animal_id, id, photo_path } = body as {
        tenant_id: string; animal_id: number; id: number; photo_path: string;
      };
      if (!tenant_id || !animal_id || !id || !photo_path) return err("tenant_id, animal_id, id, photo_path required");

      const { error } = await admin
        .from("agriops_cattle_photos")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .eq("id", id);
      if (error) throw error;

      await admin.storage.from(PHOTOS_BUCKET).remove([photo_path]).catch(() => {});
      return ok({ deleted: true });
    }

    if (action === "reorderAnimalPhotos") {
      const { tenant_id, animal_id, ordered_ids } = body as {
        tenant_id: string; animal_id: number; ordered_ids: number[];
      };
      if (!tenant_id || !animal_id || !Array.isArray(ordered_ids)) {
        return err("tenant_id, animal_id, ordered_ids[] are required");
      }
      for (let i = 0; i < ordered_ids.length; i++) {
        const id = ordered_ids[i];
        const { error } = await admin
          .from("agriops_cattle_photos")
          .update({ sort_order: i })
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .eq("id", id);
        if (error) throw error;
      }
      return ok({ reordered: true });
    }

    /* Unknown action */
    return err(`Unknown action: ${action}`, 400);
  } catch (e: any) {
    console.error("API /api/cattle error:", e?.message || e, e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error", details: e },
      { status: 500 }
    );
  }
}

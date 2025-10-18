// app/api/cattle/route.ts
import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/** ───────────────────────── Config ───────────────────────── */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PHOTOS_BUCKET = "cattle-photos"; // make sure this bucket exists (public is simplest)

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn(
    "Missing Supabase env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
  );
}

/** Admin client (server-only) */
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Helpers */
function ok(data?: any) {
  return NextResponse.json({ ok: true, data });
}
function err(message = "Request failed", status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** POST only; body must include { action, ... } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || "");

    /* ───────────── CATTLE UPSERT / UPDATE / BULK IMPORT ───────────── */

    // Upsert single animal (by tenant_id + tag)
    if (action === "upsertAnimal") {
      const { payload } = body as { payload: any };
      if (!payload?.tenant_id || !payload?.tag) return err("payload.tenant_id and payload.tag are required");

      const { error } = await admin
        .from("agriops_cattle")
        .upsert(payload, { onConflict: "tenant_id,tag" } as any);
      if (error) throw error;

      return ok({ upserted: true });
    }

    // Patch existing animal by id
    else if (action === "updateAnimal") {
      const { id, tenant_id, patch } = body as { id: number; tenant_id: string; patch: any };
      if (!id || !tenant_id) return err("id and tenant_id required");

      const { error } = await admin.from("agriops_cattle").update(patch).eq("id", id).eq("tenant_id", tenant_id);
      if (error) throw error;

      return ok({ updated: true });
    }

    // Bulk import
    else if (action === "bulkUpsertAnimals") {
      const { rows } = body as { rows: any[] };
      if (!Array.isArray(rows) || rows.length === 0) return err("rows[] required");

      const { error } = await admin
        .from("agriops_cattle")
        .upsert(rows, { onConflict: "tenant_id,tag" } as any);
      if (error) throw error;

      return ok({ imported: rows.length });
    }

    /* ───────────── WEIGHTS / TREATMENTS ───────────── */

    else if (action === "addWeight") {
      const { tenant_id, animal_id, weigh_date, weight_lb, notes } = body;
      if (!tenant_id || !animal_id || !weigh_date || !weight_lb) return err("tenant_id, animal_id, weigh_date, weight_lb required");

      const { error } = await admin.from("agriops_cattle_weights").insert({
        tenant_id, animal_id, weigh_date, weight_lb, notes: notes || null,
      });
      if (error) throw error;

      return ok({ added: true });
    }

    else if (action === "addTreatment") {
      const { tenant_id, animal_id, treat_date, product, dose, notes } = body;
      if (!tenant_id || !animal_id || !treat_date) return err("tenant_id, animal_id, treat_date required");

      const { error } = await admin.from("agriops_cattle_treatments").insert({
        tenant_id, animal_id, treat_date, product: product || null, dose: dose || null, notes: notes || null,
      });
      if (error) throw error;

      return ok({ added: true });
    }

    /* ───────────── PROCESSING ───────────── */

    else if (action === "sendToProcessing") {
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

      // Optional: mark animal status
      const { error: e2 } = await admin
        .from("agriops_cattle")
        .update({ status: "processing" })
        .eq("id", animal_id)
        .eq("tenant_id", tenant_id);
      if (e2) throw e2;

      return ok({ sent: true });
    }

    else if (action === "listProcessing") {
      const { tenant_id, animal_id } = body;
      if (!tenant_id || !animal_id) return err("tenant_id and animal_id required");

      const { data, error } = await admin
        .from("agriops_cattle_processing")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("sent_date", { ascending: false });
      if (error) throw error;

      return ok(data);
    }

    else if (action === "updateProcessing") {
      const { id, tenant_id, patch } = body as { id: number; tenant_id: string; patch: any };
      if (!id || !tenant_id) return err("id and tenant_id required");

      const { error } = await admin
        .from("agriops_cattle_processing")
        .update(patch)
        .eq("id", id)
        .eq("tenant_id", tenant_id);
      if (error) throw error;

      return ok({ updated: true });
    }

    /* ───────────── PHOTOS (gallery) ───────────── */

    // List photos ordered by sort_order then created_at
    else if (action === "listAnimalPhotos") {
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

    // Add a photo record after client uploads to Storage
    else if (action === "addAnimalPhoto") {
      const { tenant_id, animal_id, tag, photo_url, photo_path, set_primary } = body;
      if (!tenant_id || !animal_id || !tag || !photo_url || !photo_path) {
        return err("tenant_id, animal_id, tag, photo_url, photo_path required");
      }

      // compute next sort order
      const { data: existing, error: exErr } = await admin
        .from("agriops_cattle_photos")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id);
      if (exErr) throw exErr;
      const sort_order = (existing?.length || 0);

      // insert photo row
      const { data, error } = await admin
        .from("agriops_cattle_photos")
        .insert({
          tenant_id, animal_id, tag, photo_url, photo_path, is_primary: false, sort_order,
        })
        .select("*")
        .single();
      if (error) throw error;

      // if first or explicit set_primary => make primary
      if (set_primary || (existing?.length ?? 0) === 0) {
        await setPrimaryInternal(tenant_id, animal_id, data.id, photo_url);
      }

      return ok({ id: data.id });
    }

    // Set a specific photo as primary
    else if (action === "setPrimaryPhoto") {
      const { tenant_id, animal_id, id } = body as { tenant_id: string; animal_id: number; id: number };
      if (!tenant_id || !animal_id || !id) return err("tenant_id, animal_id, id required");

      // get the photo_url
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

    // Delete a photo (removes DB row and storage object)
    else if (action === "deleteAnimalPhoto") {
      const { tenant_id, animal_id, id, photo_path } = body as {
        tenant_id: string; animal_id: number; id: number; photo_path: string;
      };
      if (!tenant_id || !animal_id || !id || !photo_path) return err("tenant_id, animal_id, id, photo_path required");

      // remove DB row
      const { error } = await admin
        .from("agriops_cattle_photos")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .eq("id", id);
      if (error) throw error;

      // remove storage object (ignore failures)
      await admin.storage.from(PHOTOS_BUCKET).remove([photo_path]).catch(() => {});

      // if it was primary, clear primary on cattle if it matched
      const { data: c } = await admin
        .from("agriops_cattle")
        .select("primary_photo_url")
        .eq("id", animal_id)
        .eq("tenant_id", tenant_id)
        .maybeSingle();

      if (c?.primary_photo_url) {
        // check if any photo remains with same URL
        const { data: still } = await admin
          .from("agriops_cattle_photos")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .eq("photo_path", photo_path);
        if (!still || still.length === 0) {
          await admin
            .from("agriops_cattle")
            .update({ primary_photo_url: null })
            .eq("id", animal_id)
            .eq("tenant_id", tenant_id);
        }
      }

      return ok({ deleted: true });
    }

    // Reorder photos by array of ids [left->right, top->bottom]
    else if (action === "reorderAnimalPhotos") {
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

    /* ───────────── Unknown ───────────── */
    else {
      return err(`Unknown action: ${action}`, 400);
    }
  } catch (e: any) {
    console.error(e);
    return err(e?.message || "Server error", 500);
  }
}

/** Set one photo as primary and sync cattle.primary_photo_url */
async function setPrimaryInternal(
  tenant_id: string,
  animal_id: number,
  photo_id: number,
  photo_url: string
) {
  // 1) unset old primaries
  const { error: e1 } = await admin
    .from("agriops_cattle_photos")
    .update({ is_primary: false })
    .eq("tenant_id", tenant_id)
    .eq("animal_id", animal_id);
  if (e1) throw e1;

  // 2) set selected primary
  const { error: e2 } = await admin
    .from("agriops_cattle_photos")
    .update({ is_primary: true })
    .eq("tenant_id", tenant_id)
    .eq("animal_id", animal_id)
    .eq("id", photo_id);
  if (e2) throw e2;

  // 3) update cattle row
  const { error: e3 } = await admin
    .from("agriops_cattle")
    .update({ primary_photo_url: photo_url })
    .eq("id", animal_id)
    .eq("tenant_id", tenant_id);
  if (e3) throw e3;
}

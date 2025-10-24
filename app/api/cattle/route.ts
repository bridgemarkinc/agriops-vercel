// app/api/cattle/route.ts
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic"; // always run on server
export const runtime = "nodejs";

function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE!;
  if (!url || !service) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE");
  }
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Small runtime helpers to narrow unknown JSON safely.
function readString(obj: any, key: string): string | null {
  const v = obj?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}
function readNumber(obj: any, key: string): number | null {
  const v = obj?.[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}


/** Server-only client (service role). Do NOT export this. */
function getServiceClient(): SupabaseClient {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !serviceKey) {
    throw new Error(
      "Missing env: SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE"
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ActionBody = {
  action: string;
  [k: string]: any;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ActionBody;
    const supabase = getServiceClient();

    switch (body.action) {
      /* ───────────── Animals ───────────── */
      case "upsertAnimal": {
        const { payload } = body; // { tenant_id, tag, ... }
        const { data, error } = await supabase
          .from("agriops_cattle")
          .upsert(payload, { onConflict: "tenant_id,tag" })
          .select("*")
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "updateAnimal": {
        const { id, tenant_id, patch } = body;
        const { data, error } = await supabase
          .from("agriops_cattle")
          .update(patch)
          .eq("tenant_id", tenant_id)
          .eq("id", id)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "bulkUpsertAnimals": {
        const { rows } = body; // array of {tenant_id, tag, ...}
        if (!Array.isArray(rows) || rows.length === 0) {
          return NextResponse.json({ ok: true, data: { imported: 0 } });
        }
        const { data, error } = await supabase
          .from("agriops_cattle")
          .upsert(rows, { onConflict: "tenant_id,tag" })
          .select("id");
        if (error) throw error;
        return NextResponse.json({
          ok: true,
          data: { imported: data?.length ?? 0 },
        });
      }

      /* ───────────── Weights & Treatments ───────────── */
      case "addWeight": {
        const { tenant_id, animal_id, weigh_date, weight_lb, notes } = body;
        const { data, error } = await supabase
          .from("agriops_cattle_weights")
          .insert({
            tenant_id,
            animal_id,
            weigh_date,
            weight_lb,
            notes: notes ?? null,
          })
          .select("*")
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "addTreatment": {
        const { tenant_id, animal_id, treat_date, product, dose, notes } = body;
        const { data, error } = await supabase
          .from("agriops_cattle_treatments")
          .insert({
            tenant_id,
            animal_id,
            treat_date,
            product: product ?? null,
            dose: dose ?? null,
            notes: notes ?? null,
          })
          .select("*")
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      /* ───────────── Processing ───────────── */
      case "listProcessing": {
        const { tenant_id, animal_id } = body;
        const { data, error } = await supabase
          .from("agriops_processing")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .order("sent_date", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "sendToProcessing": {
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
        const { data, error } = await supabase
          .from("agriops_processing")
          .insert({
            tenant_id,
            animal_id,
            tag,
            status: "scheduled",
            sent_date,
            processor: processor ?? null,
            transport_id: transport_id ?? null,
            live_weight_lb: live_weight_lb ?? null,
            notes: notes ?? null,
          })
          .select("*")
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "updateProcessing": {
        const { id, tenant_id, patch } = body;
        const { data, error } = await supabase
          .from("agriops_processing")
          .update(patch)
          .eq("tenant_id", tenant_id)
          .eq("id", id)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      /* ───────────── Photos ───────────── */
      // inside POST(req) { switch(action) { ... } }
case "listAnimalPhotos": {
  const tenant_id = readString(body, "tenant_id");
  const animal_id = readNumber(body, "animal_id");
  if (!tenant_id || animal_id == null) {
    return NextResponse.json(
      { ok: false, error: "tenant_id and animal_id are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("agriops_cattle_photos")
    .select("*")
    .eq("tenant_id", tenant_id)
    .eq("animal_id", animal_id)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return NextResponse.json({ ok: true, data });
}

case "addAnimalPhoto": {
  const tenant_id = readString(body, "tenant_id");
  const animal_id = readNumber(body, "animal_id");
  const tag = readString(body, "tag");
  const photo_url = readString(body, "photo_url");
  const photo_path = readString(body, "photo_path");
  const set_primary = !!body?.set_primary;

  if (!tenant_id || animal_id == null || !tag || !photo_url || !photo_path) {
    return NextResponse.json(
      { ok: false, error: "tenant_id, animal_id, tag, photo_url, photo_path are required" },
      { status: 400 }
    );
  }

  // (optional) verify animal exists for tenant
  const { data: animal, error: aerr } = await supabase
    .from("agriops_cattle")
    .select("id")
    .eq("tenant_id", tenant_id)
    .eq("id", animal_id)
    .maybeSingle();
  if (aerr) throw aerr;
  if (!animal) {
    return NextResponse.json({ ok: false, error: "Animal not found for tenant" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("agriops_cattle_photos")
    .insert({ tenant_id, animal_id, tag, photo_url, photo_path, is_primary: false })
    .select()
    .maybeSingle();
  if (error) throw error;

  if (set_primary && row?.id) {
    await supabase
      .from("agriops_cattle_photos")
      .update({ is_primary: false })
      .eq("tenant_id", tenant_id)
      .eq("animal_id", animal_id);

    await supabase
      .from("agriops_cattle_photos")
      .update({ is_primary: true })
      .eq("tenant_id", tenant_id)
      .eq("id", row.id);

    await supabase
      .from("agriops_cattle")
      .update({ primary_photo_url: photo_url })
      .eq("tenant_id", tenant_id)
      .eq("id", animal_id);

    row.is_primary = true;
  }

  return NextResponse.json({ ok: true, data: row });
}


case "setPrimaryPhoto": {
  const tenant_id = readString(body, "tenant_id");
  const animal_id = readNumber(body, "animal_id");
  const id = readNumber(body, "id");
  if (!tenant_id || animal_id == null || id == null) {
    return NextResponse.json(
      { ok: false, error: "tenant_id, animal_id and id are required" },
      { status: 400 }
    );
  }

  const { data: photo, error: gerr } = await supabase
    .from("agriops_cattle_photos")
    .select("photo_url")
    .eq("tenant_id", tenant_id)
    .eq("animal_id", animal_id)
    .eq("id", id)
    .maybeSingle();
  if (gerr) throw gerr;
  if (!photo) return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });

  await supabase
    .from("agriops_cattle_photos")
    .update({ is_primary: false })
    .eq("tenant_id", tenant_id)
    .eq("animal_id", animal_id);

  await supabase
    .from("agriops_cattle_photos")
    .update({ is_primary: true })
    .eq("tenant_id", tenant_id)
    .eq("id", id);

  await supabase
    .from("agriops_cattle")
    .update({ primary_photo_url: photo.photo_url })
    .eq("tenant_id", tenant_id)
    .eq("id", animal_id);

  return NextResponse.json({ ok: true, data: { id } });
}


case "deleteAnimalPhoto": {
  const tenant_id = readString(body, "tenant_id");
  const animal_id = readNumber(body, "animal_id");
  const id = readNumber(body, "id");
  const photo_path = readString(body, "photo_path");
  if (!tenant_id || animal_id == null || id == null || !photo_path) {
    return NextResponse.json(
      { ok: false, error: "tenant_id, animal_id, id, photo_path are required" },
      { status: 400 }
    );
  }

  const { data: row, error } = await supabase
    .from("agriops_cattle_photos")
    .delete()
    .eq("tenant_id", tenant_id)
    .eq("animal_id", animal_id)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw error;

  // (optional) remove from storage with your service client if you have it available
  // await supaStorage.remove([photo_path]);

  if (row?.is_primary) {
    await supabase
      .from("agriops_cattle")
      .update({ primary_photo_url: null })
      .eq("tenant_id", tenant_id)
      .eq("id", animal_id);
  }

  return NextResponse.json({ ok: true, data: { deleted: id } });
}


case "reorderAnimalPhotos": {
  const tenant_id = readString(body, "tenant_id");
  const animal_id = readNumber(body, "animal_id");
  const ordered_ids = Array.isArray(body?.ordered_ids) ? body.ordered_ids : null;
  if (!tenant_id || animal_id == null || !ordered_ids?.length) {
    return NextResponse.json(
      { ok: false, error: "tenant_id, animal_id and ordered_ids[] are required" },
      { status: 400 }
    );
  }

  let order = 10;
  for (const pid of ordered_ids) {
    const photoId = Number(pid);
    if (!Number.isFinite(photoId)) continue;
    await supabase
      .from("agriops_cattle_photos")
      .update({ sort_order: order })
      .eq("tenant_id", tenant_id)
      .eq("animal_id", animal_id)
      .eq("id", photoId);
    order += 10;
  }
  return NextResponse.json({ ok: true, data: { reordered: ordered_ids.length } });
}



      default:
        return NextResponse.json(
          { ok: false, error: `Unknown action: ${body.action}` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    console.error("[/api/cattle] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

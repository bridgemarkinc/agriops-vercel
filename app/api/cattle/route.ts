// app/api/cattle/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/** Service-role client (bypasses RLS). Never expose this key to the browser. */
function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE!;
  if (!url || !service) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE");
  }
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readJson(req: Request) {
  try { return await req.json(); } catch { return null; }
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true });
}

type ActionBody = Record<string, any>;

export async function POST(req: Request) {
  const supa = getSupabaseService();

  try {
    const body = (await readJson(req)) as ActionBody | null;
    if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

    const { action } = body as { action?: string };
    if (!action) return NextResponse.json({ ok: false, error: "Missing 'action'" }, { status: 400 });

    /* ----------------------- READ LISTS ----------------------- */
    if (action === "listAnimals") {
      const { tenant_id, search } = body as { tenant_id: string; search?: string | null };
      if (!tenant_id) return NextResponse.json({ ok: false, error: "tenant_id required" }, { status: 400 });

      let q = supa.from("agriops_cattle").select("*").eq("tenant_id", tenant_id).order("tag");
      if (search) q = q.ilike("tag", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "listWeights") {
      const { tenant_id, animal_id } = body as { tenant_id: string; animal_id: number };
      const { data, error } = await supa
        .from("agriops_cattle_weights")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("weigh_date", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "listTreatments") {
      const { tenant_id, animal_id } = body as { tenant_id: string; animal_id: number };
      const { data, error } = await supa
        .from("agriops_cattle_treatments")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("treat_date", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "listProcessing") {
      const { tenant_id, animal_id } = body as { tenant_id: string; animal_id: number };
      const { data, error } = await supa
        .from("agriops_cattle_processing")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("sent_date", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "listAnimalPhotos") {
      const { tenant_id, animal_id } = body as { tenant_id: string; animal_id: number };
      const { data, error } = await supa
        .from("agriops_animal_photos")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    /* ----------------------- MUTATIONS ----------------------- */
    if (action === "upsertAnimal") {
      const { payload } = body as { payload: { tenant_id: string; tag: string } & Record<string, any> };
      if (!payload?.tenant_id || !payload?.tag) {
        return NextResponse.json({ ok: false, error: "tenant_id and tag required" }, { status: 400 });
      }
      const { data, error } = await supa
        .from("agriops_cattle")
        .upsert(payload as any)
        .select()
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "updateAnimal") {
      const { id, tenant_id, patch } = body as { id: number; tenant_id: string; patch: Record<string, any> };
      const { data, error } = await supa
        .from("agriops_cattle")
        .update(patch)
        .eq("tenant_id", tenant_id)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "addWeight") {
      const { tenant_id, animal_id, weigh_date, weight_lb, notes } = body as {
        tenant_id: string; animal_id: number; weigh_date: string; weight_lb: number; notes?: string | null;
      };
      const row = { tenant_id, animal_id, weigh_date, weight_lb, notes: notes ?? null };
      const { data, error } = await supa.from("agriops_cattle_weights").insert(row as any).select();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "addTreatment") {
      const { tenant_id, animal_id, treat_date, product, dose, notes } = body as {
        tenant_id: string; animal_id: number; treat_date: string; product?: string | null; dose?: string | null; notes?: string | null;
      };
      const row = { tenant_id, animal_id, treat_date, product: product ?? null, dose: dose ?? null, notes: notes ?? null };
      const { data, error } = await supa.from("agriops_cattle_treatments").insert(row as any).select();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "sendToProcessing") {
      const { tenant_id, animal_id, tag, sent_date, processor, transport_id, live_weight_lb, notes } = body as any;
      const row = {
        tenant_id, animal_id, tag, status: "scheduled",
        sent_date, processor: processor ?? null, transport_id: transport_id ?? null,
        live_weight_lb: live_weight_lb ?? null, notes: notes ?? null,
      };
      const { data, error } = await supa.from("agriops_cattle_processing").insert(row as any).select();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "updateProcessing") {
      const { id, tenant_id, patch } = body as { id: number; tenant_id: string; patch: Record<string, any> };
      const { data, error } = await supa
        .from("agriops_cattle_processing")
        .update(patch)
        .eq("tenant_id", tenant_id)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    /* ----------------------- PHOTOS ----------------------- */
    if (action === "addAnimalPhoto") {
      const { tenant_id, animal_id, tag, photo_url, photo_path, set_primary } = body as {
        tenant_id: string; animal_id: number; tag: string; photo_url: string; photo_path: string; set_primary?: boolean;
      };

      // insert photo
      const { data: inserted, error } = await supa
        .from("agriops_animal_photos")
        .insert({
          tenant_id, animal_id, tag,
          photo_url, photo_path,
          is_primary: false,
        } as any)
        .select()
        .maybeSingle();
      if (error) throw error;

      // optionally set as primary on animal
      if (set_primary && inserted?.id) {
        await supa.from("agriops_cattle").update({ primary_photo_url: photo_url })
          .eq("tenant_id", tenant_id).eq("id", animal_id);
        await supa.from("agriops_animal_photos").update({ is_primary: false })
          .eq("tenant_id", tenant_id).eq("animal_id", animal_id);
        await supa.from("agriops_animal_photos").update({ is_primary: true })
          .eq("tenant_id", tenant_id).eq("id", inserted.id);
      }
      return NextResponse.json({ ok: true, data: inserted });
    }

    if (action === "setPrimaryPhoto") {
      const { tenant_id, animal_id, id } = body as { tenant_id: string; animal_id: number; id: number };
      // find URL for id
      const { data: photo, error: e1 } = await supa
        .from("agriops_animal_photos")
        .select("*").eq("tenant_id", tenant_id).eq("id", id).maybeSingle();
      if (e1) throw e1;
      if (!photo) return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });

      await supa.from("agriops_cattle").update({ primary_photo_url: photo.photo_url })
        .eq("tenant_id", tenant_id).eq("id", animal_id);
      await supa.from("agriops_animal_photos").update({ is_primary: false })
        .eq("tenant_id", tenant_id).eq("animal_id", animal_id);
      await supa.from("agriops_animal_photos").update({ is_primary: true })
        .eq("tenant_id", tenant_id).eq("id", id);

      return NextResponse.json({ ok: true, data: { id } });
    }

    if (action === "deleteAnimalPhoto") {
      const { tenant_id, animal_id, id } = body as { tenant_id: string; animal_id: number; id: number };
      const { error } = await supa
        .from("agriops_animal_photos")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .eq("id", id);
      if (error) throw error;

      // If deleted one was primary, clear animal primary url (optional)
      const { data: remaining } = await supa
        .from("agriops_animal_photos")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("is_primary", { ascending: false })
        .limit(1);
      const nextUrl = remaining?.[0]?.photo_url ?? null;
      await supa.from("agriops_cattle")
        .update({ primary_photo_url: nextUrl })
        .eq("tenant_id", tenant_id).eq("id", animal_id);

      return NextResponse.json({ ok: true, data: { deleted: id } });
    }

    if (action === "reorderAnimalPhotos") {
      const { tenant_id, animal_id, ordered_ids } = body as { tenant_id: string; animal_id: number; ordered_ids: number[] };
      if (!Array.isArray(ordered_ids)) {
        return NextResponse.json({ ok: false, error: "ordered_ids must be an array" }, { status: 400 });
      }
      // simple positional update
      for (let i = 0; i < ordered_ids.length; i++) {
        await supa.from("agriops_animal_photos")
          .update({ sort_order: i })
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .eq("id", ordered_ids[i]);
      }
      return NextResponse.json({ ok: true, data: { reordered: ordered_ids.length } });
    }

    /* ----------------------- BULK IMPORT ----------------------- */
    if (action === "bulkUpsertAnimals") {
      const { rows } = body as { rows: any[] };
      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ ok: false, error: "rows required" }, { status: 400 });
      }
      const { data, error } = await supa.from("agriops_cattle").upsert(rows as any);
      if (error) throw error;
      return NextResponse.json({ ok: true, data: { imported: rows.length } });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error("[/api/cattle] error", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

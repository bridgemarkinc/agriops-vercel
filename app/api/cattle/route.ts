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

// Safe JSON reader
async function readJson(req: Request) {
  try { return await req.json(); } catch { return null; }
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const supa = getSupabaseService();

  try {
    const body = await readJson(req);
    if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

    const action = String(body.action || "");
    if (!action) return NextResponse.json({ ok: false, error: "Missing 'action'" }, { status: 400 });

    /* -------------------- LISTS -------------------- */

    if (action === "listAnimals") {
      const { tenant_id, search } = body as { tenant_id: string; search?: string };
      if (!tenant_id) return NextResponse.json({ ok: false, error: "tenant_id required" }, { status: 400 });
      let q = supa.from("agriops_cattle").select("*").eq("tenant_id", tenant_id).order("tag");
      if (search?.trim()) q = q.ilike("tag", `%${search.trim()}%`);
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
        .from("agriops_cattle_photos")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    /* -------------------- CATTLE CRUD -------------------- */

    if (action === "upsertAnimal") {
      const { payload } = body as {
        payload: {
          tenant_id: string; tag: string; name?: string | null; sex?: "M" | "F" | null;
          breed?: string | null; birth_date?: string | null; current_paddock?: string | null; status?: string | null;
        };
      };
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
      if (!id || !tenant_id) return NextResponse.json({ ok: false, error: "id and tenant_id required" }, { status: 400 });
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

    /* -------------------- WEIGHTS & TREATMENTS -------------------- */

    if (action === "addWeight") {
      const { tenant_id, animal_id, weigh_date, weight_lb, notes } = body as {
        tenant_id: string; animal_id: number; weigh_date: string; weight_lb: number; notes?: string | null;
      };
      if (!tenant_id || !animal_id || !weigh_date || !weight_lb) {
        return NextResponse.json({ ok: false, error: "tenant_id, animal_id, weigh_date, weight_lb required" }, { status: 400 });
      }
      const { data, error } = await supa
        .from("agriops_cattle_weights")
        .insert({ tenant_id, animal_id, weigh_date, weight_lb, notes: notes ?? null })
        .select()
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "addTreatment") {
      const { tenant_id, animal_id, treat_date, product, dose, notes } = body as {
        tenant_id: string; animal_id: number; treat_date: string; product?: string | null; dose?: string | null; notes?: string | null;
      };
      if (!tenant_id || !animal_id || !treat_date) {
        return NextResponse.json({ ok: false, error: "tenant_id, animal_id, treat_date required" }, { status: 400 });
      }
      const { data, error } = await supa
        .from("agriops_cattle_treatments")
        .insert({ tenant_id, animal_id, treat_date, product: product ?? null, dose: dose ?? null, notes: notes ?? null })
        .select()
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    /* -------------------- PROCESSING -------------------- */

    if (action === "sendToProcessing") {
      const { tenant_id, animal_id, tag, sent_date, processor, transport_id, live_weight_lb, notes } = body as {
        tenant_id: string; animal_id: number; tag: string; sent_date: string;
        processor?: string | null; transport_id?: string | null; live_weight_lb?: number | null; notes?: string | null;
      };
      if (!tenant_id || !animal_id || !tag || !sent_date) {
        return NextResponse.json({ ok: false, error: "tenant_id, animal_id, tag, sent_date required" }, { status: 400 });
      }
      const { data, error } = await supa
        .from("agriops_cattle_processing")
        .insert({
          tenant_id, animal_id, tag,
          status: "scheduled",
          sent_date,
          processor: processor ?? null,
          transport_id: transport_id ?? null,
          live_weight_lb: live_weight_lb ?? null,
          notes: notes ?? null,
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "updateProcessing") {
      const { id, tenant_id, patch } = body as { id: number; tenant_id: string; patch: Record<string, any> };
      if (!id || !tenant_id) return NextResponse.json({ ok: false, error: "id and tenant_id required" }, { status: 400 });
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

    /* -------------------- PHOTOS (DB rows) -------------------- */

    if (action === "addAnimalPhoto") {
      const tenant_id = typeof body?.tenant_id === "string" ? body.tenant_id : null;
      const animal_id = Number.isFinite(Number(body?.animal_id)) ? Number(body.animal_id) : null;
      const tag       = typeof body?.tag === "string" ? body.tag : null;
      const photo_url = typeof body?.photo_url === "string" ? body.photo_url : null;
      const photo_path = typeof body?.photo_path === "string" ? body.photo_path : null;
      const set_primary = !!body?.set_primary;

      if (!tenant_id || animal_id == null || !tag || !photo_url || !photo_path) {
        return NextResponse.json({ ok: false, error: "tenant_id, animal_id, tag, photo_url, photo_path required" }, { status: 400 });
      }

      // verify animal belongs to tenant
      const { data: animal, error: aerr } = await supa
        .from("agriops_cattle").select("id").eq("tenant_id", tenant_id).eq("id", animal_id).maybeSingle();
      if (aerr) throw aerr;
      if (!animal) return NextResponse.json({ ok: false, error: "Animal not found for tenant" }, { status: 400 });

      const { data: row, error } = await supa
        .from("agriops_cattle_photos")
        .insert({ tenant_id, animal_id, tag, photo_url, photo_path, is_primary: false })
        .select()
        .maybeSingle();
      if (error) throw error;

      if (set_primary && row?.id) {
        await supa.from("agriops_cattle_photos")
          .update({ is_primary: false })
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id);
        await supa.from("agriops_cattle_photos")
          .update({ is_primary: true })
          .eq("tenant_id", tenant_id)
          .eq("id", row.id);
        await supa.from("agriops_cattle")
          .update({ primary_photo_url: photo_url })
          .eq("tenant_id", tenant_id)
          .eq("id", animal_id);
      }

      return NextResponse.json({ ok: true, data: row });
    }

    if (action === "setPrimaryPhoto") {
      const { tenant_id, animal_id, id } = body as { tenant_id: string; animal_id: number; id: number };
      const { data: photo, error: perr } = await supa
        .from("agriops_cattle_photos")
        .select("photo_url")
        .eq("tenant_id", tenant_id)
        .eq("id", id)
        .maybeSingle();
      if (perr) throw perr;
      if (!photo) return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });

      await supa.from("agriops_cattle_photos")
        .update({ is_primary: false })
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id);
      await supa.from("agriops_cattle_photos")
        .update({ is_primary: true })
        .eq("tenant_id", tenant_id)
        .eq("id", id);

      await supa.from("agriops_cattle")
        .update({ primary_photo_url: photo.photo_url })
        .eq("tenant_id", tenant_id)
        .eq("id", animal_id);

      return NextResponse.json({ ok: true, data: { id } });
    }

    if (action === "deleteAnimalPhoto") {
      const { tenant_id, animal_id, id, photo_path } = body as {
        tenant_id: string; animal_id: number; id: number; photo_path?: string;
      };

      // Delete DB row
      const { error } = await supa
        .from("agriops_cattle_photos")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("animal_id", animal_id)
        .eq("id", id);
      if (error) throw error;

      // Optional: also delete from storage via admin API (service role can do it)
      if (photo_path) {
        // Note: supra storage remove via JS admin is not in supabase-js; keep file or switch to signed URL deletion if needed.
        // You can also leave files orphaned and run a cleanup later.
      }

      return NextResponse.json({ ok: true, data: { deleted: id } });
    }

    if (action === "reorderAnimalPhotos") {
      const { tenant_id, animal_id, ordered_ids } = body as { tenant_id: string; animal_id: number; ordered_ids: number[] };
      if (!tenant_id || !animal_id || !Array.isArray(ordered_ids)) {
        return NextResponse.json({ ok: false, error: "tenant_id, animal_id, ordered_ids required" }, { status: 400 });
      }
      // Simple: assign sort_order = index (1-based)
      for (let i = 0; i < ordered_ids.length; i++) {
        await supa
          .from("agriops_cattle_photos")
          .update({ sort_order: i + 1 })
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .eq("id", ordered_ids[i]);
      }
      return NextResponse.json({ ok: true, data: { updated: ordered_ids.length } });
    }

    /* -------------------- BULK IMPORT -------------------- */

    if (action === "bulkUpsertAnimals") {
      const { rows } = body as { rows: Array<Record<string, any>> };
      if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ ok: false, error: "rows must be a non-empty array" }, { status: 400 });
      }
      const { error } = await supa.from("agriops_cattle").upsert(rows as any[]);
      if (error) throw error;
      return NextResponse.json({ ok: true, data: { imported: rows.length } });
    }

    /* -------------------- FALLBACK -------------------- */
    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error("[/api/cattle] error", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

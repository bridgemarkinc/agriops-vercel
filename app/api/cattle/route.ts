import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // keep Node (Edge won't see server-only envs)

/** Create Supabase with SERVICE ROLE (server-only; bypasses RLS) */
function getSupabaseService() {
  // ✅ Prefer server var; fall back to public for compatibility
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const service = process.env.SUPABASE_SERVICE_ROLE || "";

  if (!url) {
    throw new Error("Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  }
  if (!service) {
    throw new Error("Missing env: SUPABASE_SERVICE_ROLE");
  }

  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Safe JSON body
async function readJson(req: Request) {
  try { return await req.json(); } catch { return null; }
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true });
}

// … keep the rest of your POST handler the same …


export async function POST(req: Request) {
  const supa = getSupabaseService(); // <- one service-role client for all actions
  try {
    const body = await readJson(req);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const action = String(body.action || "");
    if (!action) {
      return NextResponse.json({ ok: false, error: "Missing 'action'" }, { status: 400 });
    }

    switch (action) {
      /** ─────────────────── Animals ─────────────────── */

      // Create new animal
      case "upsertAnimal": {
        const p = body.payload ?? {};
        if (!p?.tenant_id || !p?.tag) {
          return NextResponse.json(
            { ok: false, error: "payload.tenant_id and payload.tag are required" },
            { status: 400 }
          );
        }

        const { data, error } = await supa
          .from("agriops_cattle")
          .upsert(
            {
              tenant_id: p.tenant_id,
              tag: String(p.tag).trim(),
              name: p.name ?? null,
              sex: p.sex ?? null,
              breed: p.breed ?? null,
              birth_date: p.birth_date ?? null,
              current_paddock: p.current_paddock ?? null,
              status: p.status ?? "active",
            } as any
          )
          .select()
          .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      // Update existing animal (by id)
      case "updateAnimal": {
        const id = Number(body?.id);
        const tenant_id = String(body?.tenant_id || "");
        const patch = body?.patch ?? {};
        if (!id || !tenant_id) {
          return NextResponse.json(
            { ok: false, error: "id and tenant_id are required" },
            { status: 400 }
          );
        }
        const { error } = await supa
          .from("agriops_cattle")
          .update({
            name: patch.name ?? null,
            sex: patch.sex ?? null,
            breed: patch.breed ?? null,
            birth_date: patch.birth_date ?? null,
            current_paddock: patch.current_paddock ?? null,
            status: patch.status ?? null,
          })
          .eq("tenant_id", tenant_id)
          .eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { updated: id } });
      }

      /** ───────────────── Weights & Treatments ───────────── */

      case "addWeight": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const weigh_date = String(body?.weigh_date || "");
        const weight_lb = Number(body?.weight_lb || 0);
        const notes = body?.notes ?? null;
        if (!tenant_id || !animal_id || !weigh_date || !weight_lb) {
          return NextResponse.json(
            { ok: false, error: "tenant_id, animal_id, weigh_date, weight_lb are required" },
            { status: 400 }
          );
        }
        const { error } = await supa
          .from("agriops_cattle_weights")
          .insert({ tenant_id, animal_id, weigh_date, weight_lb, notes });
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { inserted: true } });
      }

      case "addTreatment": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const treat_date = String(body?.treat_date || "");
        const product = body?.product ?? null;
        const dose = body?.dose ?? null;
        const notes = body?.notes ?? null;
        if (!tenant_id || !animal_id || !treat_date) {
          return NextResponse.json(
            { ok: false, error: "tenant_id, animal_id, treat_date are required" },
            { status: 400 }
          );
        }
        const { error } = await supa
          .from("agriops_cattle_treatments")
          .insert({ tenant_id, animal_id, treat_date, product, dose, notes });
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { inserted: true } });
      }

      /** ───────────────── Processing (examples) ──────────── */

      case "listProcessing": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        if (!tenant_id || !animal_id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and animal_id are required" },
            { status: 400 }
          );
        }
        const { data, error } = await supa
          .from("agriops_processing")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .order("sent_date", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "sendToProcessing": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const tag = String(body?.tag || "");
        const sent_date = String(body?.sent_date || "");
        const processor = body?.processor ?? null;
        const transport_id = body?.transport_id ?? null;
        const live_weight_lb = body?.live_weight_lb ?? null;
        const notes = body?.notes ?? null;
        if (!tenant_id || !animal_id || !tag || !sent_date) {
          return NextResponse.json(
            { ok: false, error: "tenant_id, animal_id, tag, sent_date are required" },
            { status: 400 }
          );
        }
        const { error } = await supa
          .from("agriops_processing")
          .insert({
            tenant_id,
            animal_id,
            tag,
            status: "scheduled",
            sent_date,
            processor,
            transport_id,
            live_weight_lb,
            notes,
          });
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { inserted: true } });
      }

      case "updateProcessing": {
        const id = Number(body?.id);
        const tenant_id = String(body?.tenant_id || "");
        const patch = body?.patch ?? {};
        if (!tenant_id || !id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and id are required" },
            { status: 400 }
          );
        }
        const { error } = await supa
          .from("agriops_processing")
          .update({
            status: patch.status ?? undefined,
            processor: patch.processor ?? undefined,
            live_weight_lb: patch.live_weight_lb ?? undefined,
            hot_carcass_weight_lb: patch.hot_carcass_weight_lb ?? undefined,
            carcass_weight_lb: patch.carcass_weight_lb ?? undefined,
            grade: patch.grade ?? undefined,
            yield_pct: patch.yield_pct ?? undefined,
            lot_code: patch.lot_code ?? undefined,
            cut_sheet_url: patch.cut_sheet_url ?? undefined,
            invoice_url: patch.invoice_url ?? undefined,
            notes: patch.notes ?? undefined,
          })
          .eq("tenant_id", tenant_id)
          .eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { updated: id } });
      }

      /** ─────────────── Photos (DB rows) ─────────────── */

      case "addAnimalPhoto": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const tag = String(body?.tag || "");
        const photo_url = String(body?.photo_url || "");
        const photo_path = String(body?.photo_path || "");
        const set_primary = !!body?.set_primary;

        if (!tenant_id || !animal_id || !tag || !photo_url || !photo_path) {
          return NextResponse.json(
            { ok: false, error: "tenant_id, animal_id, tag, photo_url, photo_path are required" },
            { status: 400 }
          );
        }

        // Verify the animal belongs to this tenant (helps catch bad tenant_id)
        const { data: animal, error: aerr } = await supa
          .from("agriops_cattle")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("id", animal_id)
          .maybeSingle();
        if (aerr) throw aerr;
        if (!animal) {
          return NextResponse.json({ ok: false, error: "Animal not found for tenant" }, { status: 400 });
        }

        const { data: row, error } = await supa
          .from("agriops_cattle_photos")
          .insert({ tenant_id, animal_id, tag, photo_url, photo_path, is_primary: false })
          .select()
          .maybeSingle();
        if (error) throw error;

        if (set_primary && row?.id) {
          await supa
            .from("agriops_cattle_photos")
            .update({ is_primary: false })
            .eq("tenant_id", tenant_id)
            .eq("animal_id", animal_id);
          await supa
            .from("agriops_cattle_photos")
            .update({ is_primary: true })
            .eq("tenant_id", tenant_id)
            .eq("id", row.id);
          await supa
            .from("agriops_cattle")
            .update({ primary_photo_url: photo_url })
            .eq("tenant_id", tenant_id)
            .eq("id", animal_id);
        }

        return NextResponse.json({ ok: true, data: row });
      }

      case "setPrimaryPhoto": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const id = Number(body?.id);
        if (!tenant_id || !animal_id || !id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id, animal_id, id are required" },
            { status: 400 }
          );
        }
        // Get URL
        const { data: photo, error: perr } = await supa
          .from("agriops_cattle_photos")
          .select("photo_url")
          .eq("tenant_id", tenant_id)
          .eq("id", id)
          .maybeSingle();
        if (perr) throw perr;
        if (!photo?.photo_url) {
          return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });
        }
        await supa
          .from("agriops_cattle_photos")
          .update({ is_primary: false })
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id);
        await supa
          .from("agriops_cattle_photos")
          .update({ is_primary: true })
          .eq("tenant_id", tenant_id)
          .eq("id", id);
        await supa
          .from("agriops_cattle")
          .update({ primary_photo_url: photo.photo_url })
          .eq("tenant_id", tenant_id)
          .eq("id", animal_id);
        return NextResponse.json({ ok: true, data: { primary_id: id } });
      }

      case "deleteAnimalPhoto": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const id = Number(body?.id);
        // photo_path is optional here; you can also delete from storage client-side
        if (!tenant_id || !animal_id || !id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id, animal_id, id are required" },
            { status: 400 }
          );
        }
        const { error } = await supa
          .from("agriops_cattle_photos")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { deleted: id } });
      }

      // Optional: reorder
      case "reorderAnimalPhotos": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const ordered_ids: number[] = Array.isArray(body?.ordered_ids) ? body.ordered_ids : [];
        if (!tenant_id || !animal_id || !ordered_ids.length) {
          return NextResponse.json(
            { ok: false, error: "tenant_id, animal_id, ordered_ids[] are required" },
            { status: 400 }
          );
        }
        // Store sort_order (optional table column)
        for (let i = 0; i < ordered_ids.length; i++) {
          await supa
            .from("agriops_cattle_photos")
            .update({ sort_order: i })
            .eq("tenant_id", tenant_id)
            .eq("animal_id", animal_id)
            .eq("id", ordered_ids[i]);
        }
        return NextResponse.json({ ok: true, data: { reordered: ordered_ids.length } });
      }

      /** ─────────────── Bulk import ─────────────── */

      case "bulkUpsertAnimals": {
        const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
        if (!rows.length) {
          return NextResponse.json({ ok: false, error: "rows[] required" }, { status: 400 });
        }
        const { error } = await supa.from("agriops_cattle").upsert(rows as any[]);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { imported: rows.length } });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    // Log full error server-side; client gets clean text
    console.error("[/api/cattle] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

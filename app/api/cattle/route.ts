// app/api/cattle/route.ts
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic"; // always run on server
export const runtime = "nodejs";

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
      case "listAnimalPhotos": {
        const { tenant_id, animal_id } = body;
        const { data, error } = await supabase
          .from("agriops_animal_photos")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true });
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "addAnimalPhoto": {
        const { tenant_id, animal_id, tag, photo_url, photo_path, set_primary } =
          body;
        // insert photo
        const { data: ins, error: insErr } = await supabase
          .from("agriops_animal_photos")
          .insert({
            tenant_id,
            animal_id,
            tag,
            photo_url,
            photo_path,
            is_primary: false,
          })
          .select("*")
          .maybeSingle();
        if (insErr) throw insErr;

        // optionally set primary
        if (set_primary && ins?.id) {
          // Clear existing primary
          await supabase
            .from("agriops_animal_photos")
            .update({ is_primary: false })
            .eq("tenant_id", tenant_id)
            .eq("animal_id", animal_id);

          await supabase
            .from("agriops_animal_photos")
            .update({ is_primary: true })
            .eq("tenant_id", tenant_id)
            .eq("id", ins.id);

          // reflect on animal record
          await supabase
            .from("agriops_cattle")
            .update({ primary_photo_url: photo_url })
            .eq("tenant_id", tenant_id)
            .eq("id", animal_id);
        }
        return NextResponse.json({ ok: true, data: ins });
      }

      case "setPrimaryPhoto": {
        const { tenant_id, animal_id, id } = body;

        // get url for chosen photo
        const { data: ph, error: phErr } = await supabase
          .from("agriops_animal_photos")
          .select("photo_url")
          .eq("tenant_id", tenant_id)
          .eq("id", id)
          .maybeSingle();
        if (phErr) throw phErr;

        // clear and set
        await supabase
          .from("agriops_animal_photos")
          .update({ is_primary: false })
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id);

        const { error: setErr } = await supabase
          .from("agriops_animal_photos")
          .update({ is_primary: true })
          .eq("tenant_id", tenant_id)
          .eq("id", id);
        if (setErr) throw setErr;

        // mirror on cattle
        const { error: updErr } = await supabase
          .from("agriops_cattle")
          .update({ primary_photo_url: ph?.photo_url ?? null })
          .eq("tenant_id", tenant_id)
          .eq("id", animal_id);
        if (updErr) throw updErr;

        return NextResponse.json({ ok: true, data: true });
      }

      case "deleteAnimalPhoto": {
        const { tenant_id, animal_id, id, photo_path } = body;

        // delete row
        const { data: deleted, error } = await supabase
          .from("agriops_animal_photos")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("id", id)
          .select("*")
          .maybeSingle();
        if (error) throw error;

        // try to delete the storage object (ignore failures)
        try {
          await supabase.storage.from("cattle-photos").remove([photo_path]);
        } catch {
          /* ignore */
        }

        // if it was primary, clear animal.primary_photo_url
        if (deleted?.is_primary) {
          await supabase
            .from("agriops_cattle")
            .update({ primary_photo_url: null })
            .eq("tenant_id", tenant_id)
            .eq("id", animal_id);
        }
        return NextResponse.json({ ok: true, data: true });
      }

      case "reorderAnimalPhotos": {
        const { tenant_id, animal_id, ordered_ids } = body as unknown as {
  tenant_id: string;
  animal_id: number;
  ordered_ids: number[];
};
        if (!Array.isArray(ordered_ids)) {
          return NextResponse.json({
            ok: false,
            error: "ordered_ids must be an array",
          });
        }
        // Set sort_order = index for each id (simple loop)
        for (let i = 0; i < ordered_ids.length; i++) {
          const id = ordered_ids[i];
          await supabase
            .from("agriops_animal_photos")
            .update({ sort_order: i })
            .eq("tenant_id", tenant_id)
            .eq("animal_id", animal_id)
            .eq("id", id);
        }
        return NextResponse.json({ ok: true, data: true });
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

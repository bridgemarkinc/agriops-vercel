// app/api/cattle/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Json = Record<string, any> | null;

// ---- Supabase (service role) ----
function getSupabase() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const service = process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url) throw new Error("Missing env: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("Missing env: SUPABASE_SERVICE_ROLE");
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

const BUCKET = process.env.CATTLE_PHOTO_BUCKET || "cattle-photos";

// ---- small helpers ----
async function readJson(req: Request): Promise<Json> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const supa = getSupabase();

  try {
    const body = await readJson(req);
    if (!body) return bad(400, "Invalid JSON body");

    const action = String(body.action || "");
    if (!action) return bad(400, "Missing 'action'");

    switch (action) {
      // ─────────────────────────────────────────────
      // Animals
      // ─────────────────────────────────────────────
      case "listAnimals": {
        const tenant_id = String(body?.tenant_id || "");
        const search = (body?.search || "").trim();
        if (!tenant_id) return bad(400, "tenant_id required");

        let q = supa.from("agriops_cattle").select("*").eq("tenant_id", tenant_id).order("tag");
        if (search) q = q.ilike("tag", `%${search}%`);
        const { data, error } = await q;
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "upsertAnimal": {
        const p = body?.payload || {};
        if (!p?.tenant_id || !p?.tag) return bad(400, "payload.tenant_id and payload.tag are required");
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

      case "updateAnimal": {
        const id = Number(body?.id);
        const tenant_id = String(body?.tenant_id || "");
        const patch = body?.patch || {};
        if (!tenant_id || !id) return bad(400, "tenant_id and id are required");
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

      // ─────────────────────────────────────────────
      // Weights & Treatments
      // ─────────────────────────────────────────────
      case "listWeights": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        if (!tenant_id || !animal_id) return bad(400, "tenant_id and animal_id required");
        const { data, error } = await supa
          .from("agriops_cattle_weights")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .order("weigh_date", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "addWeight": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const weigh_date = String(body?.weigh_date || "");
        const weight_lb = Number(body?.weight_lb || 0);
        const notes = body?.notes ?? null;
        if (!tenant_id || !animal_id || !weigh_date || !weight_lb)
          return bad(400, "tenant_id, animal_id, weigh_date, weight_lb required");
        const { error } = await supa
          .from("agriops_cattle_weights")
          .insert({ tenant_id, animal_id, weigh_date, weight_lb, notes });
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { inserted: true } });
      }

      case "listTreatments": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        if (!tenant_id || !animal_id) return bad(400, "tenant_id and animal_id required");
        const { data, error } = await supa
          .from("agriops_cattle_treatments")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .order("treat_date", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "addTreatment": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const treat_date = String(body?.treat_date || "");
        const product = body?.product ?? null;
        const dose = body?.dose ?? null;
        const notes = body?.notes ?? null;
        if (!tenant_id || !animal_id || !treat_date)
          return bad(400, "tenant_id, animal_id, treat_date required");
        const { error } = await supa
          .from("agriops_cattle_treatments")
          .insert({ tenant_id, animal_id, treat_date, product, dose, notes });
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { inserted: true } });
      }

      // ─────────────────────────────────────────────
      // Processing
      // ─────────────────────────────────────────────
      case "listProcessing": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        if (!tenant_id || !animal_id) return bad(400, "tenant_id and animal_id required");
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
        if (!tenant_id || !animal_id || !tag || !sent_date)
          return bad(400, "tenant_id, animal_id, tag, sent_date required");

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
        const patch = body?.patch || {};
        if (!tenant_id || !id) return bad(400, "tenant_id and id required");
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

      // ─────────────────────────────────────────────
      // Photos (DB + signed upload)
      // ─────────────────────────────────────────────
      case "listAnimalPhotos": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        if (!tenant_id || !animal_id) return bad(400, "tenant_id and animal_id required");
        const { data, error } = await supa
          .from("agriops_cattle_photos")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false });
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      // client asks server for a signed PUT URL
      case "requestUploadUrl": {
        const tenant_id = String(body?.tenant_id || "");
        const tag = (String(body?.tag || "") || "untagged").replace(/[^a-z0-9_-]/gi, "_");
        const ext = (String(body?.ext || "jpg").toLowerCase() || "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
        const content_type = String(body?.content_type || "image/jpeg");
        if (!tenant_id) return bad(400, "tenant_id required");

        const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const path = `${tenant_id}/${tag}/${filename}`;

        // Create a signed upload URL (Supabase Storage)
        const { data: signed, error: sErr } = await supa.storage
          .from(BUCKET)
          .createSignedUploadUrl(path);
        if (sErr) throw sErr;

        // Public URL if bucket is public; otherwise create a long-ish signed GET
        const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(path);
        let public_url = pub?.publicUrl || "";

        if (!public_url) {
          const { data: g, error: gErr } = await supa.storage
            .from(BUCKET)
            .createSignedUrl(path, 60 * 60 * 24 * 30); // 30 days
          if (gErr) throw gErr;
          public_url = g?.signedUrl || "";
        }

        // Return PUT signed url (signed.signedUrl)
        return NextResponse.json({
          ok: true,
          data: {
            path,
            upload_url: signed.signedUrl, // client PUTs the file body with Content-Type
            public_url,
          },
        });
      }

      case "addAnimalPhoto": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const tag = String(body?.tag || "");
        const photo_url = String(body?.photo_url || "");
        const photo_path = String(body?.photo_path || "");
        const set_primary = !!body?.set_primary;

        if (!tenant_id || !animal_id || !tag || !photo_url || !photo_path)
          return bad(400, "tenant_id, animal_id, tag, photo_url, photo_path required");

        // verify animal belongs to this tenant
        const { data: animal, error: aErr } = await supa
          .from("agriops_cattle")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("id", animal_id)
          .maybeSingle();
        if (aErr) throw aErr;
        if (!animal) return bad(400, "Animal not found for tenant");

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
        if (!tenant_id || !animal_id || !id) return bad(400, "tenant_id, animal_id, id required");

        const { data: photo, error: pErr } = await supa
          .from("agriops_cattle_photos")
          .select("photo_url")
          .eq("tenant_id", tenant_id)
          .eq("id", id)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!photo?.photo_url) return bad(404, "Photo not found");

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
        const photo_path = String(body?.photo_path || "");
        if (!tenant_id || !animal_id || !id) return bad(400, "tenant_id, animal_id, id required");

        const { error } = await supa
          .from("agriops_cattle_photos")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("animal_id", animal_id)
          .eq("id", id);
        if (error) throw error;

        // Best-effort delete from storage (optional)
        if (photo_path) {
          await supa.storage.from(BUCKET).remove([photo_path]).catch(() => {});
        }

        return NextResponse.json({ ok: true, data: { deleted: id } });
      }

      case "reorderAnimalPhotos": {
        const tenant_id = String(body?.tenant_id || "");
        const animal_id = Number(body?.animal_id);
        const ordered_ids: number[] = Array.isArray(body?.ordered_ids) ? body.ordered_ids : [];
        if (!tenant_id || !animal_id || !ordered_ids.length)
          return bad(400, "tenant_id, animal_id, ordered_ids[] required");

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

      // ─────────────────────────────────────────────
      // Bulk import
      // ─────────────────────────────────────────────
      case "bulkUpsertAnimals": {
        const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];
        if (!rows.length) return bad(400, "rows[] required");
        const { error } = await supa.from("agriops_cattle").upsert(rows as any[]);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { imported: rows.length } });
      }

      default:
        return bad(400, `Unknown action: ${action}`);
    }
  } catch (err: any) {
    console.error("[/api/cattle] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

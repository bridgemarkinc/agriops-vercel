import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Service-role Supabase (server only) */
function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE!;
  if (!url || !service) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE");
  }
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Safe JSON
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
    if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

    const action = String(body.action || "");
    if (!action) return NextResponse.json({ ok: false, error: "Missing 'action'" }, { status: 400 });

    switch (action) {
      /** ─────────────── Paddocks ─────────────── */
      case "listWithCounts": {
        const tenant_id = String(body?.tenant_id || "");
        if (!tenant_id) return NextResponse.json({ ok: false, error: "tenant_id is required" }, { status: 400 });

        const { data, error } = await supa
          .from("agriops_paddocks")
          .select("*")
          .eq("tenant_id", tenant_id)
          .order("name");
        if (error) throw error;

        const rows = (data || []).map((p: any) => ({ ...p, head_count: p.head_count ?? 0 }));
        return NextResponse.json({ ok: true, data: rows });
      }

      case "upsertPaddock": {
        const tenant_id = String(body?.tenant_id || "");
        const row: any = body?.row || {};
        if (!tenant_id || !row?.name) {
          return NextResponse.json({ ok: false, error: "tenant_id and row.name are required" }, { status: 400 });
        }
        const payload = {
          id: row.id ?? undefined,
          tenant_id,
          name: String(row.name),
          acres: row.acres != null ? Number(row.acres) : null,
          forage_dm_lb_ac: row.forage_dm_lb_ac != null ? Number(row.forage_dm_lb_ac) : null,
          util_pct: row.util_pct != null ? Number(row.util_pct) : null,
          rest_days: row.rest_days != null ? Number(row.rest_days) : null,
          zone: row.zone ?? null,
          notes: row.notes ?? null,
        };
        const { data, error } = await supa.from("agriops_paddocks").upsert(payload as any).select().maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "deletePaddock": {
        const tenant_id = String(body?.tenant_id || "");
        const id = Number(body?.id);
        if (!tenant_id || !id) return NextResponse.json({ ok: false, error: "tenant_id and id are required" }, { status: 400 });
        const { error } = await supa.from("agriops_paddocks").delete().eq("tenant_id", tenant_id).eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { deleted: id } });
      }

      /** ─────────────── Seeding ─────────────── */
      case "listSeeding": {
        const tenant_id = String(body?.tenant_id || "");
        const paddock_id = Number(body?.paddock_id);
        if (!tenant_id || !paddock_id) {
          return NextResponse.json({ ok: false, error: "tenant_id and paddock_id are required" }, { status: 400 });
        }
        const { data, error } = await supa
          .from("agriops_paddock_seeding")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("paddock_id", paddock_id)
          .order("id");
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "upsertSeeding": {
        const tenant_id = String(body?.tenant_id || "");
        const payload: any = body?.payload || {};
        if (!tenant_id || !payload?.paddock_id) {
          return NextResponse.json({ ok: false, error: "tenant_id and payload.paddock_id are required" }, { status: 400 });
        }

        const items: any[] = Array.isArray(payload.mix_items) ? payload.mix_items : [];
        const cleanItems = items
          .map((i: any) => ({
            species: String(i?.species ?? "").trim(),
            rate_lb_ac: Number(i?.rate_lb_ac ?? 0),
          }))
          .filter((i: { species: string }) => i.species !== "");

        const row = {
          tenant_id,
          paddock_id: Number(payload.paddock_id),
          date_planted: payload.date_planted || null,
          mix_name: payload.mix_name || null,
          mix_items: cleanItems, // JSONB NOT NULL
          notes: payload.notes || null,
        };

        const { data, error } = await supa
          .from("agriops_paddock_seeding")
          .upsert(row as any)
          .select()
          .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "deleteSeeding": {
        const tenant_id = String(body?.tenant_id || "");
        const id = Number(body?.id);
        if (!tenant_id || !id) return NextResponse.json({ ok: false, error: "tenant_id and id are required" }, { status: 400 });
        const { error } = await supa.from("agriops_paddock_seeding").delete().eq("tenant_id", tenant_id).eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { deleted: id } });
      }

      /** ─────────────── Amendments ─────────────── */
      case "listAmendments": {
        const tenant_id = String(body?.tenant_id || "");
        const paddock_id = Number(body?.paddock_id);
        if (!tenant_id || !paddock_id) {
          return NextResponse.json({ ok: false, error: "tenant_id and paddock_id are required" }, { status: 400 });
        }
        const { data, error } = await supa
          .from("agriops_paddock_amendments")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("paddock_id", paddock_id)
          .order("id");
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "upsertAmendment": {
        const tenant_id = String(body?.tenant_id || "");
        const payload: any = body?.payload || {};
        if (!tenant_id || !payload?.paddock_id || !payload?.product) {
          return NextResponse.json({ ok: false, error: "tenant_id, payload.paddock_id, product are required" }, { status: 400 });
        }
        const row = {
          tenant_id,
          paddock_id: Number(payload.paddock_id),
          date_applied: payload.date_applied || null,
          product: String(payload.product),
          rate: payload.rate || null,
          notes: payload.notes || null,
        };
        const { data, error } = await supa
          .from("agriops_paddock_amendments")
          .upsert(row as any)
          .select()
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "deleteAmendment": {
        const tenant_id = String(body?.tenant_id || "");
        const id = Number(body?.id);
        if (!tenant_id || !id) return NextResponse.json({ ok: false, error: "tenant_id and id are required" }, { status: 400 });
        const { error } = await supa.from("agriops_paddock_amendments").delete().eq("tenant_id", tenant_id).eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { deleted: id } });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[/api/paddocks] error", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

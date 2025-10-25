import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // ensure server envs are available

/** SERVER-ONLY Supabase with SERVICE ROLE (bypasses RLS). */
function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !service) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE");
  }
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Safe JSON read (never throws)
async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
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
      /** ─────────────────── Paddocks ─────────────────── */

      // Basic list from the base table (used by Grazing Planner)
      case "list": {
        const tenant_id = String(body?.tenant_id || "");
        if (!tenant_id) {
          return NextResponse.json({ ok: false, error: "tenant_id is required" }, { status: 400 });
        }

        const { data, error } = await supa
          .from("agriops_paddocks")
          .select(
            "id, tenant_id, name, acres, forage_dm_lb_ac, util_pct, rest_days, zone, notes, created_at, inserted_at, updated_at"
          )
          .eq("tenant_id", tenant_id)
          .order("name", { ascending: true });

        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      // Keep compatibility with Pasture Maintenance if you use the *view*
      case "listWithCounts": {
        const tenant_id = String(body?.tenant_id || "");
        if (!tenant_id) {
          return NextResponse.json({ ok: false, error: "tenant_id is required" }, { status: 400 });
        }

        // If you *don't* have this view, you can point this to agriops_paddocks (above).
        const { data, error } = await supa
          .from("agriops_paddocks_with_counts")
          .select("*")
          .eq("tenant_id", tenant_id)
          .order("name", { ascending: true });

        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      // Upsert a single paddock (insert or update by id)
      case "upsertPaddock": {
        const tenant_id = String(body?.tenant_id || "");
        const row = body?.row || {};
        if (!tenant_id || !row?.name) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and row.name are required" },
            { status: 400 }
          );
        }

        const payload = {
          id: row.id ?? undefined, // allow undefined for inserts
          tenant_id,
          name: String(row.name).trim(),
          acres: row.acres ?? null,
          forage_dm_lb_ac: row.forage_dm_lb_ac ?? null,
          util_pct: row.util_pct ?? null,
          rest_days: row.rest_days ?? null,
          zone: row.zone ?? null,
          notes: row.notes ?? null,
        };

        const { data, error } = await supa
          .from("agriops_paddocks")
          .upsert(payload as any)
          .select()
          .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      // Bulk upsert (used by Grazing Planner "Save")
      case "upsertMany": {
        const tenant_id = String(body?.tenant_id || "");
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        if (!tenant_id || rows.length === 0) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and non-empty rows[] are required" },
            { status: 400 }
          );
        }

        const payload = rows.map((r: any) => ({
          id: r.id ?? undefined,
          tenant_id,
          name: String(r.name || "").trim(),
          acres: r.acres ?? null,
          forage_dm_lb_ac: r.forage_dm_lb_ac ?? null,
          util_pct: r.util_pct ?? null,
          rest_days: r.rest_days ?? null,
          zone: r.zone ?? null,
          notes: r.notes ?? null,
        }));

        const { error } = await supa.from("agriops_paddocks").upsert(payload as any[]);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { upserted: payload.length } });
      }

      // Delete by id
      case "deletePaddock": {
        const tenant_id = String(body?.tenant_id || "");
        const id = Number(body?.id);
        if (!tenant_id || !id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and id are required" },
            { status: 400 }
          );
        }

        const { error } = await supa
          .from("agriops_paddocks")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("id", id);

        if (error) throw error;
        return NextResponse.json({ ok: true, data: { deleted: id } });
      }

      default:
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[/api/paddocks] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

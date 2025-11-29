// app/api/paddocks/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ───────────────── Supabase (server) ───────────────── */
function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE!;
  if (!url || !service) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE");
  }
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* ───────────────── Helpers ───────────────── */
async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true });
}

/* ───────────────── Route ───────────────── */
export async function POST(req: Request) {
  const supa = getSupabaseService();

  try {
    const body = await readJson(req);
    if (!body) return bad("Invalid JSON body");
    const action = String(body.action || "");
    if (!action) return bad("Missing 'action'");

    /* ───────────── Paddocks: lists ───────────── */
    if (action === "listForPlanner") {
      const { tenant_id } = body as { tenant_id?: string };
      if (!tenant_id) return bad("tenant_id is required");
      const { data, error } = await supa
        .from("agriops_paddocks")
        .select("id,tenant_id,name,acres,forage_dm_lb_ac,util_pct,rest_days,zone,notes")
        .eq("tenant_id", tenant_id)
        .order("name");
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "list") {
      const tenant_id = String(body?.tenant_id || "");
      if (!tenant_id) return bad("tenant_id is required");
      const { data, error } = await supa
        .from("agriops_paddocks")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("name");
      if (error) throw error;
      return NextResponse.json({ ok: true, data: data || [] });
    }

    if (action === "listWithCounts") {
      const { tenant_id } = body as { tenant_id?: string };
      if (!tenant_id) return bad("tenant_id is required");

      const { data: paddocks, error: pErr } = await supa
        .from("agriops_paddocks")
        .select("id,tenant_id,name,acres,forage_dm_lb_ac,util_pct,rest_days,zone,notes,created_at,updated_at")
        .eq("tenant_id", tenant_id)
        .order("name");
      if (pErr) throw pErr;
      if (!paddocks?.length) return NextResponse.json({ ok: true, data: [] });

      const ids = paddocks.map(p => p.id);

      const [seedRes, amendRes] = await Promise.all([
        supa.from("agriops_paddock_seeding").select("paddock_id").eq("tenant_id", tenant_id).in("paddock_id", ids),
        supa.from("agriops_paddock_amendments").select("paddock_id").eq("tenant_id", tenant_id).in("paddock_id", ids),
      ]);
      if (seedRes.error) throw seedRes.error;
      if (amendRes.error) throw amendRes.error;

      const seedMap = new Map<number, number>();
      (seedRes.data || []).forEach((r: any) => seedMap.set(r.paddock_id, (seedMap.get(r.paddock_id) || 0) + 1));
      const amendMap = new Map<number, number>();
      (amendRes.data || []).forEach((r: any) => amendMap.set(r.paddock_id, (amendMap.get(r.paddock_id) || 0) + 1));

      const data = paddocks.map(p => ({
        ...p,
        seeding_count: seedMap.get(p.id) ?? 0,
        amendment_count: amendMap.get(p.id) ?? 0,
      }));

      return NextResponse.json({ ok: true, data });
    }

    /* ───────────── Paddocks: upsert/delete ───────────── */
    if (action === "upsertPaddock") {
      const tenant_id = String(body?.tenant_id || "");
      const p = body?.payload ?? body?.row ?? {};
      if (!tenant_id || !p?.name) return bad("tenant_id and payload.name are required");

      const row = {
        id: p.id ?? undefined,
        tenant_id,
        name: String(p.name).trim(),
        acres: p.acres != null ? Number(p.acres) : 0,
        forage_dm_lb_ac: p.forage_dm_lb_ac != null ? Number(p.forage_dm_lb_ac) : 2400,
        util_pct: p.util_pct != null ? Number(p.util_pct) : 45,
        rest_days: p.rest_days != null ? Number(p.rest_days) : 30,
        zone: p.zone ?? null,
        notes: p.notes ?? null,
      };

      const { data, error } = await supa.from("agriops_paddocks").upsert(row as any).select().maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "deletePaddock") {
      const id = Number(body?.id);
      const tenant_id = String(body?.tenant_id || "");
      if (!tenant_id || !id) return bad("tenant_id and id are required");
      const { error } = await supa.from("agriops_paddocks").delete().eq("tenant_id", tenant_id).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, data: { deleted: id } });
    }

    /* ───────────── Bulk update core planner fields ───────────── */
    if (action === "bulkUpdatePlanner") {
      const { tenant_id, rows } = body as {
        tenant_id?: string;
        rows?: Array<{ id: number; acres?: number | null; forage_dm_lb_ac?: number | null; util_pct?: number | null; rest_days?: number | null }>;
      };
      if (!tenant_id || !Array.isArray(rows) || rows.length === 0) {
        return bad("tenant_id and rows[] are required");
      }

      for (const r of rows) {
        const { error } = await supa
          .from("agriops_paddocks")
          .update({
            acres: r.acres ?? undefined,
            forage_dm_lb_ac: r.forage_dm_lb_ac ?? undefined,
            util_pct: r.util_pct ?? undefined,
            rest_days: r.rest_days ?? undefined,
          })
          .eq("tenant_id", tenant_id)
          .eq("id", r.id);
        if (error) throw error;
      }
      return NextResponse.json({ ok: true, data: { updated: rows.length } });
    }

    /* ───────────── Seeding / Reseeding ───────────── */
    if (action === "listSeeding") {
      const tenant_id = String(body?.tenant_id || "");
      const paddock_id = Number(body?.paddock_id);
      if (!tenant_id) return bad("tenant_id is required");
      if (!paddock_id) return bad("paddock_id is required");

      const { data, error } = await supa
        .from("agriops_paddock_seeding")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("paddock_id", paddock_id)
        .order("date_planted", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, data: data || [] });
    }

    if (action === "upsertSeeding") {
      const tenant_id = String(body?.tenant_id || "");
      const p = body?.payload || {};
      const paddock_id = Number(p?.paddock_id);

      if (!tenant_id) return bad("tenant_id is required");
      if (!paddock_id) return bad("payload.paddock_id is required");

      // Normalize & validate mix_items
      const mix_items_raw = Array.isArray(p.mix_items) ? p.mix_items : [];
      const mix_items = mix_items_raw
        .map((i: any) => ({
          species: String(i?.species ?? "").trim(),
          rate_lb_ac: Number(i?.rate_lb_ac ?? 0),
        }))
        .filter((i: any) => i.species !== "");

      if (!mix_items.length) return bad("payload.mix_items must include at least one species");

      const row = {
        tenant_id,
        id: p.id ?? undefined,
        paddock_id,
        date_planted: p.date_planted || null,
        mix_name: (p.mix_name || "").trim() || null,
        mix_items, // JSONB, non-empty
        notes: (p.notes || "").trim() || null,
      };

      const { data, error } = await supa
        .from("agriops_paddock_seeding")
        .upsert(row as any)
        .select()
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "deleteSeeding") {
      const tenant_id = String(body?.tenant_id || "");
      const id = Number(body?.id);
      if (!tenant_id) return bad("tenant_id is required");
      if (!id) return bad("id is required");
      const { error } = await supa
        .from("agriops_paddock_seeding")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, data: { deleted: id } });
    }

    /* ───────────── Amendments ───────────── */
    if (action === "listAmendments") {
      const tenant_id = String(body?.tenant_id || "");
      const paddock_id = Number(body?.paddock_id);
      if (!tenant_id) return bad("tenant_id is required");
      if (!paddock_id) return bad("paddock_id is required");

      const { data, error } = await supa
        .from("agriops_paddock_amendments")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("paddock_id", paddock_id)
        .order("date_applied", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, data: data || [] });
    }

    if (action === "upsertAmendment") {
      const tenant_id = String(body?.tenant_id || "");
      const p = body?.payload || {};
      const paddock_id = Number(p?.paddock_id);
      if (!tenant_id) return bad("tenant_id is required");
      if (!paddock_id) return bad("payload.paddock_id is required");

      const row = {
        tenant_id,
        id: p.id ?? undefined,
        paddock_id,
        date_applied: p.date_applied || null,
        product: (p.product || "").trim(),
        rate: (p.rate || "").trim() || null,
        notes: (p.notes || "").trim() || null,
      };
      if (!row.product) return bad("payload.product is required");

      const { data, error } = await supa
        .from("agriops_paddock_amendments")
        .upsert(row as any)
        .select()
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (action === "deleteAmendment") {
      const tenant_id = String(body?.tenant_id || "");
      const id = Number(body?.id);
      if (!tenant_id) return bad("tenant_id is required");
      if (!id) return bad("id is required");
      const { error } = await supa
        .from("agriops_paddock_amendments")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, data: { deleted: id } });
    }

    /* ─────────── Unknown ─────────── */
    return bad(`Unknown action: ${action}`);
  } catch (err: any) {
    console.error("[/api/paddocks] error", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

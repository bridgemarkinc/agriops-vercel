// app/api/paddocks/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* Helpers */
function ok(data?: any) {
  return NextResponse.json({ ok: true, data });
}
function err(message = "Request failed", status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/* Supabase admin (service role) */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const tenant_id = String(body?.tenant_id || "");

    if (!tenant_id) return err("tenant_id is required");

    /* ───────────────── listWithCounts ─────────────────
       Returns paddocks and a head_count for each, where head_count is
       # of cattle with current_paddock == paddock.name and status is active-ish.
    */
    if (action === "listWithCounts") {
      // 1) Load paddocks
      const { data: paddocks, error: pErr } = await admin
        .from("agriops_paddocks")
        .select("id, tenant_id, name, acres, zone, notes")
        .eq("tenant_id", tenant_id)
        .order("name", { ascending: true });

      if (pErr) throw pErr;

      // 2) Build head counts by current_paddock (string match to name)
      const { data: herdCounts, error: hErr } = await admin
        .from("agriops_cattle")
        .select("current_paddock, status")
        .eq("tenant_id", tenant_id);

      if (hErr) throw hErr;

      const inactive = new Set(["sold", "culled", "dead", "processing"]);
      const map = new Map<string, number>();
      for (const row of herdCounts || []) {
        const paddockName = (row.current_paddock || "").trim();
        const status = (row.status || "").toLowerCase();
        if (!paddockName) continue;
        if (inactive.has(status)) continue;
        map.set(paddockName, (map.get(paddockName) || 0) + 1);
      }

      const joined = (paddocks || []).map((p) => ({
        ...p,
        head_count: map.get((p.name || "").trim()) || 0,
      }));

      return ok(joined);
    }

    /* ───────────────── listSeeding ───────────────── */
    if (action === "listSeeding") {
      const paddock_id = Number(body?.paddock_id || 0);
      if (!paddock_id) return err("paddock_id is required");

      const { data, error } = await admin
        .from("agriops_paddock_seeding")
        .select("id, tenant_id, paddock_id, date_planted, mix_name, mix_items, notes, created_at")
        .eq("tenant_id", tenant_id)
        .eq("paddock_id", paddock_id)
        .order("date_planted", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ok(data);
    }

    /* ───────────────── upsertSeeding ─────────────────
       For now: INSERT only (simple create). Pass payload:
       { paddock_id, date_planted, mix_name, mix_items(json), notes }
    */
    if (action === "upsertSeeding") {
      const payload = body?.payload || {};
      const paddock_id = Number(payload?.paddock_id || 0);
      if (!paddock_id) return err("payload.paddock_id is required");

      const insertRow = {
        tenant_id,
        paddock_id,
        date_planted: payload?.date_planted || null,
        mix_name: (payload?.mix_name || null) as string | null,
        // mix_items is expected to be an array like [{species, rate_lb_ac}]
        mix_items: payload?.mix_items ?? [],
        notes: (payload?.notes || null) as string | null,
      };

      const { data, error } = await admin
        .from("agriops_paddock_seeding")
        .insert(insertRow)
        .select("*")
        .single();

      if (error) throw error;
      return ok(data);
    }

    /* ───────────────── deleteSeeding ───────────────── */
    if (action === "deleteSeeding") {
      const id = Number(body?.id || 0);
      if (!id) return err("id is required");
      const { error } = await admin
        .from("agriops_paddock_seeding")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", id);
      if (error) throw error;
      return ok({ deleted: true });
    }

    /* ───────────────── listAmendments ───────────────── */
    if (action === "listAmendments") {
      const paddock_id = Number(body?.paddock_id || 0);
      if (!paddock_id) return err("paddock_id is required");

      const { data, error } = await admin
        .from("agriops_paddock_amendments")
        .select("id, tenant_id, paddock_id, date_applied, product, rate, notes, created_at")
        .eq("tenant_id", tenant_id)
        .eq("paddock_id", paddock_id)
        .order("date_applied", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ok(data);
    }

    /* ───────────────── upsertAmendment ─────────────────
       INSERT only. Pass payload:
       { paddock_id, date_applied, product, rate, notes }
    */
    if (action === "upsertAmendment") {
      const payload = body?.payload || {};
      const paddock_id = Number(payload?.paddock_id || 0);
      if (!paddock_id) return err("payload.paddock_id is required");
      const product = (payload?.product || "").trim();
      if (!product) return err("payload.product is required");

      const insertRow = {
        tenant_id,
        paddock_id,
        date_applied: payload?.date_applied || null,
        product,
        rate: (payload?.rate || null) as string | null,
        notes: (payload?.notes || null) as string | null,
      };

      const { data, error } = await admin
        .from("agriops_paddock_amendments")
        .insert(insertRow)
        .select("*")
        .single();

      if (error) throw error;
      return ok(data);
    }

    /* ───────────────── deleteAmendment ───────────────── */
    if (action === "deleteAmendment") {
      const id = Number(body?.id || 0);
      if (!id) return err("id is required");
      const { error } = await admin
        .from("agriops_paddock_amendments")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", id);
      if (error) throw error;
      return ok({ deleted: true });
    }

    return err(`Unknown action: ${action}`, 400);
  } catch (e: any) {
    console.error("API /api/paddocks error:", e?.message || e, e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error", details: e },
      { status: 500 }
    );
  }
}

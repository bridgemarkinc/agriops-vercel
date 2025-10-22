// app/api/paddocks/route.ts
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* ───────────────── Env / Supabase ───────────────── */
function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE!;
  if (!url || !service) {
    throw new Error(
      "Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE"
    );
  }
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ───────────────── Helpers ───────────────── */
function ok(data: any) {
  return NextResponse.json({ ok: true, data });
}
function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type Body = {
  action: string;
  tenant_id: string;
  // generic payloads:
  id?: number;
  row?: any;
  paddock_id?: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { action, tenant_id } = body || {};
    if (!action) return fail("Missing action");
    if (!tenant_id) return fail("Missing tenant_id");

    const sb = getSupabase();

    switch (action) {
      /* ───────────── Paddocks (list & counts) ───────────── */
      case "list": {
        const { data, error } = await sb
          .from("agriops_paddocks")
          .select("*")
          .eq("tenant_id", tenant_id)
          .order("name", { ascending: true });
        if (error) return fail(error.message, 500);
        return ok(data ?? []);
      }

      case "listWithCounts": {
        // Uses the view created in the SQL you installed earlier:
        //   agriops_v_paddock_head_counts(tenant_id, paddock_id, name, acres, head_count)
        const { data, error } = await sb
          .from("agriops_v_paddock_head_counts")
          .select("*")
          .eq("tenant_id", tenant_id)
          .order("name", { ascending: true });
        if (error) return fail(error.message, 500);
        return ok(data ?? []);
      }

      case "upsertPaddock": {
        // body.row can contain { id?, name, acres }
        const row = body.row || {};
        if (!row.name || String(row.name).trim() === "") {
          return fail("Name is required");
        }
        // Always enforce tenant on the server
        const payload = {
          id: row.id ?? undefined,
          tenant_id,
          name: String(row.name).trim(),
          acres:
            row.acres === null || row.acres === undefined
              ? null
              : Number(row.acres),
        };

        // If id present -> update, else insert
        if (payload.id) {
          const { data, error } = await sb
            .from("agriops_paddocks")
            .update({
              name: payload.name,
              acres: payload.acres,
            })
            .eq("tenant_id", tenant_id)
            .eq("id", payload.id)
            .select()
            .maybeSingle();
          if (error) return fail(error.message, 500);
          return ok(data);
        } else {
          const { data, error } = await sb
            .from("agriops_paddocks")
            .insert({
              tenant_id,
              name: payload.name,
              acres: payload.acres,
            })
            .select()
            .maybeSingle();
          if (error) return fail(error.message, 500);
          return ok(data);
        }
      }

      case "deletePaddock": {
        const { id } = body;
        if (!id) return fail("Missing id");
        const { error } = await sb
          .from("agriops_paddocks")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("id", id);
        if (error) return fail(error.message, 500);
        return ok({ deleted: id });
      }

      /* ───────────── Seeding ───────────── */
      case "listSeeding": {
        const { paddock_id } = body;
        if (!paddock_id) return fail("Missing paddock_id");
        const { data, error } = await sb
          .from("agriops_paddock_seeding")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("paddock_id", paddock_id)
          .order("id", { ascending: true });
        if (error) return fail(error.message, 500);
        return ok(data ?? []);
      }

      case "upsertSeeding": {
        const row = body.row || {};
        if (!row.paddock_id) return fail("Missing paddock_id");
        if (!row.seed_mix_name || String(row.seed_mix_name).trim() === "") {
          return fail("Seed mix name is required");
        }
        const payload = {
          id: row.id ?? undefined,
          tenant_id,
          paddock_id: Number(row.paddock_id),
          seed_mix_name: String(row.seed_mix_name).trim(),
          species: row.species ? String(row.species).trim() : "",
          rate_lb_ac:
            row.rate_lb_ac === null || row.rate_lb_ac === undefined
              ? null
              : Number(row.rate_lb_ac),
          notes:
            row.notes && String(row.notes).trim().length
              ? String(row.notes).trim()
              : null,
        };

        if (payload.id) {
          const { data, error } = await sb
            .from("agriops_paddock_seeding")
            .update({
              seed_mix_name: payload.seed_mix_name,
              species: payload.species,
              rate_lb_ac: payload.rate_lb_ac,
              notes: payload.notes,
            })
            .eq("tenant_id", tenant_id)
            .eq("id", payload.id)
            .select()
            .maybeSingle();
          if (error) return fail(error.message, 500);
          return ok(data);
        } else {
          const { data, error } = await sb
            .from("agriops_paddock_seeding")
            .insert(payload)
            .select()
            .maybeSingle();
          if (error) return fail(error.message, 500);
          return ok(data);
        }
      }

      case "deleteSeeding": {
        const { id } = body;
        if (!id) return fail("Missing id");
        const { error } = await sb
          .from("agriops_paddock_seeding")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("id", id);
        if (error) return fail(error.message, 500);
        return ok({ deleted: id });
      }

      /* ───────────── Amendments ───────────── */
      case "listAmendments": {
        const { paddock_id } = body;
        if (!paddock_id) return fail("Missing paddock_id");
        const { data, error } = await sb
          .from("agriops_paddock_amendments")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("paddock_id", paddock_id)
          .order("id", { ascending: true });
        if (error) return fail(error.message, 500);
        return ok(data ?? []);
      }

      case "upsertAmendment": {
        const row = body.row || {};
        if (!row.paddock_id) return fail("Missing paddock_id");
        if (!row.product || String(row.product).trim() === "") {
          return fail("Product is required");
        }
        const payload = {
          id: row.id ?? undefined,
          tenant_id,
          paddock_id: Number(row.paddock_id),
          product: String(row.product).trim(),
          rate_unit_ac: row.rate_unit_ac ? String(row.rate_unit_ac).trim() : "",
          notes:
            row.notes && String(row.notes).trim().length
              ? String(row.notes).trim()
              : null,
        };

        if (payload.id) {
          const { data, error } = await sb
            .from("agriops_paddock_amendments")
            .update({
              product: payload.product,
              rate_unit_ac: payload.rate_unit_ac,
              notes: payload.notes,
            })
            .eq("tenant_id", tenant_id)
            .eq("id", payload.id)
            .select()
            .maybeSingle();
          if (error) return fail(error.message, 500);
          return ok(data);
        } else {
          const { data, error } = await sb
            .from("agriops_paddock_amendments")
            .insert(payload)
            .select()
            .maybeSingle();
          if (error) return fail(error.message, 500);
          return ok(data);
        }
      }

      case "deleteAmendment": {
        const { id } = body;
        if (!id) return fail("Missing id");
        const { error } = await sb
          .from("agriops_paddock_amendments")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("id", id);
        if (error) return fail(error.message, 500);
        return ok({ deleted: id });
      }

      default:
        return fail(`Unknown action: ${action}`);
    }
  } catch (e: any) {
    return fail(e?.message || "Server error", 500);
  }
}

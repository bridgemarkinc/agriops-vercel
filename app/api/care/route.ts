/* app/api/care/route.ts
   Secure server actions for Care OS:
   - Protocols: listProtocols, addProtocol, updateProtocol, deleteProtocol, assignProtocol, updateProtocolAssignment
   - Feeding:   upsertRation, upsertFeedingSchedule, recordFeedingEvent
   - Monitoring/Alerts: logVitals, createAlert, resolveAlert
*/

export const runtime = "nodejs";          // ensure Node (not Edge)
export const dynamic = "force-dynamic";   // disable caching for API

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ───────────────── Helpers ───────────────── */
function ok(data?: any) {
  return NextResponse.json({ ok: true, data });
}
function err(message = "Request failed", status = 400, details?: any) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

/* ───────────────── Supabase (SERVER: service key) ───────────────── */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // never expose on client

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ───────────────── POST Handler ───────────────── */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const tenant_id = String(body?.tenant_id || "");

    if (!action) return err("Action is required");
    if (!tenant_id) return err("tenant_id is required");

    /* ───────── Debug (optional) ───────── */
    if (action === "debugRole") {
      return ok({
        route: "care",
        serviceRoleLoaded: Boolean(SERVICE_ROLE_KEY),
        supabaseUrlLoaded: Boolean(SUPABASE_URL),
      });
    }

    /* ───────── Seed Mixes ───────── */

    // List all mixes for a tenant
    if (action === "listSeedMixes") {
      const { data, error } = await admin
        .from("agriops_seed_mixes")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("name", { ascending: true });

      if (error) throw error;
      return ok(data);
    }

    // List composition items for a mix
    if (action === "listSeedMixItems") {
      const mix_id = Number(body?.mix_id || 0);
      if (!mix_id) return err("mix_id is required");
      const { data, error } = await admin
        .from("agriops_seed_mix_items")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("mix_id", mix_id)
        .order("species", { ascending: true });

      if (error) throw error;
      return ok(data);
    }

    // Upsert a seed mix (insert if no id, update if id present)
    if (action === "upsertSeedMix") {
      const payload = body?.payload || {};
      if (!payload?.name || !String(payload.name).trim()) {
        return err("payload.name is required");
      }
      const up = {
        id: payload.id ?? undefined,
        tenant_id,
        name: String(payload.name).trim(),
        notes: payload.notes ?? null,
      };

      const { data, error } = await admin
        .from("agriops_seed_mixes")
        .upsert(up, { onConflict: "id" })
        .select("*")
        .single();

      if (error) throw error;
      return ok(data);
    }

    // Delete a seed mix (cascade removes items if FK cascade configured)
    if (action === "deleteSeedMix") {
      const id = Number(body?.id || 0);
      if (!id) return err("id is required");

      const { error } = await admin
        .from("agriops_seed_mixes")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", id);

      if (error) throw error;
      return ok({ deleted: true });
    }

    // Upsert a seed mix item (species line)
    if (action === "upsertSeedMixItem") {
      const payload = body?.payload || {};
      const mix_id = Number(payload?.mix_id || 0);
      if (!mix_id) return err("payload.mix_id is required");
      const species = String(payload?.species || "").trim();
      if (!species) return err("payload.species is required");
      const lbs_per_ac = Number(payload?.lbs_per_ac || 0);

      const up = {
        id: payload.id ?? undefined,
        tenant_id,
        mix_id,
        species,
        lbs_per_ac,
      };

      const { data, error } = await admin
        .from("agriops_seed_mix_items")
        .upsert(up, { onConflict: "id" })
        .select("*")
        .single();

      if (error) throw error;
      return ok(data);
    }

    // Delete a seed mix item
    if (action === "deleteSeedMixItem") {
      const id = Number(body?.id || 0);
      if (!id) return err("id is required");

      const { error } = await admin
        .from("agriops_seed_mix_items")
        .delete()
        .eq("tenant_id", tenant_id)
        .eq("id", id);

      if (error) throw error;
      return ok({ deleted: true });
    }

    /* ───────── Paddock Seeding & Amendments ───────── */

    // Get paddock-level settings (or null if none yet)
    if (action === "getPaddockSeeding") {
      const paddock_id = Number(body?.paddock_id || 0);
      if (!paddock_id) return err("paddock_id is required");

      const { data, error } = await admin
        .from("agriops_paddock_seeding")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("paddock_id", paddock_id)
        .maybeSingle();

      if (error) throw error;
      return ok(data || null);
    }

    // Save paddock-level settings (upsert by tenant_id + paddock_id)
    if (action === "savePaddockSeeding") {
      const payload = body?.payload || {};
      const paddock_id = Number(payload?.paddock_id || 0);
      if (!paddock_id) return err("payload.paddock_id is required");

      // Trust only allowed fields and normalize types
      const up = {
        id: payload.id ?? undefined,
        tenant_id,
        paddock_id,
        seed_mix_id: payload.seed_mix_id ? Number(payload.seed_mix_id) : null,
        seeding_rate_lbs_ac:
          payload.seeding_rate_lbs_ac !== undefined && payload.seeding_rate_lbs_ac !== null
            ? Number(payload.seeding_rate_lbs_ac)
            : null,
        fert_n_lb_ac:
          payload.fert_n_lb_ac !== undefined && payload.fert_n_lb_ac !== null
            ? Number(payload.fert_n_lb_ac)
            : null,
        fert_p_lb_ac:
          payload.fert_p_lb_ac !== undefined && payload.fert_p_lb_ac !== null
            ? Number(payload.fert_p_lb_ac)
            : null,
        fert_k_lb_ac:
          payload.fert_k_lb_ac !== undefined && payload.fert_k_lb_ac !== null
            ? Number(payload.fert_k_lb_ac)
            : null,
        lime_ton_ac:
          payload.lime_ton_ac !== undefined && payload.lime_ton_ac !== null
            ? Number(payload.lime_ton_ac)
            : null,
        last_seeded_date: payload.last_seeded_date || null,            // yyyy-mm-dd
        next_reseed_window: payload.next_reseed_window || null,        // free text like "Fall 2026"
        notes: payload.notes ?? null,
        custom_species: Array.isArray(payload.custom_species)
          ? payload.custom_species
          : null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await admin
        .from("agriops_paddock_seeding")
        .upsert(up, { onConflict: "tenant_id,paddock_id" })
        .select("*")
        .single();

      if (error) throw error;
      return ok(data);
    }

    /* ───────── Unknown ───────── */
    return err(`Unknown action: ${action}`, 400);
  } catch (e: any) {
    console.error("API /api/care error:", e?.message || e, e);
    return err(e?.message || "Server error", 500, e);
  }
}

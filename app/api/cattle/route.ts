// app/api/cattle/route.ts
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseService(): SupabaseClient {
  // Prefer server-only vars, fallback to NEXT_PUBLIC_* if needed (dev convenience)
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || "";

  if (!url || !serviceKey) {
    // Don't print the real keys
    throw new Error(
      `Missing env: ${
        !url ? "[SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL]" : ""
      } ${!serviceKey ? "[SUPABASE_SERVICE_ROLE]" : ""}`.trim()
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

}

function ok(data: any, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body as { action?: string };
    if (!action) return err("Missing action");

    const supabase = getSupabaseService();

    switch (action) {
      /* ───────────────
       * LIST
       * ─────────────── */
      case "list": {
        const { tenant_id } = body as { tenant_id?: string };
        if (!tenant_id) return err("tenant_id required");

        const { data, error } = await supabase
          .from("agriops_cattle")
          .select("*")
          .eq("tenant_id", tenant_id)
          .order("tag_number", { ascending: true });

        if (error) throw error;
        return ok(data ?? []);
      }

      /* ───────────────
       * UPSERT
       * ─────────────── */
      case "upsert": {
        const { row } = body as {
          row: {
            id?: number;
            tenant_id: string;
            tag_number: string;
            name?: string;
            breed?: string;
            birth_date?: string | null;
            sex?: string;
            current_paddock?: string | null;
            weight_lb?: number | null;
          };
        };

        if (!row?.tenant_id || !row?.tag_number)
          return err("tenant_id and tag_number required");

        const payload = {
          tenant_id: row.tenant_id,
          tag_number: row.tag_number,
          name: row.name || null,
          breed: row.breed || null,
          birth_date: row.birth_date || null,
          sex: row.sex || null,
          current_paddock: row.current_paddock || null,
          weight_lb: row.weight_lb ?? null,
        };

        const query = row.id
          ? supabase.from("agriops_cattle").update(payload).eq("id", row.id).select().maybeSingle()
          : supabase.from("agriops_cattle").insert([payload]).select().maybeSingle();

        const { data, error } = await query;
        if (error) throw error;
        return ok(data);
      }

      /* ───────────────
       * DELETE
       * ─────────────── */
      case "delete": {
        const { tenant_id, id } = body as { tenant_id?: string; id?: number };
        if (!tenant_id || !id) return err("tenant_id and id required");

        const { error } = await supabase
          .from("agriops_cattle")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("id", id);

        if (error) throw error;
        return ok({ id });
      }

      /* ───────────────
       * LIST BY PADDOCK
       * ─────────────── */
      case "listByPaddock": {
        const { tenant_id, paddock_name } = body as {
          tenant_id?: string;
          paddock_name?: string;
        };
        if (!tenant_id || !paddock_name)
          return err("tenant_id and paddock_name required");

        const { data, error } = await supabase
          .from("agriops_cattle")
          .select("*")
          .eq("tenant_id", tenant_id)
          .eq("current_paddock", paddock_name);

        if (error) throw error;
        return ok(data ?? []);
      }

      /* ───────────────
       * MOVE CATTLE TO NEW PADDOCK
       * ─────────────── */
      case "moveToPaddock": {
        const { tenant_id, ids, new_paddock } = body as {
          tenant_id?: string;
          ids?: number[];
          new_paddock?: string;
        };
        if (!tenant_id || !ids?.length) return err("tenant_id and ids[] required");

        const { error } = await supabase
          .from("agriops_cattle")
          .update({ current_paddock: new_paddock || null })
          .eq("tenant_id", tenant_id)
          .in("id", ids);

        if (error) throw error;
        return ok({ moved: ids.length, new_paddock });
      }

      default:
        return err(`Unknown action: ${action}`);
    }
  } catch (e: any) {
    console.error("Cattle API error:", e);
    return err(e?.message || "Server error", 500);
  }
}

export async function GET() {
  return ok({
    ok: true,
    message: "cattle API ready",
    actions: [
      "list",
      "upsert",
      "delete",
      "listByPaddock",
      "moveToPaddock",
    ],
  });
}

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- helpers (NOT EXPORTED) ----------
function getSupabaseService(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE!;
  if (!url || !service) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE");
  }
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data });
}
function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// ---------- types ----------
type TenantId = string;
type Id = number;

type PaddockRow = {
  id?: Id;
  tenant_id: TenantId;
  name: string;
  acreage?: number | null;
  soil_type?: string | null;
  notes?: string | null;
  status?: string | null;
};

// ---------- POST ----------
export async function POST(req: Request) {
  const supabase = getSupabaseService();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body");
  }

  const action = body?.action as string;
  if (!action) return fail("Missing 'action'");

  try {
    switch (action) {
      // ---- List paddocks ----
      case "list": {
        const { tenant_id } = body as { tenant_id: TenantId };
        if (!tenant_id) return fail("tenant_id required");
        const { data, error } = await supabase
          .from("agriops_paddocks_with_counts") // use view
          .select("*")
          .eq("tenant_id", tenant_id)
          .order("name");
        if (error) throw error;
        return ok(data ?? []);
      }

      // ---- Upsert paddock ----
      case "upsertPaddock": {
        const { payload } = body as { payload: PaddockRow };
        if (!payload?.tenant_id || !payload.name)
          return fail("payload.tenant_id and payload.name required");

        const { data, error } = await supabase
          .from("agriops_paddocks")
          .upsert(
            {
              tenant_id: payload.tenant_id,
              name: payload.name,
              acreage: payload.acreage ?? null,
              soil_type: payload.soil_type ?? null,
              notes: payload.notes ?? null,
              status: payload.status ?? "active",
            },
            { onConflict: "tenant_id,name" }
          )
          .select()
          .limit(1);

        if (error) throw error;
        return ok(data?.[0] ?? null);
      }

      // ---- Update paddock ----
      case "updatePaddock": {
        const { id, tenant_id, patch } = body as {
          id: Id;
          tenant_id: TenantId;
          patch: Partial<PaddockRow>;
        };
        if (!id || !tenant_id) return fail("id and tenant_id required");

        const { data, error } = await supabase
          .from("agriops_paddocks")
          .update({
            name: patch.name ?? undefined,
            acreage: patch.acreage ?? null,
            soil_type: patch.soil_type ?? null,
            notes: patch.notes ?? null,
            status: patch.status ?? null,
          })
          .eq("id", id)
          .eq("tenant_id", tenant_id)
          .select()
          .limit(1);

        if (error) throw error;
        return ok(data?.[0] ?? null);
      }

      // ---- Delete paddock ----
      case "deletePaddock": {
        const { id, tenant_id } = body as { id: Id; tenant_id: TenantId };
        if (!id || !tenant_id) return fail("id and tenant_id required");

        const { error } = await supabase
          .from("agriops_paddocks")
          .delete()
          .eq("id", id)
          .eq("tenant_id", tenant_id);
        if (error) throw error;
        return ok({ deleted: true });
      }

      // ---- Bulk import paddocks ----
      case "bulkUpsert": {
        const { rows } = body as { rows: PaddockRow[] };
        if (!Array.isArray(rows) || rows.length === 0) return fail("rows[] required");

        const cleaned = rows.map((r) => ({
          tenant_id: r.tenant_id,
          name: r.name,
          acreage: r.acreage ?? null,
          soil_type: r.soil_type ?? null,
          notes: r.notes ?? null,
          status: r.status ?? "active",
        }));

        const { data, error } = await supabase
          .from("agriops_paddocks")
          .upsert(cleaned, { onConflict: "tenant_id,name" })
          .select();

        if (error) throw error;
        return ok({ imported: data?.length ?? cleaned.length });
      }

      default:
        return fail(`Unknown action: ${action}`, 404);
    }
  } catch (err: any) {
    console.error("API /api/paddocks error:", err);
    const msg = err?.message || "Server error";
    return fail(msg, 500);
  }
}

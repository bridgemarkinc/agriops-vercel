// app/api/paddocks/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/** Build a server-side Supabase client with the SERVICE ROLE key.
 *  Never expose this in the browser.
 *  We accept SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL for convenience.
 */
function getSupabaseService() {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const service = process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !service) return null; // <-- don't throw; let the handler respond with JSON
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Safe JSON reader — never throws
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
  if (!supa) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Missing env vars. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE on the server.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await readJson(req);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { action } = body as { action?: string };
    if (!action) {
      return NextResponse.json(
        { ok: false, error: "Missing 'action'" },
        { status: 400 }
      );
    }

    switch (action) {
      case "listWithCounts": {
        const { tenant_id } = body as { tenant_id: string };
        if (!tenant_id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id is required" },
            { status: 400 }
          );
        }
        const { data, error } = await supa
          .from("agriops_paddocks_with_counts")
          .select("*")
          .eq("tenant_id", tenant_id)
          .order("name");
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "upsertPaddock": {
        const { tenant_id, row } = body as {
          tenant_id: string;
          row: { id?: number; name: string; acres?: number | null };
        };
        if (!tenant_id || !row?.name) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and row.name are required" },
            { status: 400 }
          );
        }
        const payload = { ...row, tenant_id };
        const { data, error } = await supa
          .from("agriops_paddocks")
          .upsert(payload as any)
          .select()
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "deletePaddock": {
        const { id, tenant_id } = body as { id: number; tenant_id: string };
        if (!id || !tenant_id) {
          return NextResponse.json(
            { ok: false, error: "id and tenant_id are required" },
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

      case "listSeeding": {
        const { tenant_id, paddock_id } = body as {
          tenant_id: string;
          paddock_id: number;
        };
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
        const { tenant_id, row } = body as {
          tenant_id: string;
          row: {
            id?: number;
            paddock_id: number;
            seed_mix_name: string;
            species: string;
            rate_lb_ac?: number | null;
            notes?: string | null;
          };
        };
        if (!tenant_id || !row?.paddock_id || !row?.seed_mix_name) {
          return NextResponse.json(
            {
              ok: false,
              error: "tenant_id, paddock_id and seed_mix_name are required",
            },
            { status: 400 }
          );
        }
        const payload = { ...row, tenant_id };
        const { data, error } = await supa
          .from("agriops_paddock_seeding")
          .upsert(payload as any)
          .select()
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "deleteSeeding": {
        const { tenant_id, id } = body as { tenant_id: string; id: number };
        if (!tenant_id || !id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and id are required" },
            { status: 400 }
          );
        }
        const { error } = await supa
          .from("agriops_paddock_seeding")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { deleted: id } });
      }

      case "listAmendments": {
        const { tenant_id, paddock_id } = body as {
          tenant_id: string;
          paddock_id: number;
        };
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
        const { tenant_id, row } = body as {
          tenant_id: string;
          row: {
            id?: number;
            paddock_id: number;
            product: string;
            rate_unit_ac: string;
            notes?: string | null;
          };
        };
        if (!tenant_id || !row?.paddock_id || !row?.product) {
          return NextResponse.json(
            { ok: false, error: "tenant_id, paddock_id and product are required" },
            { status: 400 }
          );
        }
        const payload = { ...row, tenant_id };
        const { data, error } = await supa
          .from("agriops_paddock_amendments")
          .upsert(payload as any)
          .select()
          .maybeSingle();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      case "deleteAmendment": {
        const { tenant_id, id } = body as { tenant_id: string; id: number };
        if (!tenant_id || !id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and id are required" },
            { status: 400 }
          );
        }
        const { error } = await supa
          .from("agriops_paddock_amendments")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("id", id);
        if (error) throw error;
        return NextResponse.json({ ok: true, data: { deleted: id } });
      }

      default:
        return NextResponse.json(
          { ok: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    console.error("[/api/paddocks] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

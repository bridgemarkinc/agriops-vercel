import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-side Supabase with SERVICE ROLE (never expose in client). */
function getSupabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE!;
  if (!url || !service) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE");
  }
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
  try {
    const body = await readJson(req);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { action } = body as { action?: string };
    if (!action) {
      return NextResponse.json({ ok: false, error: "Missing 'action'" }, { status: 400 });
    }

    switch (action) {
      /** ─────────────── Paddocks ─────────────── */
      case "listWithCounts": {
        const { tenant_id } = body as { tenant_id: string };
        if (!tenant_id) {
          return NextResponse.json({ ok: false, error: "tenant_id is required" }, { status: 400 });
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
          row: { id?: number; name: string; acres?: number | null; zone?: string | null; notes?: string | null };
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

      /** ─────────────── Seeding ───────────────
       * Matches UI: { paddock_id, date_planted, mix_name, mix_items(JSON), notes }
       * Ensure DB columns exist:
       *  - id PK, tenant_id uuid/text, paddock_id int, date_planted date null,
       *  - mix_name text null, mix_items jsonb null, notes text null, created_at timestamptz default now()
       */
      case "listSeeding": {
        const { tenant_id, paddock_id } = body as { tenant_id: string; paddock_id: number };
        if (!tenant_id || !paddock_id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and paddock_id are required" },
            { status: 400 }
          );
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
        // Accept payload in multiple shapes to be resilient with the client
        const b = body as any;

        // Prefer explicit tenant_id, but fall back to nested just in case
        const tenant_id: string =
          b.tenant_id ??
          b.payload?.tenant_id ??
          b.row?.tenant_id ??
          "";

        // Pull paddock_id from common places and coerce to number
        const paddock_id_raw =
          b.payload?.paddock_id ??
          b.row?.paddock_id ??
          b.paddock_id ??
          null;

        const paddock_id =
          paddock_id_raw != null ? Number(paddock_id_raw) : null;

        // Other fields (all optional)
        const date_planted =
          b.payload?.date_planted ??
          b.row?.date_planted ??
          b.date_planted ??
          null;

        const mix_name =
          (b.payload?.mix_name ??
            b.row?.mix_name ??
            b.mix_name ??
            null) as string | null;

        // store as JSONB; allow empty arrays to become null
        const mix_items =
          (b.payload?.mix_items ??
            b.row?.mix_items ??
            b.mix_items ??
            null) || null;

        const notes =
          (b.payload?.notes ??
            b.row?.notes ??
            b.notes ??
            null) as string | null;

        if (!tenant_id || !paddock_id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and paddock_id are required" },
            { status: 400 }
          );
        }

        const row = {
          tenant_id,
          paddock_id,
          date_planted: date_planted ?? null,
          mix_name: mix_name ?? null,
          mix_items: Array.isArray(mix_items) && mix_items.length ? mix_items : null,
          notes: notes ?? null,
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

      /** ─────────────── Amendments ───────────────
       * Matches UI: { date_applied, product, rate, notes }
       * Ensure DB columns exist:
       *  - id PK, tenant_id, paddock_id, date_applied date, product text,
       *  - rate text null, notes text null, created_at timestamptz default now()
       */
      case "listAmendments": {
        const { tenant_id, paddock_id } = body as { tenant_id: string; paddock_id: number };
        if (!tenant_id || !paddock_id) {
          return NextResponse.json(
            { ok: false, error: "tenant_id and paddock_id are required" },
            { status: 400 }
          );
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
        // UI posts: { payload: { paddock_id, date_applied, product, rate, notes } }
        const { tenant_id, payload } = body as {
          tenant_id: string;
          payload: {
            paddock_id: number;
            date_applied?: string | null;
            product: string;
            rate?: string | null; // NOTE: string, not rate_unit_ac
            notes?: string | null;
          };
        };
        if (!tenant_id || !payload?.paddock_id || !payload?.product) {
          return NextResponse.json(
            { ok: false, error: "tenant_id, payload.paddock_id and payload.product are required" },
            { status: 400 }
          );
        }
        const row = {
          tenant_id,
          paddock_id: payload.paddock_id,
          date_applied: payload.date_applied ?? null,
          product: payload.product,
          rate: payload.rate ?? null, // align with UI
          notes: payload.notes ?? null,
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
        return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[/api/paddocks] error", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}

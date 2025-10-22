// app/api/paddocks/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // ensure Node runtime (not edge)

function supa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only
  if (!url || !key) {
    throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function ok(data: any, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}
function err(message: string, init?: number) {
  return NextResponse.json({ ok: false, error: message }, { status: init ?? 400 });
}

type UpsertPaddockBody = {
  id?: number;
  tenant_id: string;
  name: string;
  acres?: number | null;
};

type UpsertSeedingBody = {
  id?: number;
  paddock_id: number;
  seed_mix_name: string;
  species: string;
  rate_lb_ac?: number | null;
  notes?: string | null;
};

type UpsertAmendBody = {
  id?: number;
  paddock_id: number;
  product: string;
  rate_unit_ac: string;
  notes?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body as { action?: string };

    if (!action) return err("Missing 'action'.");

    switch (action) {
      /* ───────────────────────────────
       * BASIC PADDOCK CRUD
       * ─────────────────────────────── */
      case "list": {
        const { tenant_id } = body as { tenant_id?: string };
        if (!tenant_id) return err("tenant_id is required");

        const { data, error } = await supa()
          .from("agriops_paddocks")
          .select("id, tenant_id, name, acres, created_at")
          .eq("tenant_id", tenant_id)
          .order("name", { ascending: true });

        if (error) throw error;
        return ok(data ?? []);
      }

      case "listWithCounts": {
        const { tenant_id } = body as { tenant_id?: string };
        if (!tenant_id) return err("tenant_id is required");

        const db = supa();

        const [padsRes, cattleRes] = await Promise.all([
          db
            .from("agriops_paddocks")
            .select("id, tenant_id, name, acres, created_at")
            .eq("tenant_id", tenant_id)
            .order("name", { ascending: true }),
          db
            .from("agriops_cattle")
            .select("id, current_paddock")
            .eq("tenant_id", tenant_id),
        ]);

        if (padsRes.error) throw padsRes.error;
        if (cattleRes.error) throw cattleRes.error;

        const counts = new Map<string, number>();
        (cattleRes.data ?? []).forEach((c) => {
          const key = (c.current_paddock || "").trim();
          if (!key) return;
          counts.set(key, (counts.get(key) || 0) + 1);
        });

        const merged = (padsRes.data ?? []).map((p) => ({
          ...p,
          head_count: counts.get((p.name || "").trim()) || 0,
        }));

        return ok(merged);
      }

      case "upsert": {
        const { id, tenant_id, name, acres } = body.row as UpsertPaddockBody;
        if (!tenant_id || !name) return err("tenant_id and name are required");

        if (id) {
          // update
          const { data, error } = await supa()
            .from("agriops_paddocks")
            .update({ name, acres: acres ?? null })
            .eq("tenant_id", tenant_id)
            .eq("id", id)
            .select()
            .maybeSingle();

          if (error) throw error;
          return ok(data);
        } else {
          // insert
          const { data, error } = await supa()
            .from("agriops_paddocks")
            .insert([{ tenant_id, name, acres: acres ?? null }])
            .select()
            .maybeSingle();

          if (error) throw error;
          return ok(data);
        }
      }

      case "delete": {
        const { tenant_id, id } = body as { tenant_id?: string; id?: number };
        if (!tenant_id || !id) return err("tenant_id and id are required");

        const { error } = await supa()
          .from("agriops_paddocks")
          .delete()
          .eq("tenant_id", tenant_id)
          .eq("id", id);

        if (error) throw error;
        return ok({ id });
      }

      /* ───────────────────────────────
       * SEEDING (MIXES) PER PADDOCK
       * ─────────────────────────────── */
      case "listSeeding": {
        const { tenant_id, paddock_id } = body as {
          tenant_id?: string;
          paddock_id?: number;
        };
        if (!tenant_id || !paddock_id) return err("tenant_id and paddock_id are required");

        const { data, error } = await supa()
          .from("agriops_paddock_seeding")
          .select("id, paddock_id, seed_mix_name, species, rate_lb_ac, notes, created_at")
          .eq("paddock_id", paddock_id)
          .order("id", { ascending: true });

        if (error) throw error;
        return ok(data ?? []);
      }

      case "upsertSeeding": {
        const { tenant_id, row } = body as { tenant_id?: string; row: UpsertSeedingBody };
        if (!tenant_id) return err("tenant_id is required");
        if (!row?.paddock_id) return err("paddock_id is required");
        if (!row?.seed_mix_name) return err("seed_mix_name is required");

        if (row.id) {
          const { data, error } = await supa()
            .from("agriops_paddock_seeding")
            .update({
              seed_mix_name: row.seed_mix_name,
              species: row.species,
              rate_lb_ac: row.rate_lb_ac ?? null,
              notes: row.notes ?? null,
            })
            .eq("id", row.id)
            .eq("paddock_id", row.paddock_id)
            .select()
            .maybeSingle();

          if (error) throw error;
          return ok(data);
        } else {
          const { data, error } = await supa()
            .from("agriops_paddock_seeding")
            .insert([
              {
                paddock_id: row.paddock_id,
                seed_mix_name: row.seed_mix_name,
                species: row.species,
                rate_lb_ac: row.rate_lb_ac ?? null,
                notes: row.notes ?? null,
              },
            ])
            .select()
            .maybeSingle();

          if (error) throw error;
          return ok(data);
        }
      }

      case "deleteSeeding": {
        const { tenant_id, id } = body as { tenant_id?: string; id?: number };
        if (!tenant_id || !id) return err("tenant_id and id are required");

        const { error } = await supa()
          .from("agriops_paddock_seeding")
          .delete()
          .eq("id", id);

        if (error) throw error;
        return ok({ id });
      }

      /* ───────────────────────────────
       * AMENDMENTS PER PADDOCK
       * ─────────────────────────────── */
      case "listAmendments": {
        const { tenant_id, paddock_id } = body as {
          tenant_id?: string;
          paddock_id?: number;
        };
        if (!tenant_id || !paddock_id) return err("tenant_id and paddock_id are required");

        const { data, error } = await supa()
          .from("agriops_paddock_amendments")
          .select("id, paddock_id, product, rate_unit_ac, notes, created_at")
          .eq("paddock_id", paddock_id)
          .order("id", { ascending: true });

        if (error) throw error;
        return ok(data ?? []);
      }

      case "upsertAmendment": {
        const { tenant_id, row } = body as { tenant_id?: string; row: UpsertAmendBody };
        if (!tenant_id) return err("tenant_id is required");
        if (!row?.paddock_id) return err("paddock_id is required");
        if (!row?.product) return err("product is required");
        if (!row?.rate_unit_ac) return err("rate_unit_ac is required");

        if (row.id) {
          const { data, error } = await supa()
            .from("agriops_paddock_amendments")
            .update({
              product: row.product,
              rate_unit_ac: row.rate_unit_ac,
              notes: row.notes ?? null,
            })
            .eq("id", row.id)
            .eq("paddock_id", row.paddock_id)
            .select()
            .maybeSingle();

          if (error) throw error;
          return ok(data);
        } else {
          const { data, error } = await supa()
            .from("agriops_paddock_amendments")
            .insert([
              {
                paddock_id: row.paddock_id,
                product: row.product,
                rate_unit_ac: row.rate_unit_ac,
                notes: row.notes ?? null,
              },
            ])
            .select()
            .maybeSingle();

          if (error) throw error;
          return ok(data);
        }
      }

      case "deleteAmendment": {
        const { tenant_id, id } = body as { tenant_id?: string; id?: number };
        if (!tenant_id || !id) return err("tenant_id and id are required");

        const { error } = await supa()
          .from("agriops_paddock_amendments")
          .delete()
          .eq("id", id);

        if (error) throw error;
        return ok({ id });
      }

      default:
        return err(`Unknown action: ${action}`, 404);
    }
  } catch (e: any) {
    console.error("paddocks route error:", e);
    return err(e?.message || "Server error", 500);
  }
}

export async function GET() {
  // Optional: simple health-check / docs
  return ok({
    ok: true,
    message: "paddocks API is up",
    actions: [
      "list",
      "listWithCounts",
      "upsert",
      "delete",
      "listSeeding",
      "upsertSeeding",
      "deleteSeeding",
      "listAmendments",
      "upsertAmendment",
      "deleteAmendment",
    ],
  });
}

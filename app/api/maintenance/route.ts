// app/api/maintenance/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSupa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE!;
  if (!url || !key) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readBody(req: Request) {
  try { return await req.json(); } catch { return null; }
}

function toCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))];
  return lines.join("\n");
}

async function fetchTenantTable(supa: any, table: string, tenant_id: string) {
  const { data, error } = await supa.from(table).select("*").eq("tenant_id", tenant_id);
  if (error) throw error;
  return data || [];
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const supa = getSupa();
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

    const action = String(body.action || "");
    if (!action) return NextResponse.json({ ok: false, error: "Missing action" }, { status: 400 });

    if (action === "exportCSV") {
      const { tenant_id, table } = body as { tenant_id?: string; table?: string };
      if (!tenant_id || !table) {
        return NextResponse.json({ ok: false, error: "tenant_id and table are required" }, { status: 400 });
      }
      const rows = await fetchTenantTable(supa, table, tenant_id);
      const csv = toCSV(rows);

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${table}_${tenant_id}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (action === "exportAllZip") {
      const { tenant_id, tables } = body as { tenant_id?: string; tables?: string[] };
      if (!tenant_id || !Array.isArray(tables) || tables.length === 0) {
        return NextResponse.json({ ok: false, error: "tenant_id and tables[] are required" }, { status: 400 });
      }

      const zip = new JSZip();
const errors: string[] = [];

for (const table of tables) {
  try {
    const rows = await fetchTenantTable(supa, table, tenant_id);
    const csv = toCSV(rows);
    zip.file(`${table}.csv`, csv);
  } catch (e: any) {
    const msg = e?.message || String(e);
    // Keep going; record the problem
    errors.push(`${table}: ${msg}`);
  }
}

if (errors.length) {
  zip.file("_errors.txt", errors.join("\n"));
}

const zipAb = await zip.generateAsync({
  type: "arraybuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 6 },
});

return new Response(new Blob([zipAb], { type: "application/zip" }), {
  status: 200,
  headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="backup_${tenant_id}.zip"`,
    "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error("[/api/maintenance] error", err);
    return NextResponse.json({ ok: false, error: err?.message || "Server error" }, { status: 500 });
  }
}

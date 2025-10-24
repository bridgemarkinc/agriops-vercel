// app/api/_service-check/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const service = process.env.SUPABASE_SERVICE_ROLE!;
    const supa = createClient(url, service, { auth: { persistSession: false } });

    // Try a harmless RLS-protected read; with service role it should succeed even without auth.
    const { error } = await supa.from("agriops_cattle_photos").select("id").limit(1);
    return NextResponse.json({ ok: !error, error: error?.message ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

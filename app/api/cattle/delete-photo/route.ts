import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { tenant_id, cattle_id } = await req.json();
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const { data, error } = await supa
    .from("agriops_cattle")
    .update({ photo_url: null })
    .eq("tenant_id", tenant_id)
    .eq("id", cattle_id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }

  return NextResponse.json({ ok: true });
}

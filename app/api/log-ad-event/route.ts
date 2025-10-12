
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonOrService = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: Request) {
  try {
    const { tenant_id, type, zone } = await req.json();
    if (!tenant_id || !type || !zone) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const supabase = createClient(url, anonOrService);
    const { error } = await supabase.from("agriops_ad_events").insert({ tenant_id, type, zone });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "error" }, { status: 500 });
  }
}

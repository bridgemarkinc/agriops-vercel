import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supaAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const role = process.env.SUPABASE_SERVICE_ROLE!;
  return createClient(url, role, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const tenant_id = form.get("tenant_id") as string;
    const cattle_id = Number(form.get("cattle_id"));

    if (!file || !tenant_id || !cattle_id) {
      return NextResponse.json(
        { ok: false, error: "file, tenant_id, cattle_id required" },
        { status: 400 }
      );
    }

    const supa = supaAdmin();
    const fileExt = file.name.split(".").pop();
    const fileName = `${tenant_id}/${cattle_id}-${Date.now()}.${fileExt}`;

    // Upload file to storage
    const { error: uploadErr } = await supa.storage
      .from("cattle_media")
      .upload(fileName, file, { upsert: true });

    if (uploadErr) throw uploadErr;

    // Get public URL
    const { data: publicUrl } = supa.storage
      .from("cattle_media")
      .getPublicUrl(fileName);

    // Save record in DB
    const { error: dbErr } = await supa
      .from("agriops_cattle")
      .update({ photo_url: publicUrl.publicUrl })
      .eq("tenant_id", tenant_id)
      .eq("id", cattle_id);

    if (dbErr) throw dbErr;

    return NextResponse.json({ ok: true, url: publicUrl.publicUrl });
  } catch (err: any) {
    console.error("UPLOAD ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

// app/api/route.ts
import { NextResponse } from "next/server";

// Ensure this runs on the Node runtime (not Edge)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "This endpoint is deprecated. Use /api/cattle instead." },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "This endpoint is deprecated. Use /api/cattle instead." },
    { status: 410 }
  );
}

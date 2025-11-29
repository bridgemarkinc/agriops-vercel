// app/pasture/layout.tsx
// Server Component — no "use client"

export const revalidate = 0;              // number or false
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export default function PastureLayout({ children }: { children: React.ReactNode }) {
  return children;
}

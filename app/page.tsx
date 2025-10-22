// app/page.tsx
// ✅ Server component (no "use client" here)

// If you want zero caching:
export const revalidate = 0;               // must be a number or false
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import AgriOps from "@/components/AgriOps";

export default function HomePage() {
  // AgriOps is a client component and can render just fine inside a server page
  return <AgriOps />;
}

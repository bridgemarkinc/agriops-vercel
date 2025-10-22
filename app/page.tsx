// app/page.tsx
// Server Component — no "use client", no route options, no hooks, no exports
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-10">
      <h1 className="text-3xl font-bold mb-4">AgriOps</h1>
      <p className="text-gray-600 mb-6">Grazing & Feed Planner</p>
      <Link
        href="/pasture"
        className="px-4 py-2 border rounded-md hover:bg-slate-100"
      >
        Go to Pasture Maintenance
      </Link>
    </main>
  );
}

// app/page.tsx
// Server Component (no "use client", no route options)
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">AgriOps</h1>
        <p className="text-slate-600">Grazing & Feed Planner</p>
      </header>

      <nav className="flex gap-3 mb-6">
        <Link href="/pasture" className="px-3 py-2 border rounded-md hover:bg-slate-50">
          Pasture Maintenance
        </Link>
      </nav>

      <section className="text-slate-700">
        <p>Welcome. Choose a section above to get started.</p>
      </section>
    </main>
  );
}

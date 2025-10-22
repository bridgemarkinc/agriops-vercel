// app/not-found.tsx
// Server Component only: no "use client", no imports.

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-slate-600 mt-2">
          The page you requested does not exist.
        </p>
        <a
          href="/"
          className="inline-block mt-4 px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-50"
        >
          Go home
        </a>
      </div>
    </div>
  );
}

// app/not-found.tsx
export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-slate-600 mt-2">The page you requested does not exist.</p>
      </div>
    </div>
  );
}


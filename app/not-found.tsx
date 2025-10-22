// app/not-found.tsx
// Server Component (no "use client", no route options)
export default function NotFound() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Page not found</h1>
      <p>We couldn’t find what you were looking for.</p>
      <p style={{ marginTop: 16 }}>
        <a href="/" style={{ color: "#065f46", textDecoration: "underline" }}>
          Go back home
        </a>
      </p>
    </main>
  );
}

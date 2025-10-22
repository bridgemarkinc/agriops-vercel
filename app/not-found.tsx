// app/not-found.tsx
// Server Component — no "use client", no route options, no hooks.
export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Page not found</h1>
          <p>We couldn't find what you were looking for.</p>
          <p style={{ marginTop: 16 }}>
            <a href="/" style={{ color: "#064e3b", textDecoration: "underline" }}>
              Go back home
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}

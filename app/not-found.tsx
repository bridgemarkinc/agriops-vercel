// app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "white",
          padding: "2rem 2.5rem",
          borderRadius: "1rem",
          boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
          maxWidth: 480,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 10 }}>
          Page not found
        </h1>
        <p style={{ color: "#475569", marginBottom: 20 }}>
          The page you requested doesn’t exist or has been moved.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            background: "#0f172a",
            color: "white",
            padding: "10px 16px",
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

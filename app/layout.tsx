
import "./globals.css";
import React from "react";

export const metadata = { title: "AgriOps", description: "Grazing & Feed Planner" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

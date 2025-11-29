
import React from "react";
export function Badge({ children, variant="default" }: { children: React.ReactNode; variant?: string; }){
  const v = variant==="destructive" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${v}`}>{children}</span>;
}

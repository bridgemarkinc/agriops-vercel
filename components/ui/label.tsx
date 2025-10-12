
import React from "react";
export function Label({ children, className="" }: { children: React.ReactNode; className?: string; }){
  return <label className={`text-sm text-slate-600 ${className}`}>{children}</label>;
}

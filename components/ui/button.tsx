
import React from "react";
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string };
export function Button({ className="", variant="default", size="md", ...props }: Props) {
  const v = variant==="secondary" ? "bg-slate-100 hover:bg-slate-200 text-slate-900" :
            variant==="outline" ? "border border-slate-300 bg-white hover:bg-slate-50" :
            variant==="destructive" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white";
  const s = size==="sm" ? "px-2 py-1 text-sm rounded-lg" : size==="icon" ? "p-2 rounded-lg" : "px-3 py-2 rounded-xl";
  return <button className={`${v} ${s} shadow-sm ${className}`} {...props} />;
}

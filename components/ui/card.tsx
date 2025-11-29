
import React from "react";
export function Card({ children, className="" }: { children: React.ReactNode; className?: string; }){ return <div className={`rounded-2xl border bg-white shadow-sm ${className}`}>{children}</div>; }
export function CardHeader({ children }: { children: React.ReactNode; }){ return <div className="px-4 pt-4"><div className="text-lg font-semibold">{children}</div></div>; }
export function CardTitle({ children }: { children: React.ReactNode; }){ return <div>{children}</div>; }
export function CardContent({ children, className="" }: { children: React.ReactNode; className?: string; }){ return <div className={`px-4 pb-4 pt-2 ${className}`}>{children}</div>; }

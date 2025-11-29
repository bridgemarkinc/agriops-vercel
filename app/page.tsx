// app/page.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight } from "lucide-react";

// Lazy-load the big tools so the home page stays lightning fast
const GrazingPlanner = dynamic(() => import("@/components/GrazingPlanner"), { ssr: false });
const CattleByTag = dynamic(() => import("@/components/CattleByTag"), { ssr: false });
const FieldMap = dynamic(() => import("@/components/FieldMap"), { ssr: false });
// Add more as you build them

type Tile = {
  id: string;
  title: string;
  href?: string;           // optional now — we use componentId instead for inline
  componentId?: string;    // new: "grazing" | "cattle" | "map" etc.
  bgImage?: string;
  bgColor?: string;
  textColor?: string;
  rounded?: string;
};

const DEFAULT_TILES: Tile[] = [
  {
    id: "grazing",
    title: "Grazing Planner",
    componentId: "grazing",
    bgImage: "https://yxgnrgesmtgdbszgwaoe.supabase.co/storage/v1/object/public/images/pastruregrazingba.png",
    textColor: "#ffffff",
    rounded: "rounded-2xl",
  },
  {
    id: "cattle",
    title: "Cattle by Tag",
    componentId: "cattle",
    bgImage: "https://yxgnrgesmtgdbszgwaoe.supabase.co/storage/v1/object/public/images/cattleinv.png",
    textColor: "#ffffff",
    rounded: "rounded-2xl",
  },
  {
    id: "health",
    title: "Health Monitor",
    href: "/health", // old style — still works if you want separate page
    bgImage: "https://yxgnrgesmtgdbszgwaoe.supabase.co/storage/v1/object/public/images/healthmonitor.png",
    textColor: "#ffffff",
    rounded: "rounded-2xl",
  },
  // ... keep the rest exactly as you have them
];

const LS_KEY = "agriops.home.tiles.v2";

export default function HomePage() {
  const [tiles, setTiles] = useState<Tile[]>(DEFAULT_TILES);
  const [customize, setCustomize] = useState(false);
  const [editing, setEditing] = useState<Tile | null>(null);
  const [openTool, setOpenTool] = useState<string | null>(null); // ← this is the magic

  // Load saved tiles
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setTiles(JSON.parse(raw));
    } catch {}
  }, []);

  // Save tiles
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(tiles));
  }, [tiles]);

  // Toggle inline tool
  const toggleTool = (id: string) => {
    setOpenTool(prev => prev === id ? null : id);
  };

  const gridCols = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="container max-w-7xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-800">AgriOps</h1>
            <p className="text-slate-600 mt-2">Cattle & Pasture Operations</p>
          </div>
          <button
            onClick={() => setCustomize(v => !v)}
            className="px-5 py-2.5 text-sm font-medium border rounded-lg hover:bg-slate-100 transition"
          >
            {customize ? "Done" : "Customize"}
          </button>
        </div>

        {/* Tiles Grid */}
        <div className={gridCols}>
          {tiles.map((tile) => {
            const style: React.CSSProperties = {
              backgroundImage: tile.bgImage ? `url(${tile.bgImage})` : undefined,
              backgroundColor: tile.bgColor || undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            };

            const inner = (
              <div
                className={`relative h-48 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer
                  ${tile.bgImage ? "bg-black/30" : ""}`}
                style={style}
                onClick={() => tile.componentId && toggleTool(tile.componentId)}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="relative h-full flex flex-col justify-end p-6 text-white">
                  <h3 className="text-2xl font-bold drop-shadow-md">{tile.title}</h3>
                  <p className="text-sm opacity-90 mt-1">Click to open</p>
                </div>
                {customize && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditing(tile); }}
                    className="absolute top-3 right-3 px-3 py-1.5 bg-white/20 backdrop-blur rounded-md text-xs font-medium hover:bg-white/30"
                  >
                    Edit
                  </button>
                )}
              </div>
            );

            return (
              <div key={tile.id}>
                {tile.href ? (
                  <Link href={tile.href}>{inner}</Link>
                ) : (
                  inner
                )}
              </div>
            );
          })}
        </div>

        {/* Inline Tools — appear below the grid */}
        <div className="mt-12 space-y-8">
          {openTool === "grazing" && (
            <section className="rounded-2xl border bg-white shadow-xl overflow-hidden">
              <button
                onClick={() => setOpenTool(null)}
                className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition"
              >
                <h2 className="text-3xl font-bold">Grazing Rotation Planner</h2>
                <ChevronDown className="w-8 h-8" />
              </button>
              <div className="p-6 bg-slate-50">
                <GrazingPlanner tenantId="your-tenant-id" />
              </div>
            </section>
          )}

          {openTool === "cattle" && (
            <section className="rounded-2xl border bg-white shadow-xl overflow-hidden">
              <button
                onClick={() => setOpenTool(null)}
                className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition"
              >
                <h2 className="text-3xl font-bold">Cattle by Tag #</h2>
                <ChevronDown className="w-8 h-8" />
              </button>
              <div className="p-6 bg-slate-50">
                <CattleByTag tenantId="your-tenant-id" />
              </div>
            </section>
          )}

          {/* Add more as you build them */}
        </div>

        {/* Tile Editor Modal — unchanged */}
        {customize && editing && (
          <TileEditor
            tile={editing}
            onCancel={() => setEditing(null)}
            onSave={(t) => {
              setTiles(prev => prev.map(x => x.id === t.id ? t : x));
              setEditing(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// Keep your beautiful TileEditor exactly as-is (just paste it below)
function TileEditor({ tile, onCancel, onSave }: {
  tile: Tile;
  onCancel: () => void;
  onSave: (t: Tile) => void;
}) {
  const [draft, setDraft] = useState<Tile>(tile);
  useEffect(() => setDraft(tile), [tile]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-emerald-600 text-white font-semibold">Edit Tile</div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input className="w-full px-3 py-2 border rounded-lg" value={draft.title}
              onChange={e => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Background Image URL</label>
            <input className="w-full px-3 py-2 border rounded-lg" value={draft.bgImage || ""}
              onChange={e => setDraft({ ...draft, bgImage: e.target.value, bgColor: undefined })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Text Color</label>
            <input className="w-full px-3 py-2 border rounded-lg" value={draft.textColor || "#ffffff"}
              onChange={e => setDraft({ ...draft, textColor: e.target.value })} />
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={() => onSave(draft)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Save</button>
        </div>
      </div>
    </div>
  );
}
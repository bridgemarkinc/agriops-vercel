// app/page.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

type Tile = {
  id: string;
  title: string;
  href: string;
  bgColor?: string;       // e.g. "#065f46" or "hsl(160 80% 35%)"
  bgImage?: string;       // image URL; takes precedence over bgColor
  textColor?: string;     // default white over images/dark colors
  rounded?: string;       // tailwind radius class, e.g. "rounded-2xl"
};

const DEFAULT_TILES: Tile[] = [
  {
    id: "grazing",
    title: "Grazing Planner",
    href: "/planner",
    bgColor: "#065f46",
    textColor: "#ffffff",
    rounded: "rounded-2xl",
  },
  {
    id: "cattle",
    title: "Cattle by Tag",
    href: "/cattle",
    bgColor: "#334155",
    textColor: "#ffffff",
    rounded: "rounded-2xl",
  },
  {
    id: "health",
    title: "Health Monitor",
    href: "/health",
    bgColor: "#14532d",
    textColor: "#ffffff",
    rounded: "rounded-2xl",
  },
  {
    id: "pasture",
    title: "Pasture Maintenance",
    href: "/pasture",
    bgColor: "#0f766e",
    textColor: "#ffffff",
    rounded: "rounded-2xl",
  },
  {
    id: "placeholder-1",
    title: "Coming Soon",
    href: "#",
    bgColor: "#475569",
    textColor: "#ffffff",
    rounded: "rounded-2xl",
  },
  {
    id: "placeholder-2",
    title: "Coming Soon",
    href: "#",
    bgColor: "#6b7280",
    textColor: "#ffffff",
    rounded: "rounded-2xl",
  },
];

const LS_KEY = "agriops.home.tiles.v1";

export default function HomePage() {
  const [tiles, setTiles] = useState<Tile[]>(DEFAULT_TILES);
  const [customize, setCustomize] = useState(false);
  const [editing, setEditing] = useState<Tile | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setTiles(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(tiles));
    } catch {}
  }, [tiles]);

  const onEditTile = (id: string) => {
    const t = tiles.find((x) => x.id === id) || null;
    setEditing(t);
  };

  const onSaveTile = (next: Tile) => {
    setTiles((prev) => prev.map((t) => (t.id === next.id ? next : t)));
    setEditing(null);
  };

  const onAddTile = () => {
    const count = tiles.length + 1;
    const newTile: Tile = {
      id: `custom-${Date.now()}`,
      title: `Tile ${count}`,
      href: "#",
      bgColor: "#1f2937",
      textColor: "#ffffff",
      rounded: "rounded-2xl",
    };
    setTiles((prev) => [...prev, newTile]);
  };

  const gridCols = useMemo(
    () => "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
    []
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Quick Launch</h1>
        <div className="flex items-center gap-2">
          {customize && (
            <button
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-slate-50"
              onClick={onAddTile}
            >
              Add Tile
            </button>
          )}
          <button
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-slate-50"
            onClick={() => setCustomize((v) => !v)}
          >
            {customize ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      {/* Tiles */}
      <div className={gridCols}>
        {tiles.map((t) => {
          const style: React.CSSProperties = {};
          if (t.bgImage) {
            style.backgroundImage = `url(${t.bgImage})`;
            style.backgroundSize = "cover";
            style.backgroundPosition = "center";
          } else if (t.bgColor) {
            style.backgroundColor = t.bgColor;
          }

          const tileInner = (
            <div
              className={[
                "min-h-[120px] p-4 border shadow-sm hover:shadow-md transition",
                t.rounded || "rounded-xl",
                t.bgImage ? "bg-black/20" : "",
              ].join(" ")}
              style={style}
            >
              <div
                className="text-lg font-semibold"
                style={{ color: t.textColor || "#fff" }}
              >
                {t.title}
              </div>
              <div
                className="mt-1 text-sm opacity-80"
                style={{ color: t.textColor || "#fff" }}
              >
                {t.href === "#" ? "Configure link…" : "Open"}
              </div>
            </div>
          );

          return (
            <div key={t.id} className="relative group">
              {t.href && t.href !== "#" ? (
                <Link href={t.href} className="block">
                  {tileInner}
                </Link>
              ) : (
                <div className="cursor-default">{tileInner}</div>
              )}

              {/* Edit badge when customizing */}
              {customize && (
                <button
                  className="absolute top-2 right-2 text-xs px-2 py-1 bg-white/90 border rounded shadow hover:bg-white"
                  onClick={() => onEditTile(t.id)}
                  title="Edit tile"
                >
                  Edit
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Editor modal */}
      {customize && editing && (
        <TileEditor
          tile={editing}
          onCancel={() => setEditing(null)}
          onSave={onSaveTile}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Tile Editor ───────────────────────── */
function TileEditor({
  tile,
  onCancel,
  onSave,
}: {
  tile: Tile;
  onCancel: () => void;
  onSave: (t: Tile) => void;
}) {
  const [draft, setDraft] = useState<Tile>(tile);

  useEffect(() => setDraft(tile), [tile]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl bg-white border shadow-lg">
        <div className="px-4 py-3 border-b font-medium">Edit Tile</div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-sm block mb-1">Title</label>
            <input
              className="w-full h-9 rounded-md border px-3 text-sm"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          <div className="col-span-2">
            <label className="text-sm block mb-1">Link (href)</label>
            <input
              className="w-full h-9 rounded-md border px-3 text-sm"
              value={draft.href}
              onChange={(e) => setDraft({ ...draft, href: e.target.value })}
              placeholder="/pasture"
            />
          </div>

          <div>
            <label className="text-sm block mb-1">Text color</label>
            <input
              className="w-full h-9 rounded-md border px-3 text-sm"
              value={draft.textColor || ""}
              onChange={(e) => setDraft({ ...draft, textColor: e.target.value })}
              placeholder="#ffffff"
            />
          </div>

          <div>
            <label className="text-sm block mb-1">Corner radius (class)</label>
            <input
              className="w-full h-9 rounded-md border px-3 text-sm"
              value={draft.rounded || "rounded-2xl"}
              onChange={(e) => setDraft({ ...draft, rounded: e.target.value })}
              placeholder="rounded-xl / rounded-2xl / rounded-full"
            />
          </div>

          <div>
            <label className="text-sm block mb-1">Background color</label>
            <input
              className="w-full h-9 rounded-md border px-3 text-sm"
              value={draft.bgColor || ""}
              onChange={(e) => setDraft({ ...draft, bgColor: e.target.value })}
              placeholder="#065f46 or hsl(160 80% 35%)"
            />
          </div>

          <div>
            <label className="text-sm block mb-1">Background image URL</label>
            <input
              className="w-full h-9 rounded-md border px-3 text-sm"
              value={draft.bgImage || ""}
              onChange={(e) => setDraft({ ...draft, bgImage: e.target.value })}
              placeholder="https://…/photo.jpg"
            />
            <div className="text-xs text-slate-500 mt-1">
              If provided, image overrides color.
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-t flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-slate-50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm border rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => onSave(draft)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight } from "lucide-react";

// Lazy-load heavy components so the dashboard loads instantly
const GrazingPlanner = dynamic(() => import("@/components/GrazingPlanner"), {
  loading: () => <SkeletonSection title="Grazing Planner" />,
  ssr: false,
});
const CattleByTag = dynamic(() => import("@/components/CattleByTag"), {
  loading: () => <SkeletonSection title="Cattle by Tag" />,
  ssr: false,
});
const FieldMap = dynamic(() => import("@/components/FieldMap"), {
  loading: () => <SkeletonSection title="Field Map" />,
  ssr: false,
});
const WeighRecords = dynamic(() => import("@/components/WeighRecords"), {
  loading: () => <SkeletonSection title="Weigh Records" />,
  ssr: false,
});
const SupplementCalc = dynamic(() => import("@/components/SupplementCalculator"), {
  loading: () => <SkeletonSection title="Supplement Calculator" />,
  ssr: false,
});

function SkeletonSection({ title }: { title: string }) {
  return (
    <div className="p-12 text-center">
      <div className="h-4 bg-muted rounded w-48 mx-auto mb-4"></div>
      <div className="text-muted-foreground">Loading {title}...</div>
    </div>
  );
}

export default function Dashboard({ params }: { params?: any }) {
  // Replace this with your real auth context / Supabase session
  const tenantId = "demo-tenant-123"; // ← get from your auth system

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["grazing"]));

  // Optional: persist open/close state
  useEffect(() => {
    const saved = localStorage.getItem("agriops-dashboard-open");
    if (saved) setOpenSections(new Set(JSON.parse(saved)));
  }, []);

  useEffect(() => {
    localStorage.setItem("agriops-dashboard-open", JSON.stringify([...openSections]));
  }, [openSections]);

  const toggle = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const SectionHeader = ({ id, title }: { id: string; title: string }) => (
    <button
      onClick={() => toggle(id)}
      className="w-full px-6 py-5 flex items-center justify-between hover:bg-accent/70 transition rounded-t-lg border-b"
    >
      <h2 className="text-2xl font-bold text-left">{title}</h2>
      {openSections.has(id) ? (
        <ChevronDown className="w-6 h-6" />
      ) : (
        <ChevronRight className="w-6 h-6" />
      )}
    </button>
  );

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="container max-w-7xl mx-auto p-4 pb-20">
          <div className="mb-8 text-center pt-6">
            <h1 className="text-4xl font-bold tracking-tight">AgriOps</h1>
            <p className="text-muted-foreground mt-2">Cattle & Pasture Operations — All in one place</p>
          </div>

          <div className="space-y-6">

            {/* 1. Grazing Planner */}
            <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader id="grazing" title="Grazing Rotation Planner" />
              {openSections.has("grazing") && (
                <div className="p-4 md:p-6 bg-card">
                  <GrazingPlanner tenantId={tenantId} />
                </div>
              )}
            </section>

            {/* 2. Cattle by Tag */}
            <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader id="cattle" title="Cattle by Tag #" />
              {openSections.has("cattle") && (
                <div className="p-4 md:p-6 bg-card">
                  <CattleByTag tenantId={tenantId} />
                </div>
              )}
            </section>

            {/* 3. Field / Pasture Map */}
            <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader id="map" title="Field & Pasture Map" />
              {openSections.has("map") && (
                <div className="p-4 md:p-6 bg-card">
                  <FieldMap tenantId={tenantId} />
                </div>
              )}
            </section>

            {/* 4. Weigh Records */}
            <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader id="weigh" title="Weigh Records & ADG" />
              {openSections.has("weigh") && (
                <div className="p-4 md:p-6 bg-card">
                  <WeighRecords tenantId={tenantId} />
                </div>
              )}
            </section>

            {/* 5. Supplement / Feed Calculator */}
            <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <SectionHeader id="supplement" title="Supplement & Hay Calculator" />
              {openSections.has("supplement") && (
                <div className="p-4 md:p-6 bg-card">
                  <SupplementCalc tenantId={tenantId} />
                </div>
              )}
            </section>

            {/* Add as many more as you want — they’ll all collapse/expand inline */}
          </div>
        </div>
      </div>
    </>
  );
}
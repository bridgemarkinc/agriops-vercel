"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import jsPDF from "jspdf";

/* ───────────────── Types ───────────────── */
type Animal = {
  id?: number;
  tenant_id: string;
  tag: string;
  name?: string | null;
  sex?: "M" | "F" | null;
  breed?: string | null;
  birth_date?: string | null;
  current_paddock?: string | null;
  status?: string | null;
  primary_photo_url?: string | null;
};

type Weight = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  weigh_date: string;
  weight_lb: number;
  notes?: string | null;
};

type Treatment = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  treat_date: string;
  product?: string | null;
  dose?: string | null;
  notes?: string | null;
};

type Processing = {
  id?: number;
  tenant_id: string;
  animal_id: number;
  tag: string;
  status: string;
  sent_date: string;
  processor?: string | null;
  transport_id?: string | null;
  live_weight_lb?: number | null;
  hot_carcass_weight_lb?: number | null;
  carcass_weight_lb?: number | null;
  grade?: string | null;
  yield_pct?: number | null;
  lot_code?: string | null;
  cut_sheet_url?: string | null;
  invoice_url?: string | null;
  notes?: string | null;
};

type PhotoRow = {
  id: number;
  tenant_id: string;
  animal_id: number;
  tag: string;
  photo_url: string;
  photo_path: string;
  is_primary: boolean;
  created_at: string;
  sort_order?: number;
};

type SignedUpload = {
  uploadUrl: string;
  path: string;
  publicUrl: string;
  method?: "PUT" | "POST";
  headers?: Record<string, string>;
};

/* ───────────────── Small utils ───────────────── */
function assert(ok: any, msg: string): asserts ok {
  if (!ok) throw new Error(msg);
}

async function api<T = unknown>(action: string, body?: any): Promise<T> {
  const res = await fetch("/api/cattle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(body || {}) }),
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`Bad JSON from /api/cattle: ${raw?.slice(0, 200) || "<empty>"}`);
  }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `HTTP ${res.status}: ${raw?.slice(0, 200)}`);
  }
  return json.data as T;
}

async function putFileToUrl(
  file: File,
  signed: SignedUpload
): Promise<void> {
  const method = signed.method || "PUT";
  const headers = signed.headers || {};
  if (!headers["Content-Type"]) {
    headers["Content-Type"] = file.type || "application/octet-stream";
  }
  const resp = await fetch(signed.uploadUrl, {
    method,
    headers,
    body: file,
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Upload PUT failed: ${resp.status} ${resp.statusText} ${txt}`);
  }
}

/* ───────────────── Component ───────────────── */
export default function CattleByTag({ tenantId }: { tenantId: string }) {
  // list/search
  const [search, setSearch] = useState("");
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(false);

  // edit
  const [editing, setEditing] = useState<Animal | null>(null);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [treats, setTreats] = useState<Treatment[]>([]);
  const [processing, setProcessing] = useState<Processing[]>([]);

  // photos
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [favForPdf, setFavForPdf] = useState<number | "primary" | null>("primary");

  // dropzone + progress
  const [dzActive, setDzActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0..100
  const [uploadTotals, setUploadTotals] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  // new animal draft
  const [draft, setDraft] = useState<Animal>({
    tenant_id: tenantId,
    tag: "",
    name: "",
    sex: undefined,
    breed: "",
    birth_date: "",
    current_paddock: "",
    status: "active",
  });

  // scanner
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanValue, setScanValue] = useState("");

  // CSV
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  // reports range
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // processing draft
  const [procDraft, setProcDraft] = useState<Partial<Processing>>({
    sent_date: "",
    processor: "",
    transport_id: "",
    live_weight_lb: undefined,
    notes: "",
  });

  /* loaders — ALL via /api/cattle */
  async function loadAnimals() {
    setLoading(true);
    try {
      const data = await api<Animal[]>("listAnimals", {
        tenant_id: tenantId,
        search: (search || "").trim() || null,
      });
      setAnimals(data || []);
    } catch (e: any) {
      alert(e.message || "Failed to load animals");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(animalId: number) {
    try {
      const [ws, ts] = await Promise.all([
        api<Weight[]>("listWeights", { tenant_id: tenantId, animal_id: animalId }),
        api<Treatment[]>("listTreatments", { tenant_id: tenantId, animal_id: animalId }),
      ]);
      setWeights(ws || []);
      setTreats(ts || []);
    } catch (e: any) {
      alert(e.message || "Failed to load animal details");
    }
  }

  async function loadProcessing(animalId: number) {
    try {
      const data = await api<Processing[]>("listProcessing", {
        tenant_id: tenantId,
        animal_id: animalId,
      });
      setProcessing(data || []);
    } catch (e: any) {
      alert(e.message || "Failed to load processing");
    }
  }

  async function loadPhotos(animalId: number) {
    try {
      const data = await api<PhotoRow[]>("listAnimalPhotos", {
        tenant_id: tenantId,
        animal_id: animalId,
      });
      setPhotos(data || []);
    } catch (e: any) {
      alert(e.message || "Failed to load photos");
    }
  }

  function startEdit(a: Animal) {
    setEditing(a);
    if (a.id) {
      loadDetail(a.id);
      loadProcessing(a.id);
      loadPhotos(a.id);
    }
  }

  useEffect(() => {
    loadAnimals().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    scanRef.current?.focus();
  }, [editing]);

  /* CRUD animals (server-only) */
  async function saveAnimal() {
    const tag = draft.tag.trim();
    if (!tag) return alert("Tag is required");
    try {
      await api("upsertAnimal", {
        payload: {
          tenant_id: tenantId,
          tag,
          name: draft.name || null,
          sex: draft.sex ? (draft.sex.toUpperCase() as "M" | "F") : null,
          breed: draft.breed || null,
          birth_date: draft.birth_date || null,
          current_paddock: draft.current_paddock || null,
          status: draft.status || null,
        },
      });
      setDraft({
        tenant_id: tenantId,
        tag: "",
        name: "",
        sex: undefined,
        breed: "",
        birth_date: "",
        current_paddock: "",
        status: "active",
      });
      await loadAnimals();
    } catch (e: any) {
      alert(e.message || "Failed to save animal");
    }
  }

  async function updateAnimal(a: Animal) {
    if (!a.id) return;
    try {
      await api("updateAnimal", {
        id: a.id,
        tenant_id: tenantId,
        patch: {
          name: a.name || null,
          sex: a.sex || null,
          breed: a.breed || null,
          birth_date: a.birth_date || null,
          current_paddock: a.current_paddock || null,
          status: a.status || null,
        },
      });
      await loadAnimals();
    } catch (e: any) {
      alert(e.message || "Failed to update animal");
    }
  }

  /* weights & treatments (server-only) */
  async function addWeight(
    animalId: number,
    weigh_date: string,
    weight_lb: number,
    notes?: string
  ) {
    if (!weigh_date || !weight_lb) return alert("Date and weight are required");
    try {
      await api("addWeight", {
        tenant_id: tenantId,
        animal_id: animalId,
        weigh_date,
        weight_lb,
        notes,
      });
      await loadDetail(animalId);
    } catch (e: any) {
      alert(e.message || "Failed to add weight");
    }
  }

  async function addTreatment(
    animalId: number,
    treat_date: string,
    product?: string,
    dose?: string,
    notes?: string
  ) {
    if (!treat_date) return alert("Date is required");
    try {
      await api("addTreatment", {
        tenant_id: tenantId,
        animal_id: animalId,
        treat_date,
        product,
        dose,
        notes,
      });
      await loadDetail(animalId);
    } catch (e: any) {
      alert(e.message || "Failed to add treatment");
    }
  }

  /* processing (server-only) */
  async function sendToProcessing() {
    if (!editing?.id) return;
    if (!procDraft.sent_date) return alert("Sent date is required");
    try {
      await api("sendToProcessing", {
        tenant_id: tenantId,
        animal_id: editing.id,
        tag: editing.tag,
        sent_date: procDraft.sent_date,
        processor: procDraft.processor || null,
        transport_id: procDraft.transport_id || null,
        live_weight_lb: procDraft.live_weight_lb ? Number(procDraft.live_weight_lb) : null,
        notes: procDraft.notes || null,
      });
      setProcDraft({
        sent_date: "",
        processor: "",
        transport_id: "",
        live_weight_lb: undefined,
        notes: "",
      });
      await Promise.all([loadAnimals(), loadProcessing(editing.id)]);
    } catch (e: any) {
      alert(e.message || "Failed to send to processing");
    }
  }

  async function updateProcessingRow(row: Processing, patch: Partial<Processing>) {
    try {
      await api("updateProcessing", { id: row.id, tenant_id: tenantId, patch });
      if (editing?.id) await loadProcessing(editing.id);
    } catch (e: any) {
      alert(e.message || "Failed to update processing");
    }
  }

  /* photos: upload via signed URL (server-only flow) */
  async function uploadPhotos(files: FileList) {
    if (!editing?.id) return;

    setUploading(true);
    setUploadTotals({ done: 0, total: files.length });
    setUploadProgress(0);

    const list = Array.from(files);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      try {
        const safeTag = (editing.tag || `id-${editing.id}`).replace(/[^a-z0-9_-]/gi, "_");
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

        // 1) Ask server for a signed upload URL (service role)
        const signed = await api<SignedUpload>("getSignedUploadUrl", {
          tenant_id: tenantId,
          tag: safeTag,
          file_ext: ext,
          content_type: file.type || "image/jpeg",
        });
        assert(signed && signed.uploadUrl && signed.path && signed.publicUrl, "Bad signed URL response");

        // 2) PUT the file to that URL directly from browser
        await putFileToUrl(file, signed);

        // 3) Record the photo row in DB (service role insert)
        await api("addAnimalPhoto", {
          tenant_id: tenantId,
          animal_id: editing.id,
          tag: editing.tag,
          photo_url: signed.publicUrl,
          photo_path: signed.path,
          set_primary: photos.length === 0 && i === 0,
        });
      } catch (e: any) {
        console.error(e);
        alert(`Upload failed: ${e.message || e}`);
        break; // stop on first failure
      }

      const done = i + 1;
      const total = list.length;
      setUploadTotals({ done, total });
      setUploadProgress(Math.round((done / total) * 100));
    }

    setUploading(false);
    setTimeout(() => {
      setUploadProgress(0);
      setUploadTotals({ done: 0, total: 0 });
    }, 800);

    if (editing?.id) {
      await loadPhotos(editing.id);
      await loadAnimals();
    }
  }

  async function setPrimaryPhoto(id: number, url: string) {
    if (!editing?.id) return;
    try {
      await api("setPrimaryPhoto", { tenant_id: tenantId, animal_id: editing.id, id });
      await loadPhotos(editing.id);
      await loadAnimals();
      setEditing((prev) => (prev ? { ...prev, primary_photo_url: url } : prev));
    } catch (e: any) {
      alert(e.message || "Failed to set primary photo");
    }
  }

  async function deletePhoto(p: PhotoRow) {
    if (!editing?.id) return;
    if (!confirm("Delete this photo?")) return;
    try {
      await api("deleteAnimalPhoto", {
        tenant_id: tenantId,
        animal_id: editing.id,
        id: p.id,
        photo_path: p.photo_path,
      });
      await loadPhotos(editing.id);
      await loadAnimals();
    } catch (e: any) {
      alert(e.message || "Failed to delete photo");
    }
  }

  // drag to reorder gallery
  function handleDragStart(idx: number) {
    setDragIndex(idx);
  }
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }
  async function handleDrop(idx: number) {
    if (dragIndex === null || dragIndex === idx) return;
    const next = [...photos];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(idx, 0, moved);
    setPhotos(next);
    setDragIndex(null);

    const ordered_ids = next.map((p) => p.id);
    try {
      await api("reorderAnimalPhotos", {
        tenant_id: tenantId,
        animal_id: editing?.id,
        ordered_ids,
      });
    } catch (e) {
      console.error(e);
      alert("Failed to save new order");
    }
  }

  /* CSV helpers (server bulk import stays the same) */
  function parseCSV(text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) return { header: [] as string[], rows: [] as string[][] };
    const splitRow = (line: string) =>
      (line.match(/("([^"]|"")*"|[^,]*)/g) || []).map((c) =>
        c.replace(/^"|"$/g, "").replace(/""/g, `"`)
      );
    const header = splitRow(lines[0]).map((h) => h.trim());
    const rows = lines.slice(1).map(splitRow);
    return { header, rows };
  }

  async function importCSV(file: File) {
    try {
      setImportBusy(true);
      setImportMsg(null);

      const text = await file.text();
      const { header, rows } = parseCSV(text);
      if (!header.length || rows.length === 0) {
        setImportMsg("CSV is empty or missing header");
        return;
      }
      const indexOf = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

      const mapped = rows
        .map((cols) => {
          const get = (n: string) => {
            const ix = indexOf(n);
            return ix >= 0 ? (cols[ix] || "").trim() : "";
          };
          const tag = (get("tag") || "").trim();
          if (!tag) return null;
          return {
            tenant_id: tenantId,
            tag,
            name: get("name") || null,
            sex: get("sex") ? get("sex").toUpperCase() : null,
            breed: get("breed") || null,
            birth_date: get("birth_date") || null,
            current_paddock: get("current_paddock") || null,
            status: get("status") || "active",
          };
        })
        .filter(Boolean) as any[];

      if (!mapped.length) {
        setImportMsg("No valid rows found (need a 'tag' column).");
        return;
      }

      setImportMsg(`Parsed ${mapped.length} rows, uploading…`);
      const res = await fetch("/api/cattle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulkUpsertAnimals", rows: mapped }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        setImportMsg(`Error: server responded ${res.status} ${res.statusText}`);
        return;
      }

      if (!res.ok || !json?.ok) {
        setImportMsg(`Error: ${json?.error || "import failed"}`);
        return;
      }

      setImportMsg(`Imported ${json.data?.imported ?? mapped.length} animals`);
      await loadAnimals();
    } catch (e: any) {
      console.error(e);
      setImportMsg(`Error: ${e.message || "failed to import"}`);
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function exportCSV() {
    const header = [
      "tenant_id",
      "tag",
      "name",
      "sex",
      "breed",
      "birth_date",
      "current_paddock",
      "status",
    ];
    const rows = animals.map((a) => [
      tenantId,
      a.tag ?? "",
      a.name ?? "",
      a.sex ?? "",
      a.breed ?? "",
      a.birth_date ?? "",
      a.current_paddock ?? "",
      a.status ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cattle_${tenantId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* scanner */
  function onScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const tag = scanValue.trim();
      if (!tag) return;
      const found = animals.find((a) => a.tag.toLowerCase() === tag.toLowerCase());
      if (found) startEdit(found);
      else alert(`No animal with tag: ${tag}`);
      setScanValue("");
    }
  }

  /* reports */
  const filteredWeights = useMemo(() => {
    let arr = weights;
    if (from) arr = arr.filter((w) => w.weigh_date >= from);
    if (to) arr = arr.filter((w) => w.weigh_date <= to);
    return [...arr].sort((a, b) => a.weigh_date.localeCompare(b.weigh_date));
  }, [weights, from, to]);

  const adg = useMemo(() => {
    if (filteredWeights.length < 2) return null;
    const first = filteredWeights[0];
    const last = filteredWeights[filteredWeights.length - 1];
    const days =
      (new Date(last.weigh_date).getTime() - new Date(first.weigh_date).getTime()) /
      86400000;
    if (days <= 0) return null;
    return (Number(last.weight_lb) - Number(first.weight_lb)) / days;
  }, [filteredWeights]);

  const treatmentSummary = useMemo(() => {
    const inRange = treats.filter(
      (t) => (!from || t.treat_date >= from) && (!to || t.treat_date <= to)
    );
    const map = new Map<string, number>();
    for (const t of inRange) {
      const key = (t.product || "Unspecified").trim();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([product, count]) => ({ product, count }));
  }, [treats, from, to]);

  /* PDF export */
  async function fetchImageAsDataURL(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Image fetch failed", e);
      return null;
    }
  }
  function formatDate(d?: string | null) {
    return d ? new Date(d).toISOString().slice(0, 10) : "";
  }
  async function exportAnimalPdf() {
    if (!editing) return;

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const marginX = 54, marginY = 54, line = 16;
    let y = marginY;

    let favorite: PhotoRow | undefined;
    if (favForPdf && favForPdf !== "primary") {
      favorite = photos.find((p) => p.id === favForPdf);
    } else {
      favorite = photos.find((p) => p.is_primary) || photos[0];
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor("#004225");
    doc.text(`Cattle Detail — ${editing.tag}`, marginX, y);
    y += line * 1.5;

    if (favorite?.photo_url) {
      const dataUrl = await fetchImageAsDataURL(favorite.photo_url);
      if (dataUrl) {
        const imgW = 200, imgH = 200;
        doc.addImage(dataUrl, "JPEG", marginX, y, imgW, imgH, undefined, "FAST");
        let tx = marginX + imgW + 16;
        let ty = y + 2;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const fields: [string, string | number | null | undefined][] = [
          ["Tag", editing.tag],
          ["Name", editing.name || ""],
          ["Sex", editing.sex || ""],
          ["Breed", editing.breed || ""],
          ["Birth Date", formatDate(editing.birth_date)],
          ["Paddock", editing.current_paddock || ""],
          ["Status", editing.status || ""],
        ];
        fields.forEach(([k, v]) => {
          doc.text(`${k}: ${String(v ?? "")}`, tx, ty);
          ty += line;
        });

        y += imgH + 24;
      } else {
        y += line;
      }
    } else {
      y += line;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor("#004225");
    doc.text("Weights", marginX, y);
    y += line;

    doc.setFont("helvetica", "normal");
    doc.setTextColor("#000000");
    const weightsToPrint = [...weights].sort((a, b) => a.weigh_date.localeCompare(b.weigh_date));
    if (weightsToPrint.length === 0) {
      doc.text("No weights on record.", marginX, y);
      y += line;
    } else {
      weightsToPrint.forEach((w) => {
        doc.text(
          `${formatDate(w.weigh_date)} — ${w.weight_lb} lb${w.notes ? " — " + w.notes : ""}`,
          marginX,
          y
        );
        y += line;
        if (y > 720) {
          doc.addPage();
          y = marginY;
        }
      });
    }

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor("#004225");
    doc.text("Treatments", marginX, y);
    y += line;

    doc.setFont("helvetica", "normal");
    doc.setTextColor("#000000");
    const treatsToPrint = [...treats].sort((a, b) => a.treat_date.localeCompare(b.treat_date));
    if (treatsToPrint.length === 0) {
      doc.text("No treatments on record.", marginX, y);
      y += line;
    } else {
      treatsToPrint.forEach((t) => {
        doc.text(
          `${formatDate(t.treat_date)} — ${t.product || "Unspecified"}${t.dose ? " — " + t.dose : ""}${
            t.notes ? " — " + t.notes : ""
          }`,
          marginX,
          y
        );
        y += line;
        if (y > 720) {
          doc.addPage();
          y = marginY;
        }
      });
    }

    y += 12;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor("#666");
    doc.text("Generated by AgriOps", marginX, y);

    doc.save(`cattle_${editing.tag}.pdf`);
  }

  /* ───────────────── Render ───────────────── */
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cattle by Tag</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add / Search / CSV / Scan */}
        <div className="grid lg:grid-cols-3 gap-3">
          {/* New animal */}
          <div className="border rounded-xl p-3 bg-white/70">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label>Tag *</Label>
                <Input
                  value={draft.tag}
                  onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                  placeholder="e.g., BR123"
                />
              </div>
              <div>
                <Label>Name</Label>
                <Input
                  value={draft.name || ""}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Sex</Label>
                <Input
                  value={draft.sex || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sex: (e.target.value.toUpperCase() as any) || undefined,
                    })
                  }
                  placeholder="M or F"
                />
              </div>
              <div>
                <Label>Breed</Label>
                <Input
                  value={draft.breed || ""}
                  onChange={(e) => setDraft({ ...draft, breed: e.target.value })}
                />
              </div>
              <div>
                <Label>Birth Date</Label>
                <Input
                  type="date"
                  value={draft.birth_date || ""}
                  onChange={(e) => setDraft({ ...draft, birth_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Paddock</Label>
                <Input
                  value={draft.current_paddock || ""}
                  onChange={(e) => setDraft({ ...draft, current_paddock: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input
                  value={draft.status || ""}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                  placeholder="active/sold/culled/dead"
                />
              </div>
              <div className="col-span-2">
                <Button onClick={saveAnimal} className="w-full">
                  Save Animal
                </Button>
              </div>
            </div>
          </div>

          {/* Search + Scanner + CSV */}
          <div className="lg:col-span-2 border rounded-xl p-3 bg-white/70">
            <div className="grid md:grid-cols-2 gap-2">
              <div>
                <Label>Search</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="Filter by tag (e.g., BR)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Button variant="outline" onClick={loadAnimals} disabled={loading}>
                    {loading ? "Loading…" : "Refresh"}
                  </Button>
                </div>
              </div>
              <div>
                <Label>Scan Tag (QR/Barcode)</Label>
                <input
                  ref={scanRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={onScanKeyDown}
                  placeholder="Focus here and scan; press Enter"
                  className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950/5"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-3 items-center">
              <Button variant="outline" onClick={exportCSV}>
                Export CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCSV(f);
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importBusy}
              >
                {importBusy ? "Importing…" : "Import CSV"}
              </Button>
              {importMsg && (
                <span className="text-sm ml-2">
                  {importMsg.startsWith("Error:") ? (
                    <span className="text-red-600">{importMsg}</span>
                  ) : (
                    <span className="text-green-700">{importMsg}</span>
                  )}
                </span>
              )}
            </div>

            {/* List (scrollable ~10 rows) */}
            <div className="mt-3 border rounded-lg">
              {/* Header row */}
              <div className="flex items-center justify-between px-2 py-2 bg-slate-50 border-b">
                <div className="text-sm font-medium">
                  Inventory: {animals.length} {animals.length === 1 ? "animal" : "animals"}
                </div>
                <div className="text-xs text-slate-500">
                  Showing ~10 rows — scroll to see more
                </div>
              </div>

              {/* Scroll container */}
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-2">Photo</th>
                      <th className="text-left p-2">Tag</th>
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Sex</th>
                      <th className="text-left p-2">Breed</th>
                      <th className="text-left p-2">Birth</th>
                      <th className="text-left p-2">Paddock</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2 w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animals.map((a) => (
                      <tr key={a.id || a.tag} className="border-t">
                        <td className="p-2">
                          {a.primary_photo_url ? (
                            <img
                              src={a.primary_photo_url}
                              alt={a.tag}
                              className="h-10 w-10 object-cover rounded-md border"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md border bg-slate-100 flex items-center justify-center text-[10px] text-slate-500">
                              No photo
                            </div>
                          )}
                        </td>
                        <td className="p-2 font-mono">{a.tag}</td>
                        <td className="p-2">{a.name}</td>
                        <td className="p-2">{a.sex}</td>
                        <td className="p-2">{a.breed}</td>
                        <td className="p-2">{a.birth_date}</td>
                        <td className="p-2">{a.current_paddock}</td>
                        <td className="p-2">{a.status}</td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => startEdit(a)}>
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {animals.length === 0 && (
                      <tr>
                        <td className="p-2" colSpan={9}>
                          No cattle yet. Add your first animal on the left.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Detail Drawer */}
        {editing && (
          <div className="border rounded-xl p-4 bg-white/80">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">
                Tag <span className="font-mono">{editing.tag}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                Close
              </Button>
            </div>

            {/* Edit animal info */}
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Sex</Label>
                <Input
                  value={editing.sex || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      sex: (e.target.value.toUpperCase() as any) || null,
                    })
                  }
                  placeholder="M or F"
                />
              </div>
              <div>
                <Label>Breed</Label>
                <Input
                  value={editing.breed || ""}
                  onChange={(e) => setEditing({ ...editing, breed: e.target.value })}
                />
              </div>
              <div>
                <Label>Birth Date</Label>
                <Input
                  type="date"
                  value={editing.birth_date || ""}
                  onChange={(e) => setEditing({ ...editing, birth_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Paddock</Label>
                <Input
                  value={editing.current_paddock || ""}
                  onChange={(e) => setEditing({ ...editing, current_paddock: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input
                  value={editing.status || ""}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                />
              </div>
              <div className="md:col-span-3">
                <Button onClick={() => updateAnimal(editing!)}>Save Changes</Button>
              </div>
            </div>

            {/* Photos: upload, dropzone, progress, gallery */}
            <div className="mt-6 border rounded-xl p-4 bg-white/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">Photos</div>
                <div className="flex items-center gap-2">
                  <label className="text-sm">
                    <span className="px-3 py-1 border rounded-md cursor-pointer bg-white hover:bg-slate-50">
                      {uploading ? "Uploading…" : "Upload Photos"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => e.target.files && uploadPhotos(e.target.files)}
                    />
                  </label>

                  <select
                    className="text-sm border rounded-md px-2 py-1"
                    value={String(favForPdf ?? "")}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFavForPdf(v === "primary" ? "primary" : Number(v));
                    }}
                    title="Photo to use on PDF"
                  >
                    <option value="primary">Use Primary Photo</option>
                    {photos.map((p) => (
                      <option value={p.id} key={p.id}>
                        #{p.id} {p.is_primary ? "(primary)" : ""}
                      </option>
                    ))}
                  </select>

                  <Button size="sm" onClick={exportAnimalPdf}>
                    Export PDF
                  </Button>
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!dzActive) setDzActive(true);
                }}
                onDragLeave={() => setDzActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDzActive(false);
                  const files = e.dataTransfer?.files;
                  if (files && files.length) uploadPhotos(files);
                }}
                className={[
                  "mt-3 w-full border-2 border-dashed rounded-xl p-6 text-center transition",
                  dzActive ? "bg-emerald-50 border-emerald-400" : "bg-white/70 border-slate-300",
                ].join(" ")}
              >
                <div className="text-sm text-slate-700">
                  Drag & drop images here, or click “Upload Photos”
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  JPG, PNG. You can also drag to reorder after uploading.
                </div>

                {uploading && (
                  <div className="mt-4">
                    <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-2 bg-emerald-600" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Uploading {uploadTotals.done}/{uploadTotals.total} ({uploadProgress}%)
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {photos.map((p, idx) => (
                  <div
                    key={p.id}
                    className="relative group cursor-move"
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(idx)}
                    title="Drag to reorder"
                  >
                    <img
                      src={p.photo_url}
                      alt={editing?.tag}
                      className={`h-28 w-full object-cover rounded-lg border ${
                        p.is_primary ? "ring-2 ring-emerald-500" : ""
                      }`}
                    />
                    <div className="absolute inset-x-1 bottom-1 flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition">
                      {!p.is_primary && (
                        <button
                          className="text-xs px-2 py-1 bg-white/90 border rounded"
                          onClick={() => setPrimaryPhoto(p.id, p.photo_url)}
                          title="Set as primary"
                        >
                          Set Primary
                        </button>
                      )}
                      <button
                        className="text-xs px-2 py-1 bg-white/90 border rounded text-red-700"
                        onClick={() => deletePhoto(p)}
                        title="Delete photo"
                      >
                        Delete
                      </button>
                    </div>
                    {p.is_primary && (
                      <div className="absolute top-1 left-1 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                        Primary
                      </div>
                    )}
                    <div className="absolute top-1 right-1 text-[10px] bg-white/90 border px-1 rounded opacity-0 group-hover:opacity-100">
                      ↕︎ drag
                    </div>
                  </div>
                ))}
                {photos.length === 0 && (
                  <div className="text-sm text-slate-600 col-span-full">
                    No photos yet. Use drag-and-drop or “Upload Photos” to add images.
                  </div>
                )}
              </div>
            </div>

            {/* Weights */}
            <div className="mt-6">
              <div className="font-medium mb-2">Weights</div>
              <WeightEditor
                tenantId={tenantId}
                animalId={editing.id!}
                onAdd={addWeight}
                weights={weights}
              />
            </div>

            {/* Treatments */}
            <div className="mt-6">
              <div className="font-medium mb-2">Treatments</div>
              <TreatEditor
                tenantId={tenantId}
                animalId={editing.id!}
                onAdd={addTreatment}
                treats={treats}
              />
            </div>

            {/* Processing */}
            <div className="mt-6 border rounded-xl p-4 bg-white/80">
              <div className="font-medium mb-2">Processing</div>
              <div className="grid md:grid-cols-5 gap-2">
                <div>
                  <Label>Sent Date</Label>
                  <Input
                    type="date"
                    value={procDraft.sent_date || ""}
                    onChange={(e) => setProcDraft({ ...procDraft, sent_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Processor</Label>
                  <Input
                    value={procDraft.processor || ""}
                    onChange={(e) => setProcDraft({ ...procDraft, processor: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Transport ID</Label>
                  <Input
                    value={procDraft.transport_id || ""}
                  onChange={(e) => setProcDraft({ ...procDraft, transport_id: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Live Weight (lb)</Label>
                  <Input
                    type="number"
                    value={procDraft.live_weight_lb ?? ""}
                    onChange={(e) =>
                      setProcDraft({ ...procDraft, live_weight_lb: Number(e.target.value || 0) })
                    }
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={procDraft.notes || ""}
                    onChange={(e) => setProcDraft({ ...procDraft, notes: e.target.value })}
                  />
                </div>
                <div className="md:col-span-5">
                  <Button onClick={sendToProcessing}>Send to Processing</Button>
                </div>
              </div>

              <div className="overflow-auto mt-3 border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Processor</th>
                      <th className="text-left p-2">Live Wt</th>
                      <th className="text-left p-2">Notes</th>
                      <th className="text-right p-2 w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processing.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.sent_date}</td>
                        <td className="p-2">{r.status}</td>
                        <td className="p-2">{r.processor}</td>
                        <td className="p-2">{r.live_weight_lb}</td>
                        <td className="p-2">{r.notes}</td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateProcessingRow(r, {
                                status: r.status === "scheduled" ? "in_transit" : "scheduled",
                              })
                            }
                          >
                            Toggle Status
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {processing.length === 0 && (
                      <tr>
                        <td className="p-2" colSpan={6}>
                          No processing records yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reports */}
            <div className="mt-6">
              <div className="font-medium mb-2">Reports (date range)</div>
              <div className="grid md:grid-cols-3 gap-2 mb-3">
                <div>
                  <Label>From</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label>To</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => {}}>
                    Apply
                  </Button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="border rounded-lg p-3 bg-white/60">
                  <div className="font-semibold mb-1">Average Daily Gain (ADG)</div>
                  {adg !== null ? (
                    <div className="text-sm">
                      ADG: <b>{adg.toFixed(2)}</b> lb/day
                    </div>
                  ) : (
                    <div className="text-sm">Not enough weight records in range.</div>
                  )}
                  <div className="text-xs text-slate-600 mt-1">
                    ADG uses earliest and latest weights in the selected date range.
                  </div>
                </div>

                <div className="border rounded-lg p-3 bg-white/60">
                  <div className="font-semibold mb-1">Treatments Summary</div>
                  <div className="text-sm">
                    {treatmentSummary.length ? (
                      <ul className="list-disc ml-4">
                        {treatmentSummary.map((t) => (
                          <li key={t.product}>{t.product}: {t.count}</li>
                        ))}
                      </ul>
                    ) : (
                      "No treatments in range."
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────────── Subcomponents ───────────────── */

function WeightEditor({
  tenantId,
  animalId,
  onAdd,
  weights,
}: {
  tenantId: string;
  animalId: number;
  onAdd: (animalId: number, date: string, weight: number, notes?: string) => Promise<void>;
  weights: Weight[];
}) {
  const [date, setDate] = useState("");
  const [w, setW] = useState<number | string>("");
  const [notes, setNotes] = useState("");

  return (
    <div className="border rounded-lg p-3 bg-white/60">
      <div className="grid md:grid-cols-4 gap-2">
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Weight (lb)</Label>
          <Input
            type="number"
            value={w}
            onChange={(e) => setW(e.target.value)}
            placeholder="e.g., 1200"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="md:col-span-4">
          <Button onClick={() => onAdd(animalId, date, Number(w || 0), notes || undefined)}>
            Add Weight
          </Button>
        </div>
      </div>

      <div className="overflow-auto mt-3 border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Weight (lb)</th>
              <th className="text-left p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {weights.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.weigh_date}</td>
                <td className="p-2">{r.weight_lb}</td>
                <td className="p-2">{r.notes}</td>
              </tr>
            ))}
            {weights.length === 0 && (
              <tr>
                <td className="p-2" colSpan={3}>
                  No weights added yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TreatEditor({
  tenantId,
  animalId,
  onAdd,
  treats,
}: {
  tenantId: string;
  animalId: number;
  onAdd: (animalId: number, date: string, product?: string, dose?: string, notes?: string) => Promise<void>;
  treats: Treatment[];
}) {
  const [date, setDate] = useState("");
  const [product, setProduct] = useState("");
  const [dose, setDose] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="border rounded-lg p-3 bg-white/60">
      <div className="grid md:grid-cols-5 gap-2">
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Product</Label>
          <Input value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <div>
          <Label>Dose</Label>
          <Input value={dose} onChange={(e) => setDose(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="md:col-span-5">
          <Button onClick={() => onAdd(animalId, date, product || undefined, dose || undefined, notes || undefined)}>
            Add Treatment
          </Button>
        </div>
      </div>

      <div className="overflow-auto mt-3 border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Product</th>
              <th className="text-left p-2">Dose</th>
              <th className="text-left p-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {treats.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.treat_date}</td>
                <td className="p-2">{r.product}</td>
                <td className="p-2">{r.dose}</td>
                <td className="p-2">{r.notes}</td>
              </tr>
            ))}
            {treats.length === 0 && (
              <tr>
                <td className="p-2" colSpan={4}>
                  No treatments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.heic,.heif,.webp,.mp4,.mov,.pdf,.docx,.txt,.mp3,.m4a";
const ACCEPTED_MIME = new Set([
  "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
  "video/mp4", "video/quicktime",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain", "audio/mpeg", "audio/mp4",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = "all" | "photo" | "video";

interface AssetSummary {
  id: string;
  filename: string;
  file_type: "photo" | "video" | "audio" | "document";
  mime_type: string;
  size_bytes: number;
  captured_at: string | null;
  ingested_at: string;
  thumbnail_path: string | null;
  lat: number | null;
  lon: number | null;
}

interface AssetDetail extends AssetSummary {
  camera_make: string | null;
  camera_model: string | null;
  metadata_json: Record<string, unknown> | null;
  tags: { key: string; value: string; confidence: number | null; source: string }[];
  faces: { id: string; cluster_id: string | null; bbox: unknown }[];
}

type FileStatus = "pending" | "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMonthYear(dateStr: string | null): string {
  if (!dateStr) return "Unknown date";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sortByDate(a: AssetSummary, b: AssetSummary): number {
  const da = new Date(a.captured_at ?? a.ingested_at).getTime();
  const db = new Date(b.captured_at ?? b.ingested_at).getTime();
  return db - da;
}

function groupByMonth(assets: AssetSummary[]): [string, AssetSummary[]][] {
  const map = new Map<string, AssetSummary[]>();
  for (const a of assets) {
    const key = formatMonthYear(a.captured_at ?? a.ingested_at);
    const bucket = map.get(key) ?? [];
    bucket.push(a);
    map.set(key, bucket);
  }
  return Array.from(map.entries());
}

function filterAccepted(files: FileList | File[]): File[] {
  return Array.from(files).filter((f) => ACCEPTED_MIME.has(f.type) || f.type === "");
}

function xhrUpload(file: File, onProgress: (pct: number) => void): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error((body.detail as string) ?? `HTTP ${xhr.status}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.open("POST", `${API_URL}/api/v1/ingest`);
    xhr.send(form);
  });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="px-8 pt-8 space-y-8">
      {[1, 2].map((g) => (
        <div key={g}>
          <div className="h-4 w-32 bg-white/8 rounded mb-4 animate-pulse" />
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-1">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="aspect-square bg-white/6 rounded animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-8">
      <svg className="w-14 h-14 text-white/15 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p className="text-white/50 text-base font-medium">No media yet</p>
      <p className="text-white/25 text-sm mt-1 mb-5">Photos and videos will appear here</p>
      <button
        onClick={onUpload}
        className="px-4 py-2 rounded-lg bg-white/8 hover:bg-white/12 text-white/60 hover:text-white text-sm transition-colors"
      >
        Upload files
      </button>
    </div>
  );
}

// ─── Media tile ───────────────────────────────────────────────────────────────

function MediaTile({ asset, onClick }: { asset: AssetSummary; onClick: () => void }) {
  const isPhoto = asset.file_type === "photo";

  if (isPhoto) {
    return (
      <button
        onClick={onClick}
        className="relative aspect-square overflow-hidden rounded bg-[#1a1a1a] group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${API_URL}/api/v1/assets/${asset.id}/thumbnail`}
          alt={asset.filename}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-end p-1.5">
          <span className="text-white text-[10px] leading-tight truncate w-full text-left">
            {formatDate(asset.captured_at ?? asset.ingested_at)}
          </span>
        </div>
      </button>
    );
  }

  // Video tile
  return (
    <button
      onClick={onClick}
      className="relative aspect-square overflow-hidden rounded bg-[#1a1a1a] group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 flex items-center justify-center"
    >
      <div className="flex flex-col items-center gap-2">
        <div className="w-9 h-9 rounded-full bg-white/15 group-hover:bg-white/20 transition-colors flex items-center justify-center">
          <svg className="w-4 h-4 text-white/70 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-end p-1.5">
        <span className="text-white text-[10px] leading-tight truncate w-full text-left">
          {asset.filename}
        </span>
      </div>
    </button>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/assets/${assetId}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => {});
  }, [assetId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isPhoto = detail?.file_type === "photo";

  return (
    <div className="fixed inset-0 z-50 flex bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative m-auto flex w-full max-w-6xl max-h-[90vh] rounded-xl overflow-hidden bg-[#111] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white/60 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Media area */}
        <div className="flex-1 flex items-center justify-center bg-black min-h-[400px]">
          {isPhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`${API_URL}/api/v1/assets/${assetId}/thumbnail`}
              alt={detail?.filename ?? ""}
              className="max-h-[90vh] max-w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 text-white/30">
              <div className="w-20 h-20 rounded-full bg-white/8 flex items-center justify-center">
                <svg className="w-10 h-10 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="text-sm">{detail?.filename}</p>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <aside className="w-72 shrink-0 flex flex-col overflow-y-auto border-l border-white/8 bg-[#0f0f0f] p-5 gap-5">
          {!detail ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-4 bg-white/8 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">Filename</p>
                <p className="text-sm text-white break-all">{detail.filename}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">Type</p>
                <p className="text-sm text-white capitalize">{detail.file_type}</p>
              </div>
              <div>
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">Date</p>
                <p className="text-sm text-white">
                  {detail.captured_at ? new Date(detail.captured_at).toLocaleString() : "—"}
                </p>
              </div>
              {(detail.camera_make || detail.camera_model) && (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">Camera</p>
                  <p className="text-sm text-white">
                    {[detail.camera_make, detail.camera_model].filter(Boolean).join(" ")}
                  </p>
                </div>
              )}
              {detail.lat != null && (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">Location</p>
                  <p className="text-sm text-white font-mono">
                    {detail.lat.toFixed(5)}, {detail.lon?.toFixed(5)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1">Size</p>
                <p className="text-sm text-white">{formatBytes(detail.size_bytes)}</p>
              </div>
              {detail.tags.length > 0 && (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-white/8 text-white/60">
                        {t.key}: {t.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Drag overlay ─────────────────────────────────────────────────────────────

function DragOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 pointer-events-none">
      <p className="text-2xl font-semibold text-white tracking-wide">Drop files into your vault</p>
      <p className="text-sm text-white/40 mt-2">Photos · Videos</p>
    </div>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

function UploadModal({
  initialFiles,
  onClose,
  onComplete,
}: {
  initialFiles: File[];
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const [items, setItems] = useState<UploadItem[]>(() =>
    initialFiles.map((f) => ({ id: crypto.randomUUID(), file: f, status: "pending", progress: 0 }))
  );
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !uploading) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, uploading]);

  function addFiles(files: FileList | File[]) {
    const accepted = filterAccepted(files);
    setItems((prev) => [
      ...prev,
      ...accepted.map((f) => ({ id: crypto.randomUUID(), file: f, status: "pending" as FileStatus, progress: 0 })),
    ]);
  }

  async function startUpload() {
    setUploading(true);
    let ok = true;
    for (const item of items) {
      if (item.status === "done") continue;
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "uploading", progress: 0 } : i));
      try {
        await xhrUpload(item.file, (pct) => {
          setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, progress: pct } : i));
        });
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "done", progress: 100 } : i));
      } catch (err) {
        ok = false;
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "error", error: (err as Error).message } : i));
      }
    }
    setUploading(false);
    setAllDone(true);
    if (ok) { await onComplete(); onClose(); }
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={() => { if (!uploading) onClose(); }}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/10">
          <span className="font-medium text-gray-900">
            {uploading
              ? `Uploading ${doneCount + 1} of ${items.length}…`
              : allDone
              ? `Done — ${doneCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`
              : `${items.length} file${items.length !== 1 ? "s" : ""} selected`}
          </span>
          {!uploading && (
            <button onClick={onClose} className="p-1 rounded hover:bg-black/6 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {items.length === 0 && (
          <div
            className="mx-5 my-5 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-10 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-500 text-sm font-medium">Drop files here or click to browse</p>
            <p className="text-gray-400 text-xs mt-1.5">JPG · PNG · HEIC · WebP · MP4 · MOV</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="overflow-y-auto max-h-64 px-5 py-3 space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="w-7 h-7 shrink-0 flex items-center justify-center">
                  {item.status === "done" && (
                    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {item.status === "error" && (
                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  {item.status === "uploading" && (
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                  )}
                  {item.status === "pending" && (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-200" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm text-gray-800 truncate">{item.file.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{formatBytes(item.file.size)}</span>
                  </div>
                  {item.status === "error" && (
                    <p className="text-xs text-red-500 mt-0.5 truncate">{item.error}</p>
                  )}
                  {(item.status === "uploading" || item.status === "pending") && (
                    <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-400 rounded-full transition-all duration-150" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                </div>
                {item.status === "pending" && !uploading && (
                  <button
                    onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                    className="shrink-0 p-1 text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-4 border-t border-black/10 flex items-center justify-between gap-3">
          {!uploading && !allDone ? (
            <button onClick={() => fileInputRef.current?.click()} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              + Add more
            </button>
          ) : <span />}
          {allDone ? (
            <button onClick={async () => { await onComplete(); onClose(); }} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors">
              Close
            </button>
          ) : (
            <button
              onClick={startUpload}
              disabled={uploading || items.length === 0}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? "Uploading…" : `Upload ${items.length} file${items.length !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

// ─── Floating button ──────────────────────────────────────────────────────────

function FloatingUploadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Upload files"
      className="fixed bottom-6 right-6 z-40 w-13 h-13 rounded-full bg-white text-black shadow-lg hover:bg-white/90 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
    >
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadInitialFiles, setUploadInitialFiles] = useState<File[]>([]);
  const [draggingOver, setDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  const loadAssets = useCallback(async () => {
    try {
      const [photoRes, videoRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/assets?file_type=photo&page=1&page_size=200`),
        fetch(`${API_URL}/api/v1/assets?file_type=video&page=1&page_size=200`),
      ]);
      const [photoData, videoData] = await Promise.all([photoRes.json(), videoRes.json()]);
      const merged = [...(photoData.items ?? []), ...(videoData.items ?? [])].sort(sortByDate);
      setAssets(merged);
    } catch {
      // backend unreachable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragCounterRef.current += 1;
      setDraggingOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget !== null) return;
      dragCounterRef.current = 0;
      setDraggingOver(false);
    };
    const onDragOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDraggingOver(false);
      if (!e.dataTransfer?.files.length) return;
      const accepted = filterAccepted(e.dataTransfer.files);
      if (!accepted.length) return;
      setUploadInitialFiles(accepted);
      setShowUploadModal(true);
    };
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  const openUploadModal = useCallback(() => {
    setUploadInitialFiles([]);
    setShowUploadModal(true);
  }, []);

  const filtered = filter === "all" ? assets : assets.filter((a) => a.file_type === filter);
  const groups = groupByMonth(filtered);

  return (
    <>
      {/* Filter pills */}
      <div className="flex items-center gap-2 px-8 pt-6 pb-2">
        {(["all", "photo", "video"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? "bg-white text-black"
                : "bg-white/8 text-white/50 hover:bg-white/12 hover:text-white"
            }`}
          >
            {f === "all" ? "All" : f === "photo" ? "Photos" : "Videos"}
          </button>
        ))}
        {!loading && (
          <span className="ml-auto text-xs text-white/25">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonGrid />
      ) : filtered.length === 0 ? (
        <EmptyState onUpload={openUploadModal} />
      ) : (
        <div className="px-8 py-6 space-y-10">
          {groups.map(([month, group]) => (
            <section key={month}>
              <h2 className="text-xs font-semibold text-white/30 mb-3 tracking-widest uppercase">
                {month}
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-1">
                {group.map((a) => (
                  <MediaTile key={a.id} asset={a} onClick={() => setSelectedId(a.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selectedId && <DetailModal assetId={selectedId} onClose={() => setSelectedId(null)} />}

      {showUploadModal && (
        <UploadModal
          initialFiles={uploadInitialFiles}
          onClose={() => setShowUploadModal(false)}
          onComplete={loadAssets}
        />
      )}

      <DragOverlay visible={draggingOver && !showUploadModal} />
      <FloatingUploadButton onClick={openUploadModal} />
    </>
  );
}

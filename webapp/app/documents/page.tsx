"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ACCEPTED_EXTENSIONS =
  ".pdf,.docx,.doc,.odt,.txt,.md,.html,.jpg,.jpeg,.png,.heic,.webp,.mp4,.mov,.mp3,.m4a";

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.oasis.opendocument.text",
  "text/plain", "text/markdown", "text/html",
  "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
  "video/mp4", "video/quicktime",
  "audio/mpeg", "audio/mp4",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetSummary {
  id: string;
  filename: string;
  file_type: string;
  mime_type: string;
  size_bytes: number;
  captured_at: string | null;
  ingested_at: string;
  thumbnail_path: string | null;
  lat: number | null;
  lon: number | null;
  metadata_json: { summary?: string; text_length?: number; [key: string]: unknown } | null;
}

interface AssetDetail extends AssetSummary {
  camera_make: string | null;
  camera_model: string | null;
  tags: { key: string; value: string; confidence: number | null; source: string }[];
  faces: unknown[];
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function filterAccepted(files: FileList | File[]): File[] {
  return Array.from(files).filter((f) => ACCEPTED_MIME.has(f.type) || f.type === "");
}

function xhrUpload(
  file: File,
  onProgress: (pct: number) => void
): Promise<Record<string, unknown>> {
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
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log("[troy-vault] ingest response:", body);
        resolve(body);
      } else {
        console.error("[troy-vault] ingest error:", xhr.status, body);
        reject(new Error((body.detail as string) ?? `HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("timeout", () => reject(new Error("Request timed out")));

    xhr.open("POST", `${API_URL}/api/v1/ingest`);
    xhr.send(form);
  });
}

// ─── File icon ────────────────────────────────────────────────────────────────

function FileIcon({ mime, filename }: { mime: string; filename: string }) {
  const lower = filename.toLowerCase();
  const isPdf = mime === "application/pdf" || lower.endsWith(".pdf");
  const isDocx = mime.includes("wordprocessingml") || lower.endsWith(".docx") || lower.endsWith(".doc");
  const isTxt = mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md");

  if (isPdf) {
    return (
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/15 text-red-400 shrink-0 text-[10px] font-bold tracking-wide">
        PDF
      </span>
    );
  }
  if (isDocx) {
    return (
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/15 text-blue-400 shrink-0 text-[10px] font-bold tracking-wide">
        DOC
      </span>
    );
  }
  if (isTxt) {
    return (
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 text-white/40 shrink-0 text-[10px] font-bold tracking-wide">
        TXT
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/8 text-white/30 shrink-0">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="px-8 pt-8 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-[#1a1a1a] animate-pulse">
          <div className="w-9 h-9 rounded-lg bg-white/10 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-white/10 rounded w-48" />
            <div className="h-3 bg-white/8 rounded w-72" />
          </div>
          <div className="h-3 bg-white/10 rounded w-16" />
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8">
      <svg className="w-14 h-14 text-white/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-white/60 text-lg font-medium">No documents yet</p>
      <p className="text-white/30 text-sm mt-1 mb-5">Drop some files to get started</p>
      <button
        onClick={onUpload}
        className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white/70 hover:text-white text-sm transition-colors"
      >
        Select files
      </button>
    </div>
  );
}

// ─── Drag overlay ─────────────────────────────────────────────────────────────

function DragOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 pointer-events-none">
      <p className="text-2xl font-semibold text-white tracking-wide">Drop files into your vault</p>
      <p className="text-sm text-white/50 mt-2">PDFs · DOCX · TXT · and more</p>
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
    initialFiles.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: "pending",
      progress: 0,
    }))
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

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function startUpload() {
    setUploading(true);
    let allSucceeded = true;

    for (const item of items) {
      if (item.status === "done") continue;
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "uploading", progress: 0 } : i));
      try {
        await xhrUpload(item.file, (pct) => {
          setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, progress: pct } : i));
        });
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "done", progress: 100 } : i));
      } catch (err) {
        allSucceeded = false;
        setItems((prev) => prev.map((i) =>
          i.id === item.id ? { ...i, status: "error", error: (err as Error).message } : i
        ));
      }
    }

    setUploading(false);
    setAllDone(true);
    if (allSucceeded) {
      await onComplete();
      onClose();
    }
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/10">
          <span className="font-medium text-gray-900">
            {uploading
              ? `Uploading ${doneCount + 1} of ${items.length}…`
              : allDone
              ? `Done — ${doneCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`
              : `${items.length} file${items.length !== 1 ? "s" : ""} selected`}
          </span>
          {!uploading && (
            <button onClick={onClose} className="p-1 rounded-md hover:bg-black/8 text-gray-400 hover:text-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Drop zone */}
        {items.length === 0 && (
          <div
            className="mx-5 my-5 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-10 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-500 text-sm font-medium">Drop files here or click to browse</p>
            <p className="text-gray-400 text-xs mt-2">PDF · DOCX · TXT · MD · and more</p>
          </div>
        )}

        {/* File list */}
        {items.length > 0 && (
          <div className="overflow-y-auto max-h-72 px-5 py-3 space-y-2">
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
                    <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
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
                      <div
                        className="h-full bg-gray-400 rounded-full transition-all duration-150"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                {item.status === "pending" && !uploading && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="shrink-0 p-1 rounded text-gray-300 hover:text-gray-500 transition-colors"
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

        {/* Footer */}
        <div className="px-5 py-4 border-t border-black/10 flex items-center justify-between gap-3">
          {!uploading && !allDone ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              + Add more
            </button>
          ) : <span />}
          {allDone ? (
            <button
              onClick={async () => { await onComplete(); onClose(); }}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors"
            >
              Close
            </button>
          ) : (
            <button
              onClick={startUpload}
              disabled={uploading || items.length === 0}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? "Uploading…" : `Upload ${items.length > 0 ? items.length : ""} file${items.length !== 1 ? "s" : ""}`}
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

// ─── Floating upload button ───────────────────────────────────────────────────

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

// ─── Detail side panel ────────────────────────────────────────────────────────

function DetailPanel({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);

  useEffect(() => {
    setDetail(null);
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

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-50 h-full w-80 bg-[#111] border-l border-white/10 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <span className="text-sm font-medium text-white/80">Details</span>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/8 text-white/40 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {!detail ? (
            <div className="space-y-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-4 bg-white/10 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Filename</p>
                <p className="text-sm text-white break-all">{detail.filename}</p>
              </div>
              <div>
                <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Type</p>
                <p className="text-sm text-white/70">{detail.mime_type}</p>
              </div>
              <div>
                <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Ingested</p>
                <p className="text-sm text-white">{formatDate(detail.ingested_at)}</p>
              </div>
              <div>
                <p className="text-xs text-white/30 uppercase tracking-wider mb-1">File size</p>
                <p className="text-sm text-white">{formatBytes(detail.size_bytes)}</p>
              </div>
              {detail.metadata_json?.text_length != null && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Text length</p>
                  <p className="text-sm text-white">
                    {Number(detail.metadata_json.text_length).toLocaleString()} chars
                  </p>
                </div>
              )}
              {detail.metadata_json?.summary && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Summary</p>
                  <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                    {String(detail.metadata_json.summary)}
                  </p>
                </div>
              )}
              {detail.tags.length > 0 && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/60">
                        {t.key}: {t.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────

function DocumentRow({ asset, onClick }: { asset: AssetSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl bg-[#111] hover:bg-[#1a1a1a] transition-colors text-left group"
    >
      <FileIcon mime={asset.mime_type} filename={asset.filename} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{asset.filename}</p>
        {asset.metadata_json?.summary ? (
          <p className="text-xs text-white/40 mt-0.5 line-clamp-1">
            {asset.metadata_json.summary}
          </p>
        ) : (
          <p className="text-xs text-white/30 mt-0.5">{asset.mime_type}</p>
        )}
      </div>

      <div className="shrink-0 text-right hidden sm:block">
        <p className="text-xs text-white/40">{formatDate(asset.ingested_at)}</p>
        <p className="text-xs text-white/25 mt-0.5">{formatBytes(asset.size_bytes)}</p>
      </div>

      <svg
        className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors shrink-0"
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadInitialFiles, setUploadInitialFiles] = useState<File[]>([]);
  const [draggingOver, setDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  const loadAssets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/assets?file_type=document&page=1&page_size=100`);
      const data = await res.json();
      setAssets(data.items ?? []);
    } catch {
      // backend unreachable — show empty state silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // Global drag listeners
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
      if (accepted.length === 0) return;
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

  const closePanel = useCallback(() => setSelectedId(null), []);

  return (
    <>
      {loading ? (
        <SkeletonList />
      ) : assets.length === 0 ? (
        <EmptyState onUpload={openUploadModal} />
      ) : (
        <div className="px-8 py-8">
          <h1 className="text-base font-medium text-white/50 mb-5 tracking-wide">
            {assets.length} document{assets.length !== 1 ? "s" : ""}
          </h1>
          <div className="space-y-1.5">
            {assets.map((a) => (
              <DocumentRow key={a.id} asset={a} onClick={() => setSelectedId(a.id)} />
            ))}
          </div>
        </div>
      )}

      {selectedId && <DetailPanel assetId={selectedId} onClose={closePanel} />}

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

"use client";

import { createContext, useContext, useState, useRef, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UploadMode = "media" | "docs";

interface UploadContextValue {
  openUpload: (mode: UploadMode) => void;
}

const UploadContext = createContext<UploadContextValue>({ openUpload: () => {} });

export function useUpload() {
  return useContext(UploadContext);
}

// ─── MIME / accept config ─────────────────────────────────────────────────────

const MEDIA_MIME = new Set([
  "image/jpeg", "image/png", "image/heic", "image/webp",
  "video/mp4", "video/quicktime",
]);
const DOCS_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.oasis.opendocument.text",
  "text/plain", "text/markdown", "text/html",
]);

const MEDIA_ACCEPT = ".jpg,.jpeg,.png,.heic,.webp,.mp4,.mov";
const DOCS_ACCEPT = ".pdf,.docx,.doc,.odt,.txt,.md,.html";

function filterAccepted(files: FileList | File[], mode: UploadMode): File[] {
  const allowed = mode === "media" ? MEDIA_MIME : DOCS_MIME;
  return Array.from(files).filter((f) => allowed.has(f.type) || f.type === "");
}

// ─── Upload helpers ───────────────────────────────────────────────────────────

type FileStatus = "pending" | "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function xhrUpload(file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let detail = `HTTP ${xhr.status}`;
        try { detail = JSON.parse(xhr.responseText).detail ?? detail; } catch { /* ignore */ }
        reject(new Error(detail));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.open("POST", `${API_URL}/api/v1/ingest`);
    xhr.send(form);
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function UploadModal({
  mode,
  onClose,
}: {
  mode: UploadMode;
  onClose: () => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const accept = mode === "media" ? MEDIA_ACCEPT : DOCS_ACCEPT;
  const label = mode === "media" ? "Photos & Videos" : "Documents";
  const hint = mode === "media" ? "JPG · PNG · HEIC · MP4 · MOV" : "PDF · DOCX · TXT · MD";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !uploading) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, uploading]);

  function addFiles(files: FileList | File[]) {
    const accepted = filterAccepted(files, mode);
    setItems((prev) => [
      ...prev,
      ...accepted.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        status: "pending" as FileStatus,
        progress: 0,
      })),
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
    if (ok) onClose();
  }

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => { if (!uploading) onClose(); }}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-medium text-gray-900">
            {uploading
              ? `Uploading ${doneCount + 1} of ${items.length}…`
              : allDone
              ? `Done — ${doneCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`
              : `Upload ${label}`}
          </span>
          {!uploading && (
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Drop zone */}
        {items.length === 0 && (
          <div
            className="mx-5 my-5 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-10 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-500 text-sm font-medium">Drop files here or click to browse</p>
            <p className="text-gray-400 text-xs mt-1.5">{hint}</p>
          </div>
        )}

        {/* File list */}
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

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          {!uploading && !allDone ? (
            <button onClick={() => fileInputRef.current?.click()} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              + Add more
            </button>
          ) : <span />}
          {allDone ? (
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors">
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
        accept={accept}
        className="hidden"
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<UploadMode | null>(null);

  return (
    <UploadContext.Provider value={{ openUpload: setMode }}>
      {children}
      {mode && <UploadModal mode={mode} onClose={() => setMode(null)} />}
    </UploadContext.Provider>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.doc,.odt,.txt,.md,.html,.mp3,.m4a,.wav,.aac,.jpg,.jpeg,.png,.heic,.webp,.mp4,.mov";
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.oasis.opendocument.text",
  "text/plain", "text/markdown", "text/html",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/aac",
  "image/jpeg", "image/png", "image/heic", "image/webp",
  "video/mp4", "video/quicktime",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

type TabType = "all" | "document" | "audio";
type SortKey = "date" | "name" | "size" | "type";

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
  metadata_json: { summary?: string; text_length?: number } | null;
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
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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

function typeBadge(mime: string): { label: string; cls: string } {
  if (mime === "application/pdf") return { label: "PDF", cls: "bg-red-50 text-red-600 border border-red-100" };
  if (mime.includes("word") || mime.includes("document")) return { label: "DOC", cls: "bg-blue-50 text-blue-600 border border-blue-100" };
  if (mime.startsWith("audio/")) return { label: "Audio", cls: "bg-violet-50 text-violet-600 border border-violet-100" };
  if (mime.startsWith("text/")) return { label: "TXT", cls: "bg-gray-100 text-gray-500 border border-gray-200" };
  return { label: "File", cls: "bg-gray-100 text-gray-500 border border-gray-200" };
}

// ─── Waveform placeholder ─────────────────────────────────────────────────────

function WaveformBar() {
  const bars = [3, 6, 9, 5, 12, 8, 4, 11, 7, 5, 9, 6, 3, 8, 10, 6, 4, 7, 9, 5, 11, 7, 3, 8, 6];
  return (
    <div className="flex items-center gap-px h-5">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-violet-300"
          style={{ height: `${h * 4}%`, minHeight: 2 }}
        />
      ))}
    </div>
  );
}

// ─── File icon ────────────────────────────────────────────────────────────────

function FileIcon({ mime }: { mime: string }) {
  if (mime === "application/pdf") {
    return (
      <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
        <span className="text-[9px] font-bold text-red-500">PDF</span>
      </div>
    );
  }
  if (mime.includes("word") || mime.includes("document")) {
    return (
      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
        <span className="text-[9px] font-bold text-blue-500">DOC</span>
      </div>
    );
  }
  if (mime.startsWith("audio/")) {
    return (
      <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );
}

// ─── File row ─────────────────────────────────────────────────────────────────

function FileRow({
  asset,
  selected,
  checked,
  onSelect,
  onCheck,
}: {
  asset: AssetSummary & { _type: "document" | "audio" };
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheck: () => void;
}) {
  const summary = asset.metadata_json?.summary;
  const badge = typeBadge(asset.mime_type);

  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer transition-colors ${
        selected ? "bg-gray-100" : "hover:bg-gray-50"
      }`}
    >
      {/* Checkbox */}
      <div
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); onCheck(); }}
      >
        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
          checked ? "bg-gray-900 border-gray-900" : "border-gray-300 bg-white"
        }`}>
          {checked && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>

      <FileIcon mime={asset.mime_type} />

      {/* Name & subtitle */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 truncate font-medium">{asset.filename}</p>
        {asset._type === "audio" ? (
          <div className="mt-1 w-32">
            <WaveformBar />
          </div>
        ) : summary ? (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{summary}</p>
        ) : (
          <p className="text-xs text-gray-300 mt-0.5">{asset.mime_type}</p>
        )}
      </div>

      {/* Type badge */}
      <span className={`hidden md:inline-flex shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${badge.cls}`}>
        {badge.label}
      </span>

      {/* Date & size */}
      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 min-w-[80px]">
        <span className="text-xs text-gray-400">{formatDate(asset.ingested_at)}</span>
        <span className="text-xs text-gray-300">{formatBytes(asset.size_bytes)}</span>
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ assetId, onClose }: { assetId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);

  useEffect(() => {
    setDetail(null);
    fetch(`${API_URL}/api/v1/assets/${assetId}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => {});
  }, [assetId]);

  return (
    <aside className="w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Info</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-5 flex flex-col gap-5">
        {!detail ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Filename</p>
              <p className="text-sm text-gray-900 break-all">{detail.filename}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Type</p>
              <p className="text-sm text-gray-700 capitalize">{detail.file_type}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Ingested</p>
              <p className="text-sm text-gray-700">{formatDate(detail.ingested_at)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Size</p>
              <p className="text-sm text-gray-700">{formatBytes(detail.size_bytes)}</p>
            </div>
            {detail.file_type === "document" && detail.metadata_json?.text_length != null && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Characters</p>
                <p className="text-sm text-gray-700">{(detail.metadata_json.text_length as number).toLocaleString()}</p>
              </div>
            )}
            {detail.metadata_json?.summary && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Summary</p>
                <p className="text-sm text-gray-600 leading-relaxed">{String(detail.metadata_json.summary)}</p>
              </div>
            )}
            {detail.tags.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.tags.map((t, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 border border-gray-200">
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
  );
}

// ─── Drag overlay ─────────────────────────────────────────────────────────────

function DragOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white/90 pointer-events-none">
      <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center mb-4">
        <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>
      <p className="text-lg font-semibold text-gray-800">Drop files into your vault</p>
      <p className="text-sm text-gray-400 mt-1">Documents · Audio</p>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => { if (!uploading) onClose(); }}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-medium text-gray-900">
            {uploading
              ? `Uploading ${doneCount + 1} of ${items.length}…`
              : allDone
              ? `Done — ${doneCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ""}`
              : `${items.length} file${items.length !== 1 ? "s" : ""} selected`}
          </span>
          {!uploading && (
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
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
            <p className="text-gray-400 text-xs mt-1.5">PDF · DOCX · TXT · MP3 · M4A</p>
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

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
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
      className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const [documents, setDocuments] = useState<AssetSummary[]>([]);
  const [audioFiles, setAudioFiles] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadInitialFiles, setUploadInitialFiles] = useState<File[]>([]);
  const [draggingOver, setDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  const loadAssets = useCallback(async () => {
    try {
      const [docRes, audioRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/assets?file_type=document&page=1&page_size=200`),
        fetch(`${API_URL}/api/v1/assets?file_type=audio&page=1&page_size=200`),
      ]);
      const [docData, audioData] = await Promise.all([docRes.json(), audioRes.json()]);
      setDocuments(docData.items ?? []);
      setAudioFiles(audioData.items ?? []);
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

  function toggleCheck(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allItems = [
    ...documents.map((d) => ({ ...d, _type: "document" as const })),
    ...audioFiles.map((a) => ({ ...a, _type: "audio" as const })),
  ];

  function applySort(items: typeof allItems) {
    return [...items].sort((a, b) => {
      if (sort === "date") return new Date(b.ingested_at).getTime() - new Date(a.ingested_at).getTime();
      if (sort === "name") return a.filename.localeCompare(b.filename);
      if (sort === "size") return b.size_bytes - a.size_bytes;
      if (sort === "type") return a.mime_type.localeCompare(b.mime_type);
      return 0;
    });
  }

  const visibleItems = applySort(
    tab === "all" ? allItems :
    tab === "document" ? documents.map((d) => ({ ...d, _type: "document" as const })) :
    audioFiles.map((a) => ({ ...a, _type: "audio" as const }))
  );

  return (
    <div className="flex h-full bg-white">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <h1 className="text-base font-semibold text-gray-900 mr-2">Files</h1>

          {/* Tabs */}
          <div className="flex items-center gap-1">
            {(["all", "document", "audio"] as TabType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  tab === t
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                {t === "all" ? "All" : t === "document" ? "Documents" : "Audio"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {selectedIds.size > 0 && (
              <span className="text-xs text-gray-500 font-medium">{selectedIds.size} selected</span>
            )}
            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-gray-400 cursor-pointer"
            >
              <option value="date">Date Added</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="type">Type</option>
            </select>
          </div>
        </div>

        {/* Column header */}
        {!loading && visibleItems.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 mx-2">
            <div className="w-4 shrink-0" />
            <div className="w-8 shrink-0" />
            <span className="flex-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Name</span>
            <span className="hidden md:block w-16 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-center">Type</span>
            <span className="hidden sm:block w-28 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Date</span>
            <span className="hidden sm:block w-16 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right">Size</span>
          </div>
        )}

        {/* List */}
        <div className="flex-1 px-2 py-2">
          {loading ? (
            <div className="space-y-1 px-2 pt-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-4 shrink-0" />
                  <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-gray-50 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-8">
              <svg className="w-12 h-12 text-gray-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500 text-base font-medium">No files yet</p>
              <p className="text-gray-400 text-sm mt-1 mb-5">Documents and audio will appear here</p>
              <button
                onClick={openUploadModal}
                className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-700 text-white text-sm transition-colors"
              >
                Upload files
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {visibleItems.map((item) => (
                <FileRow
                  key={item.id}
                  asset={item}
                  selected={selectedId === item.id}
                  checked={selectedIds.has(item.id)}
                  onSelect={() => setSelectedId(item.id === selectedId ? null : item.id)}
                  onCheck={() => toggleCheck(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedId && (
        <DetailPanel assetId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {showUploadModal && (
        <UploadModal
          initialFiles={uploadInitialFiles}
          onClose={() => setShowUploadModal(false)}
          onComplete={loadAssets}
        />
      )}

      <DragOverlay visible={draggingOver && !showUploadModal} />
      <FloatingUploadButton onClick={openUploadModal} />
    </div>
  );
}

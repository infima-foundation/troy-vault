"use client";

import { useEffect, useState, useCallback } from "react";


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
}

interface AssetDetail extends AssetSummary {
  camera_make: string | null;
  camera_model: string | null;
  metadata_json: { summary?: string; text_length?: number; [key: string]: unknown } | null;
  tags: { key: string; value: string; confidence: number | null; source: string }[];
  faces: unknown[];
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
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── File icon ────────────────────────────────────────────────────────────────

function FileIcon({ mime, filename }: { mime: string; filename: string }) {
  const lower = filename.toLowerCase();
  const isPdf = mime === "application/pdf" || lower.endsWith(".pdf");
  const isDocx =
    mime.includes("wordprocessingml") || lower.endsWith(".docx") || lower.endsWith(".doc");
  const isTxt = mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md");

  if (isPdf) {
    return (
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/15 text-red-400 shrink-0 text-[10px] font-bold">
        PDF
      </span>
    );
  }
  if (isDocx) {
    return (
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/15 text-blue-400 shrink-0 text-[10px] font-bold">
        DOC
      </span>
    );
  }
  if (isTxt) {
    return (
      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 text-white/40 shrink-0 text-[10px] font-bold">
        TXT
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/8 text-white/30 shrink-0">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8">
      <svg className="w-14 h-14 text-white/20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-white/60 text-lg font-medium">No documents yet</p>
      <p className="text-white/30 text-sm mt-1">Drop some files to get started</p>
    </div>
  );
}

// ─── Side panel ───────────────────────────────────────────────────────────────

function DetailPanel({
  assetId,
  onClose,
}: {
  assetId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/assets/${assetId}`
        );
        const data = await res.json();
        setDetail(data);
      } catch {
        // backend unreachable — panel stays in loading skeleton
      }
    };
    load();
  }, [assetId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="fixed top-0 right-0 z-50 h-full w-80 bg-[#111] border-l border-white/10 flex flex-col shadow-2xl">
        {/* Header */}
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

        {/* Content */}
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
                  <p className="text-sm text-white/70 leading-relaxed">
                    {String(detail.metadata_json.summary)}
                  </p>
                </div>
              )}

              {detail.tags.length > 0 && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map((t, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/60"
                      >
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

// ─── Row ──────────────────────────────────────────────────────────────────────

function DocumentRow({
  asset,
  onClick,
}: {
  asset: AssetSummary & { metadata_json?: { summary?: string } | null };
  onClick: () => void;
}) {
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
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/assets?file_type=document&page=1&page_size=50`
        );
        const data = await res.json();
        setAssets(data.items ?? []);
      } catch {
        // backend unreachable — show empty state silently
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const closePanel = useCallback(() => setSelectedId(null), []);

  if (loading) return <SkeletonList />;
  if (assets.length === 0) return <EmptyState />;

  return (
    <div className="px-8 py-8">
      <h1 className="text-base font-medium text-white/50 mb-5 tracking-wide">
        {assets.length} document{assets.length !== 1 ? "s" : ""}
      </h1>

      <div className="space-y-1.5">
        {assets.map((a) => (
          <DocumentRow key={a.id} asset={a} onClick={() => setSelectedId(a.id)} />
        ))}
      </div>

      {selectedId && <DetailPanel assetId={selectedId} onClose={closePanel} />}
    </div>
  );
}

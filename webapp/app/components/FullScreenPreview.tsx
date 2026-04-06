"use client";

import { useEffect, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface AssetPreview {
  id: string;
  filename: string;
  file_type: "photo" | "video" | "audio" | "document";
  mime_type: string;
  size_bytes: number;
  captured_at: string | null;
  ingested_at: string;
  thumbnail_path: string | null;
  lat?: number | null;
  lon?: number | null;
  camera_make?: string | null;
  camera_model?: string | null;
  tags?: { key: string; value: string; source: string }[];
  metadata_json?: Record<string, unknown> | null;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

interface Props {
  assets: AssetPreview[];
  initialIndex: number;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

export function FullScreenPreview({ assets, initialIndex, onClose, onDelete }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [showInfo, setShowInfo] = useState(false);
  const [detail, setDetail] = useState<AssetPreview | null>(null);

  const asset = assets[index];

  const prev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : i)), []);
  const next = useCallback(() => setIndex((i) => (i < assets.length - 1 ? i + 1 : i)), [assets.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  // Fetch detailed info when info panel opens
  useEffect(() => {
    if (!showInfo || !asset) return;
    fetch(`${API_URL}/api/v1/assets/${asset.id}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch(() => {});
  }, [showInfo, asset]);

  // Reset index when initialIndex changes
  useEffect(() => { setIndex(initialIndex); }, [initialIndex]);

  async function handleDelete() {
    if (!asset) return;
    if (!confirm(`Move "${asset.filename}" to trash?`)) return;
    try {
      await fetch(`${API_URL}/api/v1/assets/${asset.id}`, { method: "DELETE" });
      onDelete?.(asset.id);
      if (assets.length <= 1) {
        onClose();
      } else if (index >= assets.length - 1) {
        setIndex(index - 1);
      }
    } catch { /* ignore */ }
  }

  function handleDownload() {
    if (!asset) return;
    const a = document.createElement("a");
    a.href = `${API_URL}/api/v1/assets/${asset.id}/file`;
    a.download = asset.filename;
    a.click();
  }

  if (!asset) return null;

  const isVideo = asset.file_type === "video";
  const isPhoto = asset.file_type === "photo";
  const hasPrev = index > 0;
  const hasNext = index < assets.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Close (Esc)"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Download"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            className="p-2 rounded-full bg-white/10 hover:bg-red-500/60 text-white transition-colors"
            title="Delete (move to trash)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/50 transition-colors cursor-not-allowed"
            title="Share (coming soon)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main media area */}
      <div className="flex-1 flex items-center justify-center relative min-h-0">
        {/* Left arrow */}
        {hasPrev && (
          <button
            onClick={prev}
            className="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Media */}
        <div className="w-full h-full flex items-center justify-center p-16">
          {isPhoto && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`${API_URL}/api/v1/assets/${asset.id}/thumbnail`}
              alt={asset.filename}
              className="max-w-full max-h-full object-contain"
            />
          )}
          {isVideo && (
            <video
              src={`${API_URL}/api/v1/assets/${asset.id}/file`}
              controls
              className="max-w-full max-h-full"
              autoPlay
            />
          )}
          {!isPhoto && !isVideo && (
            <div className="flex flex-col items-center gap-4 text-white/60">
              <svg className="w-20 h-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg">{asset.filename}</p>
            </div>
          )}
        </div>

        {/* Right arrow */}
        {hasNext && (
          <button
            onClick={next}
            className="absolute right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Counter */}
        {assets.length > 1 && (
          <div className="absolute top-16 right-6 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs">
            {index + 1} / {assets.length}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 bg-gradient-to-t from-black/90 to-transparent px-6 pt-6 pb-4">
        <div className="flex items-end justify-between">
          <div className="min-w-0">
            <p className="text-white font-medium text-sm truncate">{asset.filename}</p>
            <p className="text-white/50 text-xs mt-0.5">
              {asset.captured_at ? formatDate(asset.captured_at) : "No date"}
            </p>
          </div>
          <button
            onClick={() => setShowInfo((v) => !v)}
            className={`shrink-0 ml-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
              showInfo ? "bg-white/20 text-white" : "bg-white/10 hover:bg-white/20 text-white/70"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Info
          </button>
        </div>

        {/* Info panel — slides up */}
        {showInfo && (
          <div className="mt-4 rounded-xl bg-white/10 backdrop-blur-sm p-4 space-y-3">
            {!detail ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-3 bg-white/10 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <div>
                  <p className="text-white/40 uppercase tracking-widest text-[10px] mb-0.5">Filename</p>
                  <p className="text-white/80 break-all">{detail.filename}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase tracking-widest text-[10px] mb-0.5">Size</p>
                  <p className="text-white/80">{formatBytes(detail.size_bytes)}</p>
                </div>
                {detail.captured_at && (
                  <div>
                    <p className="text-white/40 uppercase tracking-widest text-[10px] mb-0.5">Date Taken</p>
                    <p className="text-white/80">{formatDate(detail.captured_at)}</p>
                  </div>
                )}
                {(detail.camera_make || detail.camera_model) && (
                  <div>
                    <p className="text-white/40 uppercase tracking-widest text-[10px] mb-0.5">Camera</p>
                    <p className="text-white/80">{[detail.camera_make, detail.camera_model].filter(Boolean).join(" ")}</p>
                  </div>
                )}
                {detail.lat != null && detail.lon != null && (
                  <div>
                    <p className="text-white/40 uppercase tracking-widest text-[10px] mb-0.5">GPS</p>
                    <p className="text-white/80 font-mono">{detail.lat.toFixed(5)}, {detail.lon.toFixed(5)}</p>
                  </div>
                )}
                {detail.tags && detail.tags.length > 0 && (
                  <div className="col-span-2">
                    <p className="text-white/40 uppercase tracking-widest text-[10px] mb-1.5">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.tags.map((t, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-[11px] bg-white/10 text-white/70">
                          {t.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

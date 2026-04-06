"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-5 flex flex-col gap-3 border border-white/6">
      <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center text-white/40">
        {icon}
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-14 bg-white/8 rounded animate-pulse" />
          <div className="h-3 w-20 bg-white/5 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-semibold text-white tracking-tight">{value}</p>
          <p className="text-xs text-white/35 mt-0.5">{label}</p>
        </div>
      )}
    </div>
  );
}

// ─── Recent tile ──────────────────────────────────────────────────────────────

function RecentTile({ asset }: { asset: AssetSummary }) {
  const ext = asset.filename.split(".").pop()?.toUpperCase() ?? "FILE";

  return (
    <div className="shrink-0 w-[120px] flex flex-col gap-2 cursor-default">
      <div className="w-[120px] h-[120px] rounded-xl overflow-hidden bg-[#1a1a1a] border border-white/6 relative flex items-center justify-center">
        {asset.file_type === "photo" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`${API_URL}/api/v1/assets/${asset.id}/thumbnail`}
            alt={asset.filename}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : asset.file_type === "video" ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-white/50 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className="text-[10px] text-white/25 font-mono">{ext}</span>
          </div>
        ) : asset.file_type === "audio" ? (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className="text-[10px] text-white/25 font-mono">{ext}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[10px] text-white/25 font-mono">{ext}</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-white/60 truncate">{asset.filename}</p>
        <p className="text-[10px] text-white/25 mt-0.5">{formatDate(asset.ingested_at)}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<AssetSummary[]>([]);
  const [counts, setCounts] = useState({ photos: 0, videos: 0, documents: 0, storageBytes: 0 });

  const load = useCallback(async () => {
    try {
      const [recentRes, photoRes, videoRes, docRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/assets?page=1&page_size=8`),
        fetch(`${API_URL}/api/v1/assets?file_type=photo&page=1&page_size=1`),
        fetch(`${API_URL}/api/v1/assets?file_type=video&page=1&page_size=1`),
        fetch(`${API_URL}/api/v1/assets?file_type=document&page=1&page_size=1`),
      ]);

      const [recentData, photoData, videoData, docData] = await Promise.all([
        recentRes.json(),
        photoRes.json(),
        videoRes.json(),
        docRes.json(),
      ]);

      const items: AssetSummary[] = recentData.items ?? [];
      setRecent(items);
      setCounts({
        photos: photoData.total ?? 0,
        videos: videoData.total ?? 0,
        documents: docData.total ?? 0,
        storageBytes: items.reduce((s, a) => s + a.size_bytes, 0),
      });
    } catch {
      // backend unreachable — leave zeroes
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    inputRef.current?.focus();
  }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero */}
      <div className="flex flex-col items-center pt-20 pb-14 px-6">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-white/15 mb-10">
          troy-vault
        </p>
        <form onSubmit={handleSearch} className="w-full max-w-2xl">
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/25 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What are you looking for today?"
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-2xl pl-12 pr-14 py-4 text-white placeholder-white/20 text-base focus:outline-none focus:border-white/20 focus:bg-[#1d1d1d] transition-colors"
            />
            {query && (
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
              >
                Search
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Stat cards */}
      <div className="px-8 mb-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl">
          <StatCard
            label="Total Photos"
            value={counts.photos.toLocaleString()}
            loading={loading}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <StatCard
            label="Total Videos"
            value={counts.videos.toLocaleString()}
            loading={loading}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            }
          />
          <StatCard
            label="Total Documents"
            value={counts.documents.toLocaleString()}
            loading={loading}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
          <StatCard
            label="Storage Used"
            value={loading ? "—" : formatBytes(counts.storageBytes)}
            loading={loading}
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Recently added */}
      <div className="px-8 pb-12">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/25 mb-4">
          Recently Added
        </h2>

        {loading ? (
          <div className="flex gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shrink-0 w-[120px]">
                <div className="w-[120px] h-[120px] rounded-xl bg-white/5 animate-pulse" />
                <div className="mt-2 h-3 w-20 bg-white/5 rounded animate-pulse" />
                <div className="mt-1.5 h-2.5 w-12 bg-white/4 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-white/25 text-sm">Your vault is empty — upload something to get started.</p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-8 px-8">
            {recent.map((asset) => (
              <RecentTile key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

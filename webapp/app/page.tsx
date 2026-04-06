"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROFILE_KEY = "troy_profile";

interface AssetSummary {
  id: string;
  filename: string;
  file_type: "photo" | "video" | "audio" | "document";
  mime_type: string;
  size_bytes: number;
  captured_at: string | null;
  ingested_at: string;
  thumbnail_path: string | null;
}

function greeting(name: string): string {
  const h = new Date().getHours();
  const time = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return name ? `Good ${time}, ${name}` : `Good ${time}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  loading,
  icon,
}: {
  label: string;
  value: string;
  loading: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3 shadow-sm">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
        {icon}
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-12 bg-gray-100 rounded animate-pulse" />
          <div className="h-3.5 w-20 bg-gray-50 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
          <p className="text-sm text-gray-500 mt-0.5">{label}</p>
        </div>
      )}
    </div>
  );
}

// ─── Recent tile ──────────────────────────────────────────────────────────────

function RecentTile({ asset }: { asset: AssetSummary }) {
  const ext = asset.filename.split(".").pop()?.toUpperCase() ?? "";

  return (
    <div className="shrink-0 w-[130px] flex flex-col gap-2 group cursor-default">
      <div className="w-[130px] h-[100px] rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative flex items-center justify-center">
        {asset.file_type === "photo" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`${API_URL}/api/v1/assets/${asset.id}/thumbnail`}
            alt={asset.filename}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        ) : asset.file_type === "video" ? (
          <div className="flex flex-col items-center gap-1.5 text-gray-400">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] font-medium text-gray-400">{ext}</span>
          </div>
        ) : asset.file_type === "audio" ? (
          <div className="flex flex-col items-center gap-1.5 text-gray-400">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span className="text-[10px] font-medium text-gray-400">{ext}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-gray-400">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[10px] font-medium text-gray-400">{ext}</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-gray-700 truncate font-medium">{asset.filename}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(asset.ingested_at)}</p>
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
  const [userName, setUserName] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) setUserName(JSON.parse(raw).name || "");
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    try {
      const [recentRes, photoRes, videoRes, docRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/assets?page=1&page_size=6`),
        fetch(`${API_URL}/api/v1/assets?file_type=photo&page=1&page_size=1`),
        fetch(`${API_URL}/api/v1/assets?file_type=video&page=1&page_size=1`),
        fetch(`${API_URL}/api/v1/assets?file_type=document&page=1&page_size=1`),
      ]);
      const [recentData, photoData, videoData, docData] = await Promise.all([
        recentRes.json(), photoRes.json(), videoRes.json(), docRes.json(),
      ]);
      const items: AssetSummary[] = recentData.items ?? [];
      setRecent(items);
      setCounts({
        photos: photoData.total ?? 0,
        videos: videoData.total ?? 0,
        documents: docData.total ?? 0,
        storageBytes: items.reduce((s: number, a: AssetSummary) => s + a.size_bytes, 0),
      });
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); inputRef.current?.focus(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="min-h-full bg-white">
      {/* Hero */}
      <div className="max-w-3xl mx-auto px-8 pt-16 pb-10">
        <h1 className="text-2xl font-semibold text-gray-900 mb-8">
          {greeting(userName)}
        </h1>

        {/* Search */}
        <form onSubmit={handleSearch}>
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your vault or ask TROY anything…"
              className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-14 py-4 text-gray-900 placeholder-gray-400 text-sm shadow-sm focus:outline-none focus:border-gray-400 focus:shadow-md transition-all"
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </div>
        </form>
      </div>

      {/* Stats */}
      <div className="max-w-3xl mx-auto px-8 mb-10">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Photos" value={counts.photos.toLocaleString()} loading={loading} icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          } />
          <StatCard label="Videos" value={counts.videos.toLocaleString()} loading={loading} icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          } />
          <StatCard label="Documents" value={counts.documents.toLocaleString()} loading={loading} icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          } />
          <StatCard label="Storage" value={loading ? "—" : formatBytes(counts.storageBytes)} loading={loading} icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          } />
        </div>
      </div>

      {/* Recently added */}
      <div className="max-w-3xl mx-auto px-8 pb-16">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Recently Added</h2>
        {loading ? (
          <div className="flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="shrink-0 w-[130px]">
                <div className="w-[130px] h-[100px] rounded-xl bg-gray-100 animate-pulse" />
                <div className="mt-2 h-3 w-20 bg-gray-100 rounded animate-pulse" />
                <div className="mt-1.5 h-2.5 w-12 bg-gray-50 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-400">Nothing added yet — upload something to get started.</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-8 px-8">
            {recent.map((a) => <RecentTile key={a.id} asset={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}

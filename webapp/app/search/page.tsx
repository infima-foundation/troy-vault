"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, term }: { text: string; term: string }) {
  if (!term.trim()) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${escapeRegex(term)})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark key={i} className="bg-yellow-100 text-yellow-800 rounded-sm px-0.5 not-italic">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ─── Result tiles (photo grid) ────────────────────────────────────────────────

function PhotoTile({ asset, query }: { asset: AssetSummary; query: string }) {
  return (
    <div className="flex flex-col gap-1.5 group">
      <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 relative">
        {asset.thumbnail_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${API_URL}/api/v1/assets/${asset.id}/thumbnail`}
            alt={asset.filename}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {asset.file_type === "video" ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              )}
            </svg>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-700 truncate font-medium">
        <Highlighted text={asset.filename} term={query} />
      </p>
      <p className="text-[11px] text-gray-400">{formatDate(asset.captured_at ?? asset.ingested_at)}</p>
    </div>
  );
}

// ─── Result rows (docs/audio) ─────────────────────────────────────────────────

function FileRow({ asset, query }: { asset: AssetSummary; query: string }) {
  const typeColors: Record<string, string> = {
    document: "bg-orange-50 text-orange-600 border-orange-100",
    audio: "bg-violet-50 text-violet-600 border-violet-100",
  };
  const typeLabel: Record<string, string> = {
    document: "Doc",
    audio: "Audio",
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors group">
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
        {asset.file_type === "audio" ? (
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          <Highlighted text={asset.filename} term={query} />
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDate(asset.captured_at ?? asset.ingested_at)} · {formatBytes(asset.size_bytes)}
        </p>
      </div>

      <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${typeColors[asset.file_type] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
        {typeLabel[asset.file_type] ?? asset.file_type}
      </span>
    </div>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function ResultGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</h2>
        <span className="text-xs text-gray-400 tabular-nums">{count}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Inner content (needs useSearchParams) ────────────────────────────────────

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQ);
  const [submitted, setSubmitted] = useState(initialQ);
  const [results, setResults] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSubmitted(trimmed);
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(`${API_URL}/api/v1/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      setResults(data.items ?? []);
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  // Auto-search on mount if q is in URL
  useEffect(() => {
    if (initialQ) doSearch(initialQ);
    else inputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
    doSearch(q);
  }

  // Group results
  const mediaItems = results.filter((a) => a.file_type === "photo" || a.file_type === "video");
  const docItems = results.filter((a) => a.file_type === "document");
  const audioItems = results.filter((a) => a.file_type === "audio");

  const hasResults = results.length > 0;

  return (
    <div className="min-h-full bg-white">
      <div className="max-w-2xl mx-auto px-6 pt-12 pb-16">
        {/* Search bar */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filenames, tags, locations…"
              className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-10 py-3.5 text-gray-900 placeholder-gray-400 text-sm shadow-sm focus:outline-none focus:border-gray-400 focus:shadow-md transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); setSubmitted(""); setResults([]); inputRef.current?.focus(); }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {/* Results */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-400">Searching your vault…</p>
          </div>
        ) : !submitted ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-12 h-12 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-gray-400 text-sm">Search across all your files</p>
          </div>
        ) : !hasResults ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-12 h-12 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-sm text-gray-500">
              No results for <span className="font-medium text-gray-700">&ldquo;{submitted}&rdquo;</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Try a different keyword or check spelling</p>
          </div>
        ) : (
          <div className="space-y-8">
            <p className="text-xs text-gray-400">
              {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
              <span className="font-medium text-gray-600">&ldquo;{submitted}&rdquo;</span>
            </p>

            {/* Photos & Videos */}
            {mediaItems.length > 0 && (
              <ResultGroup title="Photos & Videos" count={mediaItems.length}>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {mediaItems.map((a) => <PhotoTile key={a.id} asset={a} query={submitted} />)}
                </div>
              </ResultGroup>
            )}

            {/* Documents */}
            {docItems.length > 0 && (
              <ResultGroup title="Documents" count={docItems.length}>
                <div className="space-y-0.5">
                  {docItems.map((a) => <FileRow key={a.id} asset={a} query={submitted} />)}
                </div>
              </ResultGroup>
            )}

            {/* Audio */}
            {audioItems.length > 0 && (
              <ResultGroup title="Audio" count={audioItems.length}>
                <div className="space-y-0.5">
                  {audioItems.map((a) => <FileRow key={a.id} asset={a} query={submitted} />)}
                </div>
              </ResultGroup>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page (Suspense wrapper required for useSearchParams) ─────────────────────

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-white" />}>
      <SearchContent />
    </Suspense>
  );
}

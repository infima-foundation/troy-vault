"use client";

import { useEffect, useRef, useState, useCallback } from "react";


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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Wrap every occurrence of `term` in the string with a <mark> element. */
function Highlighted({ text, term }: { text: string; term: string }) {
  if (!term.trim()) return <span>{text}</span>;

  const parts = text.split(new RegExp(`(${escapeRegex(term)})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Result item ─────────────────────────────────────────────────────────────

function ResultItem({ asset, query }: { asset: AssetSummary; query: string }) {
  const isPhoto = asset.file_type === "photo";
  const isVideo = asset.file_type === "video";
  const isAudio = asset.file_type === "audio";

  const typeLabel = {
    photo: "Photo",
    video: "Video",
    audio: "Audio",
    document: "Document",
  }[asset.file_type] ?? asset.file_type;

  const typeBadgeColor = {
    photo: "bg-purple-500/15 text-purple-300",
    video: "bg-blue-500/15 text-blue-300",
    audio: "bg-green-500/15 text-green-300",
    document: "bg-orange-500/15 text-orange-300",
  }[asset.file_type] ?? "bg-white/10 text-white/50";

  return (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-[#111] hover:bg-[#1a1a1a] transition-colors">
      {/* Thumbnail or icon */}
      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-[#1a1a1a] flex items-center justify-center">
        {(isPhoto || isVideo) && asset.thumbnail_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/assets/${asset.id}/thumbnail`}
            alt={asset.filename}
            className="w-full h-full object-cover"
          />
        ) : isAudio ? (
          <svg className="w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          <Highlighted text={asset.filename} term={query} />
        </p>
        <p className="text-xs text-white/40 mt-0.5">
          {formatDate(asset.captured_at ?? asset.ingested_at)} · {formatBytes(asset.size_bytes)}
        </p>
      </div>

      {/* Type badge */}
      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${typeBadgeColor}`}>
        {typeLabel}
      </span>
    </div>
  );
}

// ─── Empty / Loading states ───────────────────────────────────────────────────

function SearchingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mb-4" />
      <p className="text-white/50 text-sm">Searching your vault…</p>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg className="w-12 h-12 text-white/20 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <p className="text-white/50 text-sm">
        No results for <span className="text-white/70 font-medium">"{query}"</span>
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSubmitted(trimmed);
    setLoading(true);
    setResults([]);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/search?q=${encodeURIComponent(trimmed)}`
      );
      const data = await res.json();
      setResults(data.items ?? []);
    } catch {
      // backend unreachable — show no-results state silently
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const hasSearched = submitted.length > 0;

  return (
    <div className="flex flex-col items-center px-6 pt-16 pb-8">
      {/* Search bar */}
      <div className={`w-full max-w-2xl transition-all duration-300 ${hasSearched ? "mb-8" : "mb-0"}`}>
        {!hasSearched && (
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-white mb-2">Search your vault</h1>
            <p className="text-white/40 text-sm">
              Find photos, documents, videos, and audio
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative">
          <div className="relative flex items-center">
            <svg
              className="absolute left-4 w-5 h-5 text-white/30 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filenames, tags, locations…"
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder:text-white/30 text-base focus:outline-none focus:border-white/25 focus:bg-[#1f1f1f] transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSubmitted("");
                  setResults([]);
                  inputRef.current?.focus();
                }}
                className="absolute right-4 p-1 text-white/30 hover:text-white/60 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Results area */}
      {hasSearched && (
        <div className="w-full max-w-2xl">
          {loading ? (
            <SearchingState />
          ) : results.length === 0 ? (
            <NoResults query={submitted} />
          ) : (
            <>
              <p className="text-xs text-white/30 mb-3 px-1">
                {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
                <span className="text-white/50">"{submitted}"</span>
              </p>
              <div className="space-y-1.5">
                {results.map((a) => (
                  <ResultItem key={a.id} asset={a} query={submitted} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

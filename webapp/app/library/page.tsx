"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FullScreenPreview, type AssetPreview } from "../components/FullScreenPreview";
import { useUpload } from "../components/UploadProvider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type FilterType = "all" | "photo" | "video";
type NavTab = "all" | "years" | "places" | "faces";

interface AssetSummary {
  id: string; filename: string; file_type: "photo" | "video" | "audio" | "document";
  mime_type: string; size_bytes: number; captured_at: string | null;
  ingested_at: string; thumbnail_path: string | null; lat: number | null; lon: number | null;
}

function effectiveDate(a: AssetSummary): Date {
  return new Date(a.captured_at ?? a.ingested_at);
}

function sortByDate(a: AssetSummary, b: AssetSummary): number {
  return effectiveDate(b).getTime() - effectiveDate(a).getTime();
}

// Group into: Map<"YYYY-MM" (month key), Map<"YYYY-MM-DD" (day key), assets[]>>
function groupByMonthThenDay(assets: AssetSummary[]): [string, [string, AssetSummary[]][]][] {
  const monthMap = new Map<string, Map<string, AssetSummary[]>>();

  for (const a of assets) {
    const d = effectiveDate(a);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (!monthMap.has(mKey)) monthMap.set(mKey, new Map());
    const dayMap = monthMap.get(mKey)!;
    if (!dayMap.has(dKey)) dayMap.set(dKey, []);
    dayMap.get(dKey)!.push(a);
  }

  // Sort months descending, days descending within each month
  return Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mKey, dayMap]) => [
      mKey,
      Array.from(dayMap.entries())
        .sort((a, b) => b[0].localeCompare(a[0])),
    ]);
}

function groupByYear(assets: AssetSummary[]): [string, AssetSummary[]][] {
  const map = new Map<string, AssetSummary[]>();
  for (const a of assets) {
    const k = effectiveDate(a).getFullYear().toString();
    map.set(k, [...(map.get(k) ?? []), a]);
  }
  return Array.from(map.entries()).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
}

function formatMonthHeader(mKey: string): string {
  // mKey = "YYYY-MM"
  const [year, month] = mKey.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDayLabel(dKey: string): string {
  // dKey = "YYYY-MM-DD"
  const [y, m, d] = dKey.split("-").map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

const PHOTO_ROW_HEIGHT = 200; // px

function PhotoRow({
  assets,
  onOpen,
}: {
  assets: AssetSummary[];
  onOpen: (a: AssetSummary) => void;
}) {
  return (
    <div
      className="flex gap-0.5 overflow-hidden rounded-sm"
      style={{ height: PHOTO_ROW_HEIGHT }}
    >
      {assets.map((a) => (
        <button
          key={a.id}
          onClick={() => onOpen(a)}
          className="relative shrink-0 overflow-hidden group focus:outline-none"
          style={{ height: PHOTO_ROW_HEIGHT }}
        >
          {a.file_type === "photo" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`${API_URL}/api/v1/assets/${a.id}/thumbnail`}
              alt={a.filename}
              style={{ height: PHOTO_ROW_HEIGHT, width: "auto", display: "block" }}
              loading="lazy"
              className="transition-transform duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            <div
              style={{ height: PHOTO_ROW_HEIGHT, width: PHOTO_ROW_HEIGHT * 1.33 }}
              className="flex items-center justify-center bg-gray-200"
            >
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-500 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-150" />
        </button>
      ))}
    </div>
  );
}

function LibraryContent() {
  const searchParams = useSearchParams();
  const { openUpload } = useUpload();
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [navTab, setNavTab] = useState<NavTab>(() => {
    const v = searchParams.get("view");
    if (v === "years") return "years";
    return "all";
  });
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(0);

  const loadAssets = useCallback(async () => {
    try {
      const [pr, vr] = await Promise.all([
        fetch(`${API_URL}/api/v1/assets?file_type=photo&page=1&page_size=200`),
        fetch(`${API_URL}/api/v1/assets?file_type=video&page=1&page_size=200`),
      ]);
      const [pd, vd] = await Promise.all([pr.json(), vr.json()]);
      setAssets([...(pd.items ?? []), ...(vd.items ?? [])].sort(sortByDate));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  useEffect(() => {
    const onEnter = (e: DragEvent) => { if (!e.dataTransfer?.types.includes("Files")) return; dragRef.current++; setDragging(true); };
    const onLeave = (e: DragEvent) => { if (e.relatedTarget !== null) return; dragRef.current = 0; setDragging(false); };
    const onOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => { e.preventDefault(); dragRef.current = 0; setDragging(false); if (e.dataTransfer?.files.length) openUpload("media"); };
    document.addEventListener("dragenter", onEnter); document.addEventListener("dragleave", onLeave);
    document.addEventListener("dragover", onOver); document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onEnter); document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("dragover", onOver); document.removeEventListener("drop", onDrop);
    };
  }, [openUpload]);

  const filtered = filter === "all" ? assets : assets.filter((a) => a.file_type === filter);
  const previewableAssets: AssetPreview[] = filtered;

  function openPreview(asset: AssetSummary) {
    const idx = previewableAssets.findIndex((a) => a.id === asset.id);
    if (idx >= 0) setPreviewIndex(idx);
  }

  const monthDayGroups = groupByMonthThenDay(filtered);
  const yearGroups = groupByYear(filtered);

  return (
    <div className="min-h-full bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-3 flex items-center gap-3">
        <h1 className="text-base font-semibold text-gray-900 mr-1">Photos &amp; Videos</h1>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5">
          {(["all", "photo", "video"] as FilterType[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {f === "all" ? "All" : f === "photo" ? "Photos" : "Videos"}
            </button>
          ))}
        </div>

        {/* Nav tabs */}
        <div className="flex items-center gap-0.5 ml-1 border-l border-gray-200 pl-3">
          {(["all", "years", "places", "faces"] as NavTab[]).map((tab) => {
            const soon = tab === "places" || tab === "faces";
            return (
              <button key={tab}
                onClick={() => { if (!soon) setNavTab(tab); }}
                disabled={soon}
                className={`px-2.5 py-1.5 rounded-lg text-xs transition-colors capitalize ${
                  soon ? "text-gray-300 cursor-default" :
                  navTab === tab ? "bg-gray-100 text-gray-700 font-medium" :
                  "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}>
                {tab}{soon && <span className="ml-1 text-[9px] text-gray-300">Soon</span>}
              </button>
            );
          })}
        </div>

        {!loading && <span className="ml-auto text-xs text-gray-400">{filtered.length}</span>}
      </div>

      {/* Content */}
      {loading ? (
        <div className="px-8 py-8 space-y-10">
          {[1, 2].map((g) => (
            <div key={g}>
              <div className="h-6 w-32 bg-gray-100 rounded mb-4 animate-pulse" />
              <div className="h-3 w-24 bg-gray-50 rounded mb-3 animate-pulse" />
              <div className="flex gap-0.5" style={{ height: 200 }}>
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-gray-100 animate-pulse rounded" style={{ height: 200, width: 200 * (0.7 + Math.random() * 0.7) }} />)}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-8">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium mb-1">No media yet</p>
          <p className="text-sm text-gray-400 mb-5">Upload photos and videos to see them here</p>
          <button onClick={() => openUpload("media")}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm hover:bg-gray-700 transition-colors">
            Upload files
          </button>
        </div>
      ) : navTab === "years" ? (
        /* ── Years view ── */
        <div className="px-8 py-6 space-y-12">
          {yearGroups.map(([year, group]) => (
            <section key={year}>
              <h2 className="text-5xl font-bold text-gray-100 mb-4 select-none leading-none">{year}</h2>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-0.5">
                {group.map((a) => (
                  <button key={a.id} onClick={() => openPreview(a)}
                    className="relative aspect-square overflow-hidden rounded-sm bg-gray-100 group focus:outline-none">
                    {a.file_type === "photo" ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={`${API_URL}/api/v1/assets/${a.id}/thumbnail`} alt={a.filename}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-200">
                        <svg className="w-4 h-4 text-gray-400 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : navTab === "places" || navTab === "faces" ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-8">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            {navTab === "places" ? (
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ) : (
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </div>
          <p className="text-gray-600 font-semibold text-lg mb-1">{navTab === "places" ? "Places" : "Faces"}</p>
          <p className="text-sm text-gray-400 max-w-sm">
            {navTab === "places"
              ? "GPS-based photo grouping is coming soon."
              : "On-device face clustering is coming soon."}
          </p>
        </div>
      ) : (
        /* ── Google Photos style: month + day grouping ── */
        <div className="px-8 pb-16 pt-4 space-y-10">
          {monthDayGroups.map(([mKey, dayGroups]) => (
            <section key={mKey}>
              {/* Month header */}
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                {formatMonthHeader(mKey)}
              </h2>

              {/* Day groups within month */}
              <div className="space-y-5">
                {dayGroups.map(([dKey, dayAssets]) => (
                  <div key={dKey}>
                    {/* Sticky day label */}
                    <p className="sticky top-[57px] z-10 bg-white/95 backdrop-blur-sm text-sm font-medium text-gray-600 py-1.5 mb-1.5">
                      {formatDayLabel(dKey)}
                    </p>
                    {/* Horizontal photo row — variable widths at fixed height */}
                    <PhotoRow assets={dayAssets} onOpen={openPreview} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm pointer-events-none border-4 border-dashed border-gray-300 m-3 rounded-2xl">
          <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-lg font-semibold text-gray-700">Drop to add to your vault</p>
        </div>
      )}

      {/* Upload FAB */}
      <button onClick={() => openUpload("media")} title="Upload"
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700 hover:scale-105 active:scale-95 transition-all flex items-center justify-center">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {previewIndex !== null && (
        <FullScreenPreview
          assets={previewableAssets}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onDelete={(id) => { setAssets((prev) => prev.filter((a) => a.id !== id)); setPreviewIndex(null); }}
        />
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-white" />}>
      <LibraryContent />
    </Suspense>
  );
}

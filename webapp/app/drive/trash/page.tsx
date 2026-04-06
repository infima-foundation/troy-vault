"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TRASH_SETTINGS_KEY = "troy_trash_settings";

interface Asset {
  id: string;
  filename: string;
  file_type: "photo" | "video" | "audio" | "document";
  mime_type: string;
  size_bytes: number;
  deleted_at: string | null;
  ingested_at: string;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TrashPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [autoDeleteValue, setAutoDeleteValue] = useState("never");
  const [autoDeleteUnit, setAutoDeleteUnit] = useState("days");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRASH_SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        setAutoDeleteValue(s.value ?? "never");
        setAutoDeleteUnit(s.unit ?? "days");
      }
    } catch { /* ignore */ }
  }, []);

  function saveSettings(value: string, unit: string) {
    setAutoDeleteValue(value);
    setAutoDeleteUnit(unit);
    localStorage.setItem(TRASH_SETTINGS_KEY, JSON.stringify({ value, unit }));
  }

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/v1/assets?deleted=true&page_size=200`);
      const d = await r.json();
      setAssets(d.items ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTrash(); }, [loadTrash]);

  async function restore(id: string) {
    await fetch(`${API_URL}/api/v1/assets/${id}/restore`, { method: "POST" });
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  async function deletePermanent(id: string, filename: string) {
    if (!confirm(`Permanently delete "${filename}"? This cannot be undone.`)) return;
    await fetch(`${API_URL}/api/v1/assets/${id}/permanent`, { method: "DELETE" });
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  async function emptyTrash() {
    if (!confirm(`Permanently delete all ${assets.length} files in trash? This cannot be undone.`)) return;
    await Promise.all(assets.map((a) => fetch(`${API_URL}/api/v1/assets/${a.id}/permanent`, { method: "DELETE" })));
    setAssets([]);
  }

  return (
    <div className="min-h-full bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4 flex items-center gap-4">
        <Link href="/drive" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-base font-semibold text-gray-900 flex-1">Deleted Files</h1>
        {assets.length > 0 && (
          <button
            onClick={emptyTrash}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
          >
            Empty Trash
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Trash settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">Auto-delete settings</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Auto-delete after:</span>
                <input
                  type="text"
                  value={autoDeleteValue === "never" ? "" : autoDeleteValue}
                  placeholder="never"
                  onChange={(e) => saveSettings(e.target.value || "never", autoDeleteUnit)}
                  className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-gray-400"
                />
                <select
                  value={autoDeleteUnit}
                  onChange={(e) => saveSettings(autoDeleteValue, e.target.value)}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none"
                >
                  <option value="days">days</option>
                  <option value="months">months</option>
                  <option value="years">years</option>
                </select>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {autoDeleteValue === "never" || !autoDeleteValue
                  ? "Files will stay until you delete them manually."
                  : `Files will be permanently deleted after ${autoDeleteValue} ${autoDeleteUnit}.`}
              </p>
              <p className="text-xs text-gray-300 mt-1">(Auto-deletion is saved locally — not enforced automatically)</p>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Trash is empty</p>
            <p className="text-sm text-gray-400 mt-1">Deleted files will appear here</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-4">{assets.length} file{assets.length !== 1 ? "s" : ""} in trash</p>
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[1fr_200px_100px_180px] items-center gap-4 px-4 py-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Date Deleted</span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Size</span>
                <div />
              </div>

              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="grid grid-cols-[1fr_200px_100px_180px] items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-700 truncate">{asset.filename}</p>
                  </div>
                  <p className="text-sm text-gray-500">{formatDate(asset.deleted_at)}</p>
                  <p className="text-sm text-gray-500">{formatBytes(asset.size_bytes)}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => restore(asset.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => deletePermanent(asset.id, asset.filename)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                    >
                      Delete Forever
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

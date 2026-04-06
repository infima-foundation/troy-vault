"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUpload } from "../components/UploadProvider";
import { FullScreenPreview, type AssetPreview } from "../components/FullScreenPreview";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Asset {
  id: string;
  filename: string;
  file_type: "photo" | "video" | "audio" | "document";
  mime_type: string;
  size_bytes: number;
  captured_at: string | null;
  ingested_at: string;
  thumbnail_path: string | null;
  is_starred: boolean;
  is_deleted: boolean;
}

type SortKey = "name" | "modified" | "size" | "type";
type SortDir = "asc" | "desc";
type TabType = "all" | "folders" | "shared" | "deleted";

const FILE_TYPE_LABELS: Record<string, string> = {
  photo: "Photo", video: "Video", audio: "Audio", document: "Document",
};

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function FileIcon({ fileType, mimeType, thumbnailId }: { fileType: string; mimeType: string; thumbnailId?: string }) {
  if ((fileType === "photo") && thumbnailId) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={`${API_URL}/api/v1/assets/${thumbnailId}/thumbnail`}
        alt=""
        className="w-10 h-10 rounded object-cover"
      />
    );
  }
  const iconClass = "w-5 h-5";
  if (fileType === "video") {
    return (
      <div className="w-10 h-10 rounded bg-blue-50 flex items-center justify-center">
        <svg className={`${iconClass} text-blue-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }
  if (fileType === "audio") {
    return (
      <div className="w-10 h-10 rounded bg-purple-50 flex items-center justify-center">
        <svg className={`${iconClass} text-purple-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
    );
  }
  if (mimeType?.includes("pdf")) {
    return (
      <div className="w-10 h-10 rounded bg-red-50 flex items-center justify-center">
        <svg className={`${iconClass} text-red-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
      <svg className={`${iconClass} text-gray-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );
}

export default function DrivePage() {
  const router = useRouter();
  const { openUpload } = useUpload();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("modified");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const newMenuRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(0);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Inline folder creation state
  const [newFolders, setNewFolders] = useState<{ id: string; name: string }[]>([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("Untitled Folder");
  const folderInputRef = useRef<HTMLInputElement>(null);

  const loadAssets = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/v1/assets?page_size=200`);
      const d = await r.json();
      setAssets(d.items ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // Close new menu on outside click
  useEffect(() => {
    if (!showNewMenu) return;
    const h = (e: MouseEvent) => { if (!newMenuRef.current?.contains(e.target as Node)) setShowNewMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showNewMenu]);

  // Drag & drop
  useEffect(() => {
    const onEnter = (e: DragEvent) => { if (!e.dataTransfer?.types.includes("Files")) return; dragRef.current++; setDragging(true); };
    const onLeave = (e: DragEvent) => { if (e.relatedTarget !== null) return; dragRef.current = 0; setDragging(false); };
    const onOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); dragRef.current = 0; setDragging(false);
      if (e.dataTransfer?.files.length) { openUpload("media"); }
    };
    document.addEventListener("dragenter", onEnter); document.addEventListener("dragleave", onLeave);
    document.addEventListener("dragover", onOver); document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onEnter); document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("dragover", onOver); document.removeEventListener("drop", onDrop);
    };
  }, [openUpload]);

  // Focus folder name input when creating
  useEffect(() => { if (creatingFolder) folderInputRef.current?.focus(); }, [creatingFolder]);
  useEffect(() => { if (editingId) editInputRef.current?.focus(); }, [editingId]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function sortedAssets(list: Asset[]) {
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.filename.localeCompare(b.filename);
      else if (sortKey === "modified") cmp = new Date(a.captured_at ?? a.ingested_at).getTime() - new Date(b.captured_at ?? b.ingested_at).getTime();
      else if (sortKey === "size") cmp = a.size_bytes - b.size_bytes;
      else if (sortKey === "type") cmp = a.file_type.localeCompare(b.file_type);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const visibleAssets = sortedAssets(assets);
  const previewableAssets: AssetPreview[] = visibleAssets.filter(a => a.file_type === "photo" || a.file_type === "video");

  function openPreview(asset: Asset) {
    const idx = previewableAssets.findIndex(a => a.id === asset.id);
    if (idx >= 0) setPreviewIndex(idx);
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function softDelete(id: string) {
    await fetch(`${API_URL}/api/v1/assets/${id}`, { method: "DELETE" });
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  async function toggleStar(id: string) {
    const r = await fetch(`${API_URL}/api/v1/assets/${id}/star`, { method: "PATCH" });
    const updated = await r.json();
    setAssets((prev) => prev.map((a) => a.id === id ? { ...a, is_starred: updated.is_starred } : a));
  }

  async function saveRename(id: string) {
    if (!editingName.trim()) { setEditingId(null); return; }
    try {
      const r = await fetch(`${API_URL}/api/v1/assets/${id}/filename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: editingName.trim() }),
      });
      const updated = await r.json();
      setAssets((prev) => prev.map((a) => a.id === id ? { ...a, filename: updated.filename } : a));
    } catch { /* ignore */ }
    setEditingId(null);
  }

  async function createNewDoc(docType: "document" | "spreadsheet" | "presentation") {
    setShowNewMenu(false);
    try {
      const asset = await fetch(`${API_URL}/api/v1/documents/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `Untitled ${docType}`, doc_type: docType }),
      }).then((r) => r.json());
      router.push(`/editor/${asset.id}`);
    } catch { /* ignore */ }
  }

  function addFolder() {
    const id = `folder-${Date.now()}`;
    setNewFolders((p) => [...p, { id, name: newFolderName }]);
    setCreatingFolder(false);
    setNewFolderName("Untitled Folder");
  }

  const SortHeader = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(col)}
      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-gray-700 transition-colors ${sortKey === col ? "text-gray-700" : "text-gray-400"}`}
    >
      {label}
      {sortKey === col && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
        </svg>
      )}
    </button>
  );

  return (
    <div className="min-h-full bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4 flex items-center gap-4">
        <h1 className="text-base font-semibold text-gray-900 flex-1">Your Drive</h1>
        <div ref={newMenuRef} className="relative">
          <button
            onClick={() => setShowNewMenu((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showNewMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
              <button
                onClick={() => { setShowNewMenu(false); openUpload("media"); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload File
              </button>
              <button
                onClick={() => { setShowNewMenu(false); setCreatingFolder(true); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                New Folder
              </button>
              <div className="my-1 border-t border-gray-100" />
              <button onClick={() => createNewDoc("document")}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                New Document
              </button>
              <button onClick={() => createNewDoc("spreadsheet")}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M3 14h18M10 3v18M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
                </svg>
                New Spreadsheet
              </button>
              <button onClick={() => createNewDoc("presentation")}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                New Presentation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100 px-8">
        <div className="flex gap-1">
          {(["all", "folders", "shared", "deleted"] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                if (tab === "deleted") { router.push("/drive/trash"); return; }
                if (tab === "folders") { router.push("/drive/folders"); return; }
                if (tab === "shared") { router.push("/drive/shared"); return; }
                setActiveTab(tab);
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "all" ? "All Files" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* File list */}
      <div className="px-8 py-4">
        {/* Column headers */}
        <div className="grid grid-cols-[auto_1fr_140px_100px_100px_80px] items-center gap-3 px-4 py-2 mb-1">
          <div className="w-4" />
          <SortHeader col="name" label="Name" />
          <SortHeader col="modified" label="Modified" />
          <SortHeader col="size" label="Size" />
          <SortHeader col="type" label="Type" />
          <div />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* New folder creation row */}
            {creatingFolder && (
              <div className="grid grid-cols-[auto_1fr_140px_100px_100px_80px] items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                <div className="w-4" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-yellow-50 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                  </div>
                  <input
                    ref={folderInputRef}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addFolder();
                      if (e.key === "Escape") setCreatingFolder(false);
                    }}
                    onBlur={() => addFolder()}
                    className="flex-1 text-sm font-medium text-gray-900 bg-transparent border-b border-blue-400 focus:outline-none"
                  />
                </div>
                <div />
                <div />
                <span className="text-xs text-gray-400 px-2 py-0.5 rounded-full bg-gray-100">Folder</span>
                <div />
              </div>
            )}

            {/* Folder rows */}
            {newFolders.map((folder) => (
              <div key={folder.id} className="grid grid-cols-[auto_1fr_140px_100px_100px_80px] items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 group cursor-pointer">
                <div className="w-4" />
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded bg-yellow-50 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate">{folder.name}</p>
                </div>
                <p className="text-sm text-gray-400">—</p>
                <p className="text-sm text-gray-400">—</p>
                <span className="text-xs text-gray-500 px-2 py-0.5 rounded-full bg-gray-100">Folder</span>
                <div />
              </div>
            ))}

            {/* Asset rows */}
            {visibleAssets.map((asset) => {
              const isSelected = selected.has(asset.id);
              const isEditing = editingId === asset.id;
              const canPreview = asset.file_type === "photo" || asset.file_type === "video";

              return (
                <div
                  key={asset.id}
                  className={`grid grid-cols-[auto_1fr_140px_100px_100px_80px] items-center gap-3 px-4 py-3 rounded-xl transition-colors group cursor-pointer ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  onClick={() => {
                    if (isEditing) return;
                    if (canPreview) openPreview(asset);
                    else if (asset.file_type === "document") router.push(`/editor/${asset.id}`);
                  }}
                >
                  {/* Checkbox */}
                  <div
                    className="w-4 h-4 cursor-pointer"
                    onClick={(e) => toggleSelect(asset.id, e)}
                  >
                    {isSelected ? (
                      <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded border border-gray-300 group-hover:border-gray-400 transition-colors" />
                    )}
                  </div>

                  {/* Name + icon */}
                  <div className="flex items-center gap-3 min-w-0">
                    <FileIcon fileType={asset.file_type} mimeType={asset.mime_type} thumbnailId={asset.file_type === "photo" ? asset.id : undefined} />
                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(asset.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => saveRename(asset.id)}
                        className="flex-1 text-sm font-medium text-gray-900 bg-transparent border-b border-blue-400 focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <p
                        className="text-sm font-medium text-gray-800 truncate flex-1"
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingId(asset.id); setEditingName(asset.filename); }}
                        title="Double-click to rename"
                      >
                        {asset.is_starred && <span className="text-yellow-400 mr-1">★</span>}
                        {asset.filename}
                      </p>
                    )}
                  </div>

                  {/* Modified */}
                  <p className="text-sm text-gray-500">{formatDate(asset.captured_at ?? asset.ingested_at)}</p>

                  {/* Size */}
                  <p className="text-sm text-gray-500">{formatBytes(asset.size_bytes)}</p>

                  {/* Type badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    asset.file_type === "photo" ? "bg-green-50 text-green-700" :
                    asset.file_type === "video" ? "bg-blue-50 text-blue-700" :
                    asset.file_type === "audio" ? "bg-purple-50 text-purple-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {FILE_TYPE_LABELS[asset.file_type]}
                  </span>

                  {/* Actions (visible on hover) */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleStar(asset.id); }}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-yellow-500 transition-colors"
                      title={asset.is_starred ? "Unstar" : "Star"}
                    >
                      <svg className="w-3.5 h-3.5" fill={asset.is_starred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); softDelete(asset.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Move to trash"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {!loading && visibleAssets.length === 0 && newFolders.length === 0 && (
              <div className="py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium mb-1">Your drive is empty</p>
                <p className="text-sm text-gray-400 mb-5">Upload files or create new documents to get started</p>
                <button
                  onClick={() => openUpload("media")}
                  className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm hover:bg-gray-700 transition-colors"
                >
                  Upload files
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm pointer-events-none border-4 border-dashed border-gray-300 m-3 rounded-2xl">
          <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-lg font-semibold text-gray-700">Drop to upload</p>
        </div>
      )}

      {/* Full screen preview */}
      {previewIndex !== null && (
        <FullScreenPreview
          assets={previewableAssets}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onDelete={(id) => {
            setAssets((prev) => prev.filter((a) => a.id !== id));
            setPreviewIndex(null);
          }}
        />
      )}
    </div>
  );
}

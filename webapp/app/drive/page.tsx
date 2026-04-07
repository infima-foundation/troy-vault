"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  folder_id: string | null;
}

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  is_starred: boolean;
  asset_count: number;
  updated_at: string | null;
}

type SortKey = "name" | "modified" | "size" | "type";
type SortDir = "asc" | "desc";

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

function FileThumbnail({ asset }: { asset: Asset }) {
  if (asset.file_type === "photo") {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={`${API_URL}/api/v1/assets/${asset.id}/thumbnail`} alt=""
        className="w-10 h-10 rounded object-cover" />
    );
  }
  const bg = asset.file_type === "video" ? "bg-blue-50" : asset.file_type === "audio" ? "bg-purple-50" : asset.mime_type?.includes("pdf") ? "bg-red-50" : "bg-gray-100";
  const color = asset.file_type === "video" ? "text-blue-500" : asset.file_type === "audio" ? "text-purple-500" : asset.mime_type?.includes("pdf") ? "text-red-500" : "text-gray-400";
  return (
    <div className={`w-10 h-10 rounded flex items-center justify-center ${bg}`}>
      <svg className={`w-5 h-5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );
}

function FolderThumbnail({ folder }: { folder: Folder }) {
  return (
    <div className={`w-10 h-10 rounded flex items-center justify-center ${folder.is_starred ? "bg-yellow-50" : "bg-amber-50"}`}>
      <svg className={`w-5 h-5 ${folder.is_starred ? "text-yellow-500" : "text-amber-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    </div>
  );
}

// ─── Quick Access card ────────────────────────────────────────────────────────

function QuickCard({ label, isFolder, assetId, folderId, starred, onClick }: {
  label: string; isFolder?: boolean; assetId?: string; folderId?: string;
  starred?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-2 p-3 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-left group"
    >
      <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
        {isFolder ? (
          <svg className={`w-8 h-8 ${starred ? "text-yellow-500" : "text-amber-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
        ) : assetId ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={`${API_URL}/api/v1/assets/${assetId}/thumbnail`} alt=""
            className="w-full h-full object-cover" />
        ) : (
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
      </div>
      <p className="text-xs font-medium text-gray-700 truncate w-full">
        {starred && <span className="text-yellow-400 mr-0.5">★</span>}{label}
      </p>
    </button>
  );
}

// ─── Main Drive content ───────────────────────────────────────────────────────

function DriveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openUpload } = useUpload();

  const currentFolderId = searchParams.get("folder") ?? null;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]); // for "move to" picker
  const [breadcrumb, setBreadcrumb] = useState<Folder[]>([]); // path from root to current folder
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("modified");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editingAssetName, setEditingAssetName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [quickAccessOpen, setQuickAccessOpen] = useState(true);
  const [moveMenuAssetId, setMoveMenuAssetId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Drag target tracking
  const dragItemId = useRef<string | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const editAssetRef = useRef<HTMLInputElement>(null);
  const editFolderRef = useRef<HTMLInputElement>(null);
  const dragPageRef = useRef(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fParam = currentFolderId ? `&folder_id=${currentFolderId}` : "&folder_id=root";
      const [assetsRes, foldersRes, allFoldersRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/assets?page_size=200${fParam}`),
        fetch(`${API_URL}/api/v1/folders?parent_id=${currentFolderId ?? "root"}`),
        fetch(`${API_URL}/api/v1/folders?parent_id=root`), // flat list for move picker
      ]);
      const [assetsData, foldersData, allFoldersData] = await Promise.all([
        assetsRes.json(), foldersRes.json(), allFoldersRes.json(),
      ]);
      setAssets(assetsData.items ?? []);
      setFolders(foldersData);
      setAllFolders(allFoldersData);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [currentFolderId]);

  // Build breadcrumb by walking up folder hierarchy
  const loadBreadcrumb = useCallback(async () => {
    if (!currentFolderId) { setBreadcrumb([]); return; }
    const crumbs: Folder[] = [];
    let id: string | null = currentFolderId;
    while (id) {
      try {
        const f: Folder = await fetch(`${API_URL}/api/v1/folders/${id}`).then((r) => r.json());
        crumbs.unshift(f);
        id = f.parent_id;
      } catch { break; }
    }
    setBreadcrumb(crumbs);
  }, [currentFolderId]);

  useEffect(() => { loadData(); loadBreadcrumb(); }, [loadData, loadBreadcrumb]);

  useEffect(() => {
    if (editingAssetId) editAssetRef.current?.focus();
  }, [editingAssetId]);

  useEffect(() => {
    if (editingFolderId) editFolderRef.current?.focus();
  }, [editingFolderId]);

  // Close new menu on outside click
  useEffect(() => {
    if (!showNewMenu) return;
    const h = (e: MouseEvent) => { if (!newMenuRef.current?.contains(e.target as Node)) setShowNewMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showNewMenu]);

  // Close move menu on outside click
  useEffect(() => {
    if (!moveMenuAssetId) return;
    const h = () => setMoveMenuAssetId(null);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [moveMenuAssetId]);

  // Page-level drag-drop for file upload
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragPageRef.current++; setDragging(true);
    };
    const onLeave = (e: DragEvent) => { if (e.relatedTarget !== null) return; dragPageRef.current = 0; setDragging(false); };
    const onOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); dragPageRef.current = 0; setDragging(false);
      if (e.dataTransfer?.files.length) openUpload("media");
    };
    document.addEventListener("dragenter", onEnter); document.addEventListener("dragleave", onLeave);
    document.addEventListener("dragover", onOver); document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onEnter); document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("dragover", onOver); document.removeEventListener("drop", onDrop);
    };
  }, [openUpload]);

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

  // Quick Access: starred items + 4 most recently modified
  const starredAssets = assets.filter((a) => a.is_starred);
  const starredFolders = folders.filter((f) => f.is_starred);
  const recentAssets = [...assets]
    .filter((a) => !a.is_starred)
    .sort((a, b) => new Date(b.captured_at ?? b.ingested_at).getTime() - new Date(a.captured_at ?? a.ingested_at).getTime())
    .slice(0, 4);
  const quickItems = [...starredFolders, ...starredAssets, ...recentAssets];

  function openPreview(asset: Asset) {
    const idx = previewableAssets.findIndex(a => a.id === asset.id);
    if (idx >= 0) setPreviewIndex(idx);
  }

  async function softDelete(id: string) {
    await fetch(`${API_URL}/api/v1/assets/${id}`, { method: "DELETE" });
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  async function toggleStarAsset(id: string) {
    const r = await fetch(`${API_URL}/api/v1/assets/${id}/star`, { method: "PATCH" });
    const updated = await r.json();
    setAssets((prev) => prev.map((a) => a.id === id ? { ...a, is_starred: updated.is_starred } : a));
  }

  async function toggleStarFolder(id: string) {
    const r = await fetch(`${API_URL}/api/v1/folders/${id}/star`, { method: "PATCH" });
    const updated = await r.json();
    setFolders((prev) => prev.map((f) => f.id === id ? updated : f));
  }

  async function deleteFolder(id: string) {
    await fetch(`${API_URL}/api/v1/folders/${id}`, { method: "DELETE" });
    setFolders((prev) => prev.filter((f) => f.id !== id));
  }

  async function saveAssetRename(id: string) {
    if (!editingAssetName.trim()) { setEditingAssetId(null); return; }
    try {
      const r = await fetch(`${API_URL}/api/v1/assets/${id}/filename`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: editingAssetName.trim() }),
      });
      const updated = await r.json();
      setAssets((prev) => prev.map((a) => a.id === id ? { ...a, filename: updated.filename } : a));
    } catch { /* ignore */ }
    setEditingAssetId(null);
  }

  async function saveFolderRename(id: string) {
    if (!editingFolderName.trim()) { setEditingFolderId(null); return; }
    try {
      const r = await fetch(`${API_URL}/api/v1/folders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingFolderName.trim() }),
      });
      const updated = await r.json();
      setFolders((prev) => prev.map((f) => f.id === id ? updated : f));
    } catch { /* ignore */ }
    setEditingFolderId(null);
  }

  async function createFolder() {
    setShowNewMenu(false);
    try {
      const r = await fetch(`${API_URL}/api/v1/folders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled Folder", parent_id: currentFolderId }),
      });
      const folder: Folder = await r.json();
      setFolders((prev) => [...prev, folder]);
      // Immediately start renaming
      setEditingFolderId(folder.id);
      setEditingFolderName(folder.name);
    } catch { /* ignore */ }
  }

  async function createNewDoc(docType: "document" | "spreadsheet" | "presentation") {
    setShowNewMenu(false);
    try {
      const asset = await fetch(`${API_URL}/api/v1/documents/new`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `Untitled ${docType}`, doc_type: docType }),
      }).then((r) => r.json());
      router.push(`/editor/${asset.id}`);
    } catch { /* ignore */ }
  }

  async function moveAssetToFolder(assetId: string, folderId: string | null) {
    setMoveMenuAssetId(null);
    try {
      await fetch(`${API_URL}/api/v1/assets/${assetId}/folder`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      // Remove from current view (it's in a different folder now)
      if (folderId !== currentFolderId) {
        setAssets((prev) => prev.filter((a) => a.id !== assetId));
      }
    } catch { /* ignore */ }
  }

  // Drag-drop file into folder
  function onFileDragStart(assetId: string) {
    dragItemId.current = assetId;
  }
  function onFolderDragOver(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(folderId);
  }
  function onFolderDragLeave() {
    setDragOverFolderId(null);
  }
  async function onFolderDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    if (dragItemId.current) {
      await moveAssetToFolder(dragItemId.current, folderId);
      dragItemId.current = null;
    }
  }

  const SortHeader = ({ col, label }: { col: SortKey; label: string }) => (
    <button onClick={() => toggleSort(col)}
      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wider hover:text-gray-700 transition-colors ${sortKey === col ? "text-gray-700" : "text-gray-400"}`}>
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
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4 flex items-center gap-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button onClick={() => router.push("/drive")}
            className="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors shrink-0">
            Your Drive
          </button>
          {breadcrumb.map((f, i) => (
            <span key={f.id} className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <button
                onClick={() => router.push(i === breadcrumb.length - 1 ? `/drive?folder=${f.id}` : `/drive?folder=${f.id}`)}
                className={`text-sm truncate max-w-[140px] transition-colors ${i === breadcrumb.length - 1 ? "font-semibold text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>

        {/* New button */}
        <div ref={newMenuRef} className="relative">
          <button onClick={() => setShowNewMenu((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors">
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
              <button onClick={() => { setShowNewMenu(false); openUpload("media"); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload File
              </button>
              <button onClick={createFolder}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                New Folder
              </button>
              <div className="my-1 border-t border-gray-100" />
              <button onClick={() => createNewDoc("document")}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                New Document
              </button>
              <button onClick={() => createNewDoc("spreadsheet")}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M3 14h18M10 3v18M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
                </svg>
                New Spreadsheet
              </button>
              <button onClick={() => createNewDoc("presentation")}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
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
          {(["All Files", "Folders", "Shared", "Deleted"] as const).map((tab) => (
            <button key={tab}
              onClick={() => {
                if (tab === "Deleted") router.push("/drive/trash");
                else if (tab === "Folders") router.push("/drive/folders");
                else if (tab === "Shared") router.push("/drive/shared");
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "All Files" && !currentFolderId ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-4">
        {/* ── Quick Access ── */}
        {quickItems.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setQuickAccessOpen((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 hover:text-gray-700 transition-colors"
            >
              <svg className={`w-3 h-3 transition-transform ${quickAccessOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Quick Access
            </button>
            {quickAccessOpen && (
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                {quickItems.slice(0, 8).map((item) => {
                  if ("asset_count" in item) {
                    // Folder
                    const f = item as Folder;
                    return (
                      <QuickCard key={f.id} label={f.name} isFolder starred={f.is_starred}
                        onClick={() => router.push(`/drive?folder=${f.id}`)} />
                    );
                  }
                  // Asset
                  const a = item as Asset;
                  return (
                    <QuickCard key={a.id} label={a.filename} starred={a.is_starred}
                      assetId={a.file_type === "photo" ? a.id : undefined}
                      onClick={() => {
                        if (a.file_type === "photo" || a.file_type === "video") openPreview(a);
                        else if (a.file_type === "document") router.push(`/editor/${a.id}`);
                      }}
                    />
                  );
                })}
              </div>
            )}
            <div className="mt-4 border-t border-gray-100" />
          </div>
        )}

        {/* ── File list ── */}
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
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* ── Folder rows ── */}
            {folders.map((folder) => {
              const isEditing = editingFolderId === folder.id;
              const isDragTarget = dragOverFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  className={`grid grid-cols-[auto_1fr_140px_100px_100px_80px] items-center gap-3 px-4 py-3 rounded-xl transition-colors group cursor-pointer ${isDragTarget ? "bg-blue-50 border border-blue-300" : "hover:bg-gray-50"}`}
                  onClick={() => { if (!isEditing) router.push(`/drive?folder=${folder.id}`); }}
                  onDragOver={(e) => onFolderDragOver(e, folder.id)}
                  onDragLeave={onFolderDragLeave}
                  onDrop={(e) => onFolderDrop(e, folder.id)}
                >
                  <div className="w-4" />
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderThumbnail folder={folder} />
                    {isEditing ? (
                      <input ref={editFolderRef} value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveFolderRename(folder.id); if (e.key === "Escape") setEditingFolderId(null); }}
                        onBlur={() => saveFolderRename(folder.id)}
                        className="flex-1 text-sm font-medium text-gray-900 bg-transparent border-b border-blue-400 focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <p className="text-sm font-medium text-gray-800 truncate flex-1"
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}
                        title="Double-click to rename">
                        {folder.is_starred && <span className="text-yellow-400 mr-1">★</span>}
                        {folder.name}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{formatDate(folder.updated_at)}</p>
                  <p className="text-sm text-gray-500">—</p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">Folder</span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); toggleStarFolder(folder.id); }}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-yellow-500 transition-colors" title="Star">
                      <svg className="w-3.5 h-3.5" fill={folder.is_starred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete folder "${folder.name}"?`)) deleteFolder(folder.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Delete folder">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* ── Asset rows ── */}
            {visibleAssets.map((asset) => {
              const isSelected = selected.has(asset.id);
              const isEditing = editingAssetId === asset.id;
              const canPreview = asset.file_type === "photo" || asset.file_type === "video";

              return (
                <div
                  key={asset.id}
                  className={`grid grid-cols-[auto_1fr_140px_100px_100px_80px] items-center gap-3 px-4 py-3 rounded-xl transition-colors group cursor-pointer ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  draggable
                  onDragStart={() => onFileDragStart(asset.id)}
                  onClick={() => {
                    if (isEditing) return;
                    if (canPreview) openPreview(asset);
                    else if (asset.file_type === "document") router.push(`/editor/${asset.id}`);
                  }}
                >
                  {/* Checkbox */}
                  <div className="w-4 h-4 cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelected((prev) => { const n = new Set(prev); if (n.has(asset.id)) n.delete(asset.id); else n.add(asset.id); return n; }); }}>
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

                  {/* Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <FileThumbnail asset={asset} />
                    {isEditing ? (
                      <input ref={editAssetRef} value={editingAssetName}
                        onChange={(e) => setEditingAssetName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveAssetRename(asset.id); if (e.key === "Escape") setEditingAssetId(null); }}
                        onBlur={() => saveAssetRename(asset.id)}
                        className="flex-1 text-sm font-medium text-gray-900 bg-transparent border-b border-blue-400 focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <p className="text-sm font-medium text-gray-800 truncate flex-1"
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingAssetId(asset.id); setEditingAssetName(asset.filename); }}
                        title="Double-click to rename">
                        {asset.is_starred && <span className="text-yellow-400 mr-1">★</span>}
                        {asset.filename}
                      </p>
                    )}
                  </div>

                  <p className="text-sm text-gray-500">{formatDate(asset.captured_at ?? asset.ingested_at)}</p>
                  <p className="text-sm text-gray-500">{formatBytes(asset.size_bytes)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    asset.file_type === "photo" ? "bg-green-50 text-green-700" :
                    asset.file_type === "video" ? "bg-blue-50 text-blue-700" :
                    asset.file_type === "audio" ? "bg-purple-50 text-purple-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{FILE_TYPE_LABELS[asset.file_type]}</span>

                  {/* Hover actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity relative">
                    <button onClick={(e) => { e.stopPropagation(); toggleStarAsset(asset.id); }}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-yellow-500 transition-colors" title="Star">
                      <svg className="w-3.5 h-3.5" fill={asset.is_starred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </button>
                    {/* Move to folder */}
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMoveMenuAssetId(moveMenuAssetId === asset.id ? null : asset.id); }}
                        className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors" title="Move to folder">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        </svg>
                      </button>
                      {moveMenuAssetId === asset.id && (
                        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1" onClick={(e) => e.stopPropagation()}>
                          <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Move to</p>
                          <button onClick={() => moveAssetToFolder(asset.id, null)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            Root (no folder)
                          </button>
                          {allFolders.map((f) => (
                            <button key={f.id} onClick={() => moveAssetToFolder(asset.id, f.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 truncate">
                              <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                              </svg>
                              <span className="truncate">{f.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); softDelete(asset.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Move to trash">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {!loading && folders.length === 0 && visibleAssets.length === 0 && (
              <div className="py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium mb-1">
                  {currentFolderId ? "This folder is empty" : "Your drive is empty"}
                </p>
                <p className="text-sm text-gray-400 mb-5">Upload files or create new documents to get started</p>
                <button onClick={() => openUpload("media")}
                  className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm hover:bg-gray-700 transition-colors">
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

export default function DrivePage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-white" />}>
      <DriveContent />
    </Suspense>
  );
}

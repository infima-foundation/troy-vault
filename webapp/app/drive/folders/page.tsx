"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  is_starred: boolean;
  asset_count: number;
  updated_at: string | null;
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function FoldersPage() {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/folders?parent_id=all`);
      const data: Folder[] = await res.json();
      setFolders(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (!contextMenuId) return;
    const h = () => setContextMenuId(null);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [contextMenuId]);

  async function nestFolder(sourceId: string, targetParentId: string | null) {
    if (sourceId === targetParentId) return;
    try {
      const r = await fetch(`${API_URL}/api/v1/folders/${sourceId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_id: targetParentId }),
      });
      const updated: Folder = await r.json();
      setFolders((prev) => prev.map((f) => f.id === sourceId ? updated : f));
    } catch { /* ignore */ }
  }

  async function saveRename(id: string) {
    if (!editingName.trim()) { setEditingId(null); return; }
    try {
      const r = await fetch(`${API_URL}/api/v1/folders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      const updated: Folder = await r.json();
      setFolders((prev) => prev.map((f) => f.id === id ? updated : f));
    } catch { /* ignore */ }
    setEditingId(null);
  }

  async function toggleStar(id: string) {
    try {
      const r = await fetch(`${API_URL}/api/v1/folders/${id}/star`, { method: "PATCH" });
      const updated: Folder = await r.json();
      setFolders((prev) => prev.map((f) => f.id === id ? updated : f));
    } catch { /* ignore */ }
  }

  async function deleteFolder(id: string, name: string) {
    if (!confirm(`Delete folder "${name}"?`)) return;
    try {
      await fetch(`${API_URL}/api/v1/folders/${id}`, { method: "DELETE" });
      setFolders((prev) => prev.filter((f) => f.id !== id));
    } catch { /* ignore */ }
  }

  function onDragStart(e: React.DragEvent, folderId: string) {
    setDragSourceId(folderId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, folderId: string) {
    if (!dragSourceId || dragSourceId === folderId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(folderId);
  }

  function onDragLeave() {
    setDragOverId(null);
  }

  async function onDrop(e: React.DragEvent, targetId: string | null) {
    e.preventDefault();
    setDragOverId(null);
    if (!dragSourceId || dragSourceId === targetId) { setDragSourceId(null); return; }
    await nestFolder(dragSourceId, targetId);
    setDragSourceId(null);
  }

  function onDragEnd() {
    setDragSourceId(null);
    setDragOverId(null);
  }

  // Build a display list: for nested folders, show them indented under their parent
  // Simple flat list sorted by name; nested folders appear indented
  function buildTree(items: Folder[]): { folder: Folder; depth: number }[] {
    const result: { folder: Folder; depth: number }[] = [];
    const childrenOf = new Map<string | null, Folder[]>();
    for (const f of items) {
      const key = f.parent_id ?? null;
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key)!.push(f);
    }
    function walk(parentId: string | null, depth: number) {
      for (const f of (childrenOf.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
        result.push({ folder: f, depth });
        walk(f.id, depth + 1);
      }
    }
    walk(null, 0);
    return result;
  }

  const tree = buildTree(folders);

  return (
    <div className="min-h-full bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4 flex items-center gap-3">
        <button onClick={() => router.push("/drive")} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-gray-900">Folders</h1>
        <span className="text-xs text-gray-400 ml-1">{folders.length}</span>
        <p className="ml-auto text-xs text-gray-400">Drag folders onto each other to nest them</p>
      </div>

      {/* Tabs (mirroring Drive) */}
      <div className="border-b border-gray-100 px-8">
        <div className="flex gap-1">
          {(["All Files", "Folders", "Shared", "Deleted"] as const).map((tab) => (
            <button key={tab}
              onClick={() => {
                if (tab === "All Files") router.push("/drive");
                else if (tab === "Shared") router.push("/drive/shared");
                else if (tab === "Deleted") router.push("/drive/trash");
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "Folders" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-4">
        {/* Root drop zone — un-nest to top level */}
        <div
          onDragOver={(e) => { if (dragSourceId) { e.preventDefault(); setDragOverId("__root__"); } }}
          onDragLeave={() => setDragOverId(null)}
          onDrop={(e) => onDrop(e, null)}
          className={`mb-4 px-4 py-2 rounded-xl border-2 border-dashed text-xs text-center transition-colors ${
            dragOverId === "__root__" ? "border-blue-400 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-400"
          }`}
        >
          Drop here to move to top level
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
            <div className="w-14 h-14 rounded-2xl bg-yellow-50 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium mb-1">No folders yet</p>
            <p className="text-sm text-gray-400 mb-5">Create folders from the Drive page to organize your files</p>
            <button onClick={() => router.push("/drive")}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm hover:bg-gray-700 transition-colors">
              Go to Drive
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {tree.map(({ folder, depth }) => {
              const isDragOver = dragOverId === folder.id;
              const isDragging = dragSourceId === folder.id;
              const isEditing = editingId === folder.id;
              const menuOpen = contextMenuId === folder.id;

              return (
                <div
                  key={folder.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, folder.id)}
                  onDragOver={(e) => onDragOver(e, folder.id)}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, folder.id)}
                  onDragEnd={onDragEnd}
                  style={{ paddingLeft: `${depth * 24 + 16}px` }}
                  className={`group relative flex items-center gap-3 pr-4 py-3 rounded-xl transition-colors cursor-pointer ${
                    isDragOver ? "bg-blue-50 border border-blue-300" :
                    isDragging ? "opacity-40" :
                    "hover:bg-gray-50"
                  }`}
                  onClick={() => { if (!isEditing) router.push(`/drive?folder=${folder.id}`); }}
                >
                  {/* Drag handle */}
                  <svg className="w-3.5 h-3.5 text-gray-300 shrink-0 cursor-grab opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>

                  {/* Folder icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${folder.is_starred ? "bg-yellow-50" : "bg-amber-50"}`}>
                    <svg className={`w-4.5 h-4.5 ${folder.is_starred ? "text-yellow-500" : "text-amber-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <input
                        ref={editRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRename(folder.id); if (e.key === "Escape") setEditingId(null); }}
                        onBlur={() => saveRename(folder.id)}
                        className="w-full text-sm font-medium text-gray-900 bg-transparent border-b border-blue-400 focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <p className="text-sm font-medium text-gray-800 truncate"
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingId(folder.id); setEditingName(folder.name); }}>
                        {folder.is_starred && <span className="text-yellow-400 mr-1">★</span>}
                        {folder.name}
                        {folder.parent_id && (
                          <span className="ml-2 text-[10px] text-gray-400 font-normal">nested</span>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(folder.updated_at)} · {folder.asset_count} item{folder.asset_count !== 1 ? "s" : ""}</p>
                  </div>

                  {/* ••• menu */}
                  <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setContextMenuId(menuOpen ? null : folder.id); }}
                      className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
                      </svg>
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
                        <button onClick={() => { setContextMenuId(null); setEditingId(folder.id); setEditingName(folder.name); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          Rename
                        </button>
                        <button onClick={() => { setContextMenuId(null); toggleStar(folder.id); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                          <svg className="w-3.5 h-3.5 text-gray-400" fill={folder.is_starred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                          {folder.is_starred ? "Unstar" : "Star"}
                        </button>
                        <div className="my-1 border-t border-gray-100" />
                        <button onClick={() => { setContextMenuId(null); deleteFolder(folder.id, folder.name); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

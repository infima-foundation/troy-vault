"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUpload } from "./UploadProvider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROFILE_KEY = "troy_profile";

interface Conversation {
  id: string;
  title: string | null;
  updated_at: string;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const Icons = {
  Chat: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  Photo: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Document: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Folder: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  ),
  Files: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  Share: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  ),
  Trash: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  HardDrive: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  ChevronRight: ({ className }: { className?: string }) => (
    <svg className={className ?? "w-3 h-3"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  ChevronDown: ({ className }: { className?: string }) => (
    <svg className={className ?? "w-3 h-3"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  Collapse: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
    </svg>
  ),
  Expand: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Upload: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  ),
  Spreadsheet: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M3 14h18M10 3v18M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
    </svg>
  ),
  Presentation: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  ),
};

function initials(name: string): string {
  if (!name.trim()) return "TV";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Sidebar component ────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { openUpload } = useUpload();
  const [collapsed, setCollapsed] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [userName, setUserName] = useState("");
  const [driveOpen, setDriveOpen] = useState(true);
  const newMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) setUserName(JSON.parse(raw).name || "");
    } catch { /* ignore */ }

    fetch(`${API_URL}/api/v1/chat/conversations`)
      .then((r) => r.json())
      .then((data: Conversation[]) => setConversations(data.slice(0, 5)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) setShowNewMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewMenu]);

  function isActive(href: string, exact = false) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  const navLink = (active: boolean, extra = "") =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${extra} ${
      active ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`;

  const subLink = (active: boolean) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${
      active ? "bg-gray-100 text-gray-700 font-medium" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
    }`;

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

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-[260px]"} shrink-0 bg-white border-r border-gray-200 flex flex-col transition-[width] duration-200 overflow-hidden`}
    >
      {/* Logo + toggle */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
        {!collapsed && (
          <Link
            href="/"
            className="text-base font-bold text-gray-900 tracking-tight select-none hover:text-gray-700 transition-colors"
          >
            TROY
          </Link>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={`p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ${collapsed ? "mx-auto" : ""}`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <Icons.Expand /> : <Icons.Collapse />}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-1">

        {/* New button */}
        <div className="px-2 py-1" ref={newMenuRef}>
          <div className="relative">
            <button
              onClick={() => setShowNewMenu((v) => !v)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${collapsed ? "justify-center" : ""} bg-gray-900 text-white hover:bg-gray-700`}
            >
              <Icons.Plus />
              {!collapsed && <span>New</span>}
              {!collapsed && (
                <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {showNewMenu && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
                <button
                  onClick={() => { setShowNewMenu(false); openUpload("media"); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icons.Upload />
                  Upload File
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={() => createNewDoc("document")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icons.Document />
                  New Document
                </button>
                <button
                  onClick={() => createNewDoc("spreadsheet")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icons.Spreadsheet />
                  New Spreadsheet
                </button>
                <button
                  onClick={() => createNewDoc("presentation")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icons.Presentation />
                  New Presentation
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={() => { setShowNewMenu(false); router.push("/"); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icons.Chat />
                  New Chat
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mx-2 my-1 border-t border-gray-100" />

        {/* YOUR DRIVE section */}
        {!collapsed && (
          <div className="px-2">
            {/* Drive header — clicking toggles collapse */}
            <button
              onClick={() => setDriveOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 uppercase tracking-widest hover:bg-gray-50 hover:text-gray-600 transition-colors"
            >
              <Icons.HardDrive />
              <span className="flex-1 text-left">Your Drive</span>
              {driveOpen ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
            </button>

            {driveOpen && (
              <div className="mt-0.5 space-y-0.5">
                {/* All Files */}
                <Link href="/drive" className={subLink(isActive("/drive", true))}>
                  <Icons.Files />
                  All Files
                </Link>

                {/* Photos & Videos — single link, no sub-items */}
                <Link href="/library" className={subLink(isActive("/library"))}>
                  <Icons.Photo />
                  Photos &amp; Videos
                </Link>

                {/* Folders */}
                <Link href="/drive/folders" className={subLink(isActive("/drive/folders"))}>
                  <Icons.Folder />
                  Folders
                </Link>

                {/* Shared */}
                <Link href="/drive/shared" className={subLink(isActive("/drive/shared"))}>
                  <Icons.Share />
                  Shared
                </Link>

                {/* Deleted Files */}
                <Link href="/drive/trash" className={subLink(isActive("/drive/trash"))}>
                  <Icons.Trash />
                  Deleted Files
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Collapsed drive icon */}
        {collapsed && (
          <div className="px-2 space-y-0.5">
            <Link href="/drive" className={navLink(isActive("/drive", true), "justify-center")} title="All Files">
              <Icons.Files />
            </Link>
            <Link href="/library" className={navLink(isActive("/library"), "justify-center")} title="Photos & Videos">
              <Icons.Photo />
            </Link>
          </div>
        )}

        <div className="mx-2 my-1 border-t border-gray-100" />

        {/* CHATS section */}
        {!collapsed && (
          <>
            <div className="px-4 py-1 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Chats</span>
            </div>

            <div className="px-2 space-y-0.5">
              {conversations.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No conversations yet</p>
              ) : (
                conversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/?conv=${conv.id}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                      pathname === "/" ? "text-gray-600 hover:bg-gray-50" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    }`}
                  >
                    <span className="truncate">{conv.title || "New conversation"}</span>
                  </Link>
                ))
              )}
              {conversations.length > 0 && (
                <Link
                  href="/chats"
                  className="flex items-center px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  See all chats →
                </Link>
              )}
            </div>
          </>
        )}

        {collapsed && (
          <div className="px-2">
            <Link href="/chats" className={navLink(isActive("/chats"), "justify-center")} title="Chats">
              <Icons.Chat />
            </Link>
          </div>
        )}
      </div>

      {/* Bottom: user avatar */}
      <div className="border-t border-gray-100 p-3 shrink-0">
        <Link
          href="/profile"
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
        >
          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-white">{initials(userName)}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{userName || "Your profile"}</p>
              <p className="text-xs text-gray-400 group-hover:text-gray-500 transition-colors">Profile &amp; Settings</p>
            </div>
          )}
        </Link>
      </div>
    </aside>
  );
}

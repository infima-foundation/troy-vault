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

// ─── Tiny SVG icons ───────────────────────────────────────────────────────────

const Icons = {
  Home: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
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
  Album: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  HardDrive: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
};

// ─── Drive section items ──────────────────────────────────────────────────────

const driveItems = [
  {
    href: "/library",
    label: "Photos & Videos",
    icon: <Icons.Photo />,
    subItems: [
      { href: "/places", label: "Places", soon: true },
      { href: "/faces", label: "Faces", soon: true },
      { href: "/library", label: "Years", soon: true },
    ],
  },
  {
    href: "/documents",
    label: "Documents",
    icon: <Icons.Document />,
    subItems: [
      { href: "/documents", label: "PDF", soon: false },
      { href: "/documents", label: "Word", soon: false },
      { href: "/documents", label: "Text", soon: false },
    ],
  },
  {
    href: "/files",
    label: "Files",
    icon: <Icons.Folder />,
    subItems: [],
  },
  {
    href: "/albums",
    label: "Albums",
    icon: <Icons.Album />,
    subItems: [],
  },
];

function initials(name: string): string {
  if (!name.trim()) return "TV";
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
  const [expandedDrive, setExpandedDrive] = useState<string | null>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Load profile + conversations
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        setUserName(p.name || "");
      }
    } catch { /* ignore */ }

    fetch(`${API_URL}/api/v1/chat/conversations`)
      .then((r) => r.json())
      .then((data: Conversation[]) => setConversations(data.slice(0, 5)))
      .catch(() => {});
  }, []);

  // Close "New" menu on outside click
  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNewMenu]);

  // Auto-expand drive section when on a matching route
  useEffect(() => {
    const match = driveItems.find((d) => pathname.startsWith(d.href) && d.href !== "/");
    if (match) setExpandedDrive((prev) => prev ?? match.href);
  }, [pathname]);

  function isActive(href: string, exact = false) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
      active
        ? "bg-gray-100 text-gray-900 font-medium"
        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`;

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-[280px]"
      } shrink-0 bg-white border-r border-gray-200 flex flex-col transition-[width] duration-200 overflow-hidden`}
    >
      {/* ── Logo + toggle ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
        {!collapsed && (
          <span className="text-base font-bold text-gray-900 tracking-tight select-none">
            TROY
          </span>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={`p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ${
            collapsed ? "mx-auto" : ""
          }`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <Icons.Expand /> : <Icons.Collapse />}
        </button>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-1">
        {/* Home */}
        <div className="px-2">
          <Link href="/" className={navLinkClass(isActive("/", true))}>
            <Icons.Home />
            {!collapsed && <span>Home</span>}
          </Link>
        </div>

        {/* New button */}
        <div className="px-2 py-1" ref={newMenuRef}>
          <div className="relative">
            <button
              onClick={() => setShowNewMenu((v) => !v)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } bg-gray-900 text-white hover:bg-gray-700`}
            >
              <Icons.Plus />
              {!collapsed && <span>New</span>}
              {!collapsed && (
                <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {/* Dropdown menu */}
            {showNewMenu && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                <button
                  onClick={() => { setShowNewMenu(false); openUpload("media"); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icons.Upload />
                  Upload Photos &amp; Videos
                </button>
                <button
                  onClick={() => { setShowNewMenu(false); openUpload("docs"); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icons.Document />
                  Upload Documents
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={async () => {
                    setShowNewMenu(false);
                    try {
                      const conv = await fetch(`${API_URL}/api/v1/chat/conversations`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({}),
                      }).then((r) => r.json());
                      router.push(`/chat?conv=${conv.id}`);
                    } catch {
                      router.push("/chat");
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Icons.Chat />
                  New Chat
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Chat shortcut */}
        <div className="px-2">
          <Link href="/chat" className={navLinkClass(isActive("/chat"))}>
            <Icons.Chat />
            {!collapsed && <span>Chat</span>}
          </Link>
        </div>

        {/* Divider */}
        <div className="mx-2 my-1 border-t border-gray-100" />

        {/* Your Drive section */}
        {!collapsed && (
          <div className="px-4 py-1 flex items-center gap-1.5">
            <Icons.HardDrive />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Your Drive
            </span>
          </div>
        )}

        <div className="px-2 space-y-0.5">
          {driveItems.map((item) => {
            const active = isActive(item.href);
            const expanded = expandedDrive === item.href;
            const hasSubItems = item.subItems.length > 0;

            return (
              <div key={item.href}>
                <div className={navLinkClass(active) + " cursor-pointer"}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2.5 flex-1 min-w-0"
                  >
                    {item.icon}
                    {!collapsed && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                  </Link>
                  {!collapsed && hasSubItems && (
                    <button
                      onClick={() => setExpandedDrive(expanded ? null : item.href)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0"
                    >
                      {expanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                    </button>
                  )}
                </div>

                {/* Sub-items */}
                {!collapsed && expanded && hasSubItems && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    {item.subItems.map((sub) => (
                      <div key={sub.label} className="flex items-center">
                        {sub.soon ? (
                          <span className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-gray-400 cursor-default select-none w-full">
                            {sub.label}
                            <span className="ml-auto text-[9px] font-medium text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded">
                              Soon
                            </span>
                          </span>
                        ) : (
                          <Link
                            href={sub.href}
                            className="flex-1 px-3 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                          >
                            {sub.label}
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="mx-2 my-1 border-t border-gray-100" />

        {/* Chats section */}
        {!collapsed && (
          <>
            <div className="px-4 py-1 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Chats
              </span>
            </div>

            <div className="px-2 space-y-0.5">
              {conversations.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No conversations yet</p>
              ) : (
                conversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href="/chat"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                      isActive("/chat")
                        ? "text-gray-600 hover:bg-gray-50"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    }`}
                  >
                    <span className="truncate">{conv.title || "New conversation"}</span>
                  </Link>
                ))
              )}
              {conversations.length > 0 && (
                <Link
                  href="/chat"
                  className="flex items-center px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  See all chats →
                </Link>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Bottom: user avatar + profile ────────────────────────────── */}
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
              <p className="text-sm font-medium text-gray-800 truncate">
                {userName || "Your profile"}
              </p>
              <p className="text-xs text-gray-400 group-hover:text-gray-500 transition-colors">
                Profile &amp; Settings
              </p>
            </div>
          )}
        </Link>
      </div>
    </aside>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Conversation {
  id: string;
  title: string | null;
  pinned: boolean;
  is_starred: boolean;
  last_message: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

function formatRelative(s: string): string {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetch(`${API_URL}/api/v1/chat/conversations`).then((r) => r.json());
      setConversations(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleStar(conv: Conversation) {
    const r = await fetch(`${API_URL}/api/v1/chat/conversations/${conv.id}/star`, { method: "PATCH" });
    const updated = await r.json();
    setConversations((prev) => prev.map((c) => c.id === conv.id ? updated : c));
  }

  async function togglePin(conv: Conversation) {
    const r = await fetch(`${API_URL}/api/v1/chat/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !conv.pinned }),
    });
    const updated = await r.json();
    setConversations((prev) => prev.map((c) => c.id === conv.id ? updated : c));
  }

  async function deleteConv(id: string) {
    if (!confirm("Delete this conversation?")) return;
    await fetch(`${API_URL}/api/v1/chat/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }

  async function saveTitle(id: string) {
    if (!editingTitle.trim()) { setEditingId(null); return; }
    const r = await fetch(`${API_URL}/api/v1/chat/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editingTitle.trim() }),
    });
    const updated = await r.json();
    setConversations((prev) => prev.map((c) => c.id === id ? updated : c));
    setEditingId(null);
  }

  const pinned = conversations.filter((c) => c.pinned || c.is_starred);
  const rest = conversations.filter((c) => !c.pinned && !c.is_starred);

  function ConvCard({ conv }: { conv: Conversation }) {
    const isEditing = editingId === conv.id;
    return (
      <div
        className={`relative bg-white border rounded-2xl p-5 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-all group ${
          conv.is_starred ? "border-yellow-300 ring-1 ring-yellow-200" :
          conv.pinned ? "border-blue-200 ring-1 ring-blue-100" :
          "border-gray-200 hover:border-gray-300"
        }`}
        onClick={() => { if (!isEditing) router.push(`/?conv=${conv.id}`); }}
      >
        {/* Star / pin indicators */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {conv.is_starred && <span className="text-yellow-400 text-sm">★</span>}
            {conv.pinned && !conv.is_starred && (
              <svg className="w-3.5 h-3.5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            )}
          </div>
          {/* Hover actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => toggleStar(conv)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-yellow-500 transition-colors"
              title={conv.is_starred ? "Unstar" : "Star"}
            >
              <svg className="w-3.5 h-3.5" fill={conv.is_starred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
            <button
              onClick={() => togglePin(conv)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-blue-500 transition-colors"
              title={conv.pinned ? "Unpin" : "Pin"}
            >
              <svg className="w-3.5 h-3.5" fill={conv.pinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            <button
              onClick={() => deleteConv(conv.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Title */}
        {isEditing ? (
          <input
            autoFocus
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle(conv.id);
              if (e.key === "Escape") setEditingId(null);
            }}
            onBlur={() => saveTitle(conv.id)}
            className="text-sm font-semibold text-gray-900 bg-transparent border-b border-blue-400 focus:outline-none w-full"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p
            className="text-sm font-semibold text-gray-900 line-clamp-2"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingId(conv.id);
              setEditingTitle(conv.title || "");
            }}
            title="Double-click to rename"
          >
            {conv.title || "New conversation"}
          </p>
        )}

        {/* Last message preview */}
        {conv.last_message && (
          <p className="text-xs text-gray-400 line-clamp-2">{conv.last_message}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-[11px] text-gray-400">{formatRelative(conv.updated_at)}</span>
          <span className="text-[11px] text-gray-400">{conv.message_count} msg{conv.message_count !== 1 ? "s" : ""}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4 flex items-center gap-4">
        <h1 className="text-base font-semibold text-gray-900 flex-1">All Chats</h1>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-36 bg-gray-50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium mb-1">No conversations yet</p>
            <p className="text-sm text-gray-400 mb-5">Start a conversation with TROY</p>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm hover:bg-gray-700 transition-colors"
            >
              Start chatting
            </button>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="mb-8">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Pinned &amp; Starred</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {pinned.map((c) => <ConvCard key={c.id} conv={c} />)}
                </div>
              </div>
            )}
            {rest.length > 0 && (
              <div>
                {pinned.length > 0 && (
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Recent</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {rest.map((c) => <ConvCard key={c.id} conv={c} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

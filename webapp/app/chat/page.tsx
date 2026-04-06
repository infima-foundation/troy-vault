"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROFILE_KEY = "troy_profile";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  name: string;
  occupation: string;
  about: string;
  language: string;
  tone: string;
}

interface Conversation {
  id: string;
  title: string | null;
  pinned: boolean;
  last_message: string | null;
  updated_at: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function convTitle(conv: Conversation): string {
  return conv.title || "New conversation";
}

// ─── TROY avatar ──────────────────────────────────────────────────────────────

function TroyAvatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-white/10 flex items-center justify-center shrink-0 border border-white/10"
      style={{ width: size, height: size }}
    >
      <span className="text-[10px] font-bold text-white/60 select-none">T</span>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[72%]">
          <div className="bg-white text-black rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </div>
          <p className="text-[10px] text-white/20 mt-1 text-right pr-1">{formatTime(msg.created_at)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 mb-4">
      <TroyAvatar />
      <div className="max-w-[72%]">
        <div className="bg-[#1a1a1a] border border-white/6 text-white/90 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
        <p className="text-[10px] text-white/20 mt-1 pl-1">{formatTime(msg.created_at)}</p>
      </div>
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-2.5 mb-4">
      <TroyAvatar />
      <div className="bg-[#1a1a1a] border border-white/6 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Conversation row ─────────────────────────────────────────────────────────

function ConvRow({
  conv,
  active,
  onClick,
  onPin,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const [hovering, setHovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`relative group rounded-xl transition-colors ${
        active ? "bg-white/10" : "hover:bg-white/6"
      }`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { setHovering(false); setMenuOpen(false); }}
    >
      <button
        onClick={onClick}
        className="w-full text-left px-3 py-2.5 pr-8"
      >
        <p className={`text-sm truncate ${active ? "text-white" : "text-white/70"}`}>
          {convTitle(conv)}
        </p>
        {conv.last_message && (
          <p className="text-xs text-white/30 truncate mt-0.5">{conv.last_message}</p>
        )}
        <p className="text-[10px] text-white/20 mt-1">{formatRelative(conv.updated_at)}</p>
      </button>

      {/* Actions — show on hover */}
      {hovering && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5">
          {/* Pin */}
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            title={conv.pinned ? "Unpin" : "Pin"}
            className="p-1 rounded-md hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill={conv.pinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
          {/* Delete */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            className="p-1 rounded-md hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Context chip ─────────────────────────────────────────────────────────────

function ContextChip({ docCount }: { docCount: number | null }) {
  if (docCount === null) return null;
  if (docCount === 0) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/8 text-xs text-white/30">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        No files context
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/8 text-xs text-white/40">
      <svg className="w-3 h-3 text-emerald-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="text-white/50">Using</span>
      <span className="text-white/70 font-medium">{docCount} document{docCount !== 1 ? "s" : ""}</span>
    </div>
  );
}

// ─── Empty chat state ─────────────────────────────────────────────────────────

function EmptyChat({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 pb-24">
      <div className="w-14 h-14 rounded-2xl bg-white/6 border border-white/8 flex items-center justify-center mb-5">
        <span className="text-xl font-bold text-white/30">T</span>
      </div>
      <h2 className="text-base font-medium text-white/60 mb-1">TROY is ready</h2>
      <p className="text-sm text-white/25 max-w-xs leading-relaxed mb-6">
        Ask anything about your vault — documents, photos, or anything you&#39;ve stored.
      </p>
      <button
        onClick={onNew}
        className="px-4 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-white/60 hover:text-white text-sm transition-colors"
      >
        Start a conversation
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [docCount, setDocCount] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load document count for context chip ────────────────────────────────────
  useEffect(() => {
    fetch(`${API_URL}/api/v1/assets?file_type=document&page=1&page_size=1`)
      .then((r) => r.json())
      .then((d) => setDocCount(d.total ?? 0))
      .catch(() => setDocCount(0));
  }, []);

  // ── Load conversations ───────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/conversations`);
      const data = await res.json();
      setConversations(data);
    } catch {
      // backend unreachable
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Load messages for active conversation ────────────────────────────────────
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/conversations/${convId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeConvId) loadMessages(activeConvId);
    else setMessages([]);
  }, [activeConvId, loadMessages]);

  // ── Auto-scroll to bottom ────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ── New conversation ─────────────────────────────────────────────────────────
  async function createConversation(): Promise<string | null> {
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const conv = await res.json();
      setConversations((prev) => [conv, ...prev]);
      setActiveConvId(conv.id);
      setMessages([]);
      return conv.id;
    } catch {
      return null;
    }
  }

  // ── Send message ─────────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    let convId = activeConvId;
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    // Optimistic user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setInput("");
    setSending(true);

    const profile = loadProfile();

    try {
      const res = await fetch(`${API_URL}/api/v1/chat/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, profile }),
      });
      const asst = await res.json();
      setMessages((prev) => [...prev, asst]);
      // Refresh conv list to update title + last_message
      await loadConversations();
    } catch {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Something went wrong. Please try again.",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  // ── Handle Enter key ─────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Pin / unpin ──────────────────────────────────────────────────────────────
  async function togglePin(conv: Conversation) {
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/conversations/${conv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !conv.pinned }),
      });
      const updated = await res.json();
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? updated : c)));
    } catch { /* ignore */ }
  }

  // ── Delete conversation ──────────────────────────────────────────────────────
  async function deleteConversation(convId: string) {
    try {
      await fetch(`${API_URL}/api/v1/chat/conversations/${convId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch { /* ignore */ }
  }

  // ── Pinned / unpinned split ──────────────────────────────────────────────────
  const pinned = conversations.filter((c) => c.pinned);
  const unpinned = conversations.filter((c) => !c.pinned);

  // ── Auto-resize textarea ─────────────────────────────────────────────────────
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <div className="flex h-full">
      {/* ── Left panel: conversation list ─────────────────────────────────── */}
      <div className="w-[260px] shrink-0 border-r border-white/8 flex flex-col bg-[#0a0a0a]">
        {/* New chat button */}
        <div className="p-3 border-b border-white/6">
          <button
            onClick={createConversation}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/6 hover:bg-white/10 text-white/60 hover:text-white text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-white/20 text-center py-8">No conversations yet</p>
          )}

          {pinned.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest px-3 py-2">
                Pinned
              </p>
              {pinned.map((conv) => (
                <ConvRow
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeConvId}
                  onClick={() => setActiveConvId(conv.id)}
                  onPin={() => togglePin(conv)}
                  onDelete={() => deleteConversation(conv.id)}
                />
              ))}
              {unpinned.length > 0 && (
                <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest px-3 py-2 pt-3">
                  Recent
                </p>
              )}
            </>
          )}

          {unpinned.map((conv) => (
            <ConvRow
              key={conv.id}
              conv={conv}
              active={conv.id === activeConvId}
              onClick={() => setActiveConvId(conv.id)}
              onPin={() => togglePin(conv)}
              onDelete={() => deleteConversation(conv.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Right panel: active conversation ──────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {activeConv && (
          <div className="px-6 py-4 border-b border-white/6 flex items-center gap-3">
            <TroyAvatar size={32} />
            <div>
              <p className="text-sm font-medium text-white">{convTitle(activeConv)}</p>
              <p className="text-xs text-white/25">TROY · Personal vault assistant</p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {!activeConvId ? (
            <EmptyChat onNew={createConversation} />
          ) : loadingMessages ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center pb-24">
              <TroyAvatar size={40} />
              <p className="text-sm text-white/30 mt-4">Say something to start the conversation.</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              {sending && <TypingIndicator />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-white/6 px-6 py-4">
          {/* Context chip row */}
          <div className="flex items-center gap-2 mb-3">
            <ContextChip docCount={docCount} />
          </div>

          {/* Input bar */}
          <div className="flex items-end gap-3 bg-[#1a1a1a] border border-white/10 rounded-2xl px-4 py-3 focus-within:border-white/20 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask TROY anything about your files…"
              rows={1}
              disabled={sending}
              className="flex-1 bg-transparent text-white placeholder-white/20 text-sm resize-none focus:outline-none leading-relaxed max-h-40 disabled:opacity-50"
              style={{ height: "24px" }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center hover:bg-white/90 disabled:opacity-25 disabled:cursor-not-allowed transition-all shrink-0 mb-0.5"
            >
              {sending ? (
                <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-white/15 mt-2 text-center">
            Shift+Enter for newline · Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}

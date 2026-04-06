"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROFILE_KEY = "troy_profile";

interface Profile {
  name: string; occupation: string; about: string; language: string; tone: string;
}
interface Conversation {
  id: string; title: string | null; pinned: boolean;
  last_message: string | null; updated_at: string;
}
interface Message {
  id: string; role: "user" | "assistant"; content: string; created_at: string;
}

function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
}

function formatRelative(s: string): string {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(s: string): string {
  return new Date(s).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function TroyAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
      <span className="text-[10px] font-bold text-white">T</span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 mb-5">
      <TroyAvatar />
      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-5">
        <div className="max-w-[75%]">
          <div className="bg-gray-900 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 text-right pr-1">{formatTime(msg.created_at)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-3 mb-5">
      <TroyAvatar />
      <div className="max-w-[75%]">
        <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5 pl-1">{formatTime(msg.created_at)}</p>
      </div>
    </div>
  );
}

function ConvRow({
  conv, active, onClick, onPin, onDelete,
}: {
  conv: Conversation; active: boolean; onClick: () => void;
  onPin: () => void; onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`group relative rounded-lg transition-colors ${active ? "bg-gray-100" : "hover:bg-gray-50"}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button onClick={onClick} className="w-full text-left px-3 py-2.5 pr-12">
        <p className={`text-sm truncate ${active ? "text-gray-900 font-medium" : "text-gray-700"}`}>
          {conv.title || "New conversation"}
        </p>
        {conv.last_message && (
          <p className="text-xs text-gray-400 truncate mt-0.5">{conv.last_message}</p>
        )}
        <p className="text-[11px] text-gray-400 mt-1">{formatRelative(conv.updated_at)}</p>
      </button>
      {hover && (
        <div className="absolute top-2 right-2 flex gap-0.5">
          <button onClick={(e) => { e.stopPropagation(); onPin(); }}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-3.5 h-3.5" fill={conv.pinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

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

  useEffect(() => {
    fetch(`${API_URL}/api/v1/assets?file_type=document&page=1&page_size=1`)
      .then((r) => r.json()).then((d) => setDocCount(d.total ?? 0)).catch(() => setDocCount(0));
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const data = await fetch(`${API_URL}/api/v1/chat/conversations`).then((r) => r.json());
      setConversations(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (id: string) => {
    setLoadingMessages(true);
    try {
      const data = await fetch(`${API_URL}/api/v1/chat/conversations/${id}/messages`).then((r) => r.json());
      setMessages(data);
    } catch { setMessages([]); }
    finally { setLoadingMessages(false); }
  }, []);

  useEffect(() => {
    if (activeConvId) loadMessages(activeConvId);
    else setMessages([]);
  }, [activeConvId, loadMessages]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  async function createConversation(): Promise<string | null> {
    try {
      const conv = await fetch(`${API_URL}/api/v1/chat/conversations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      }).then((r) => r.json());
      setConversations((prev) => [conv, ...prev]);
      setActiveConvId(conv.id);
      setMessages([]);
      return conv.id;
    } catch { return null; }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    let convId = activeConvId;
    if (!convId) { convId = await createConversation(); if (!convId) return; }

    const tempMsg: Message = { id: `tmp-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, tempMsg]);
    setInput("");
    setSending(true);
    if (inputRef.current) { inputRef.current.style.height = "24px"; }

    try {
      const asst = await fetch(`${API_URL}/api/v1/chat/conversations/${convId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, profile: loadProfile() }),
      }).then((r) => r.json());
      setMessages((prev) => [...prev, asst]);
      await loadConversations();
    } catch {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Something went wrong. Please try again.", created_at: new Date().toISOString() }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  async function togglePin(conv: Conversation) {
    try {
      const updated = await fetch(`${API_URL}/api/v1/chat/conversations/${conv.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !conv.pinned }),
      }).then((r) => r.json());
      setConversations((prev) => prev.map((c) => c.id === conv.id ? updated : c));
    } catch { /* ignore */ }
  }

  async function deleteConversation(id: string) {
    try {
      await fetch(`${API_URL}/api/v1/chat/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
    } catch { /* ignore */ }
  }

  const pinned = conversations.filter((c) => c.pinned);
  const unpinned = conversations.filter((c) => !c.pinned);
  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <div className="flex h-full bg-white">
      {/* Left panel */}
      <div className="w-[300px] shrink-0 border-r border-gray-200 flex flex-col bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Chats</h2>
          <button
            onClick={createConversation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">No conversations yet</p>
          )}
          {pinned.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 py-1.5">Pinned</p>
              {pinned.map((c) => <ConvRow key={c.id} conv={c} active={c.id === activeConvId}
                onClick={() => setActiveConvId(c.id)} onPin={() => togglePin(c)} onDelete={() => deleteConversation(c.id)} />)}
              {unpinned.length > 0 && <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 py-1.5 pt-3">Recent</p>}
            </>
          )}
          {unpinned.map((c) => <ConvRow key={c.id} conv={c} active={c.id === activeConvId}
            onClick={() => setActiveConvId(c.id)} onPin={() => togglePin(c)} onDelete={() => deleteConversation(c.id)} />)}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Conv header */}
        {activeConv && (
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
            <TroyAvatar />
            <div>
              <p className="text-sm font-semibold text-gray-900">{activeConv.title || "New conversation"}</p>
              <p className="text-xs text-gray-400">TROY · Personal vault assistant</p>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {!activeConvId ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center mb-5 shadow-lg">
                  <span className="text-xl font-bold text-white">T</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Ask me anything about your files</h2>
                <p className="text-sm text-gray-500 max-w-sm">
                  I can search your documents, describe your photos, and answer questions about everything in your vault.
                </p>
                <button
                  onClick={createConversation}
                  className="mt-6 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  Start a conversation
                </button>
              </div>
            ) : loadingMessages ? (
              <div className="flex justify-center py-12">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
                <TroyAvatar />
                <p className="text-sm text-gray-400 mt-4">Say something to get started.</p>
              </div>
            ) : (
              <>
                {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
                {sending && <TypingIndicator />}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 bg-white px-6 py-4">
          {/* Context chip */}
          {docCount !== null && (
            <div className="flex items-center gap-2 mb-3">
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
                docCount > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-gray-50 text-gray-500"
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${docCount > 0 ? "bg-emerald-500" : "bg-gray-400"}`} />
                {docCount > 0 ? `Using ${docCount} document${docCount !== 1 ? "s" : ""}` : "No files context"}
              </div>
            </div>
          )}

          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 border border-gray-200 rounded-2xl px-4 py-3 bg-white focus-within:border-gray-400 focus-within:shadow-sm transition-all">
              {/* Paperclip */}
              <button
                title="Attach from vault (coming soon)"
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0 mb-0.5"
                onClick={() => {}}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask TROY anything about your files…"
                rows={1}
                disabled={sending}
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none leading-relaxed max-h-40 disabled:opacity-50"
                style={{ height: "24px" }}
              />

              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-all shrink-0"
              >
                {sending ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROFILE_KEY = "troy_profile";

interface Profile {
  name: string; occupation: string; about: string; language: string; tone: string;
}
interface Conversation {
  id: string; title: string | null; pinned: boolean; is_starred: boolean;
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

function MessageBubble({ msg, streaming = false, onEdit }: { msg: Message; streaming?: boolean; onEdit?: () => void }) {
  const [hover, setHover] = React.useState(false);
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-5 group" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div className="flex items-end gap-2 max-w-[75%]">
          {hover && onEdit && (
            <button onClick={onEdit} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0 mb-5" title="Edit message">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          <div>
            <div className="bg-gray-900 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5 text-right pr-1">{formatTime(msg.created_at)}</p>
          </div>
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
          {streaming && (
            <span className="inline-block w-0.5 h-4 bg-gray-500 ml-0.5 align-middle animate-pulse" />
          )}
        </div>
        {!streaming && (
          <p className="text-[11px] text-gray-400 mt-1.5 pl-1">{formatTime(msg.created_at)}</p>
        )}
      </div>
    </div>
  );
}

function ConvRow({
  conv, active, onClick, onPin, onDelete, onStar, onRename,
}: {
  conv: Conversation; active: boolean; onClick: () => void;
  onPin: () => void; onDelete: () => void; onStar: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conv.title || "");
  const menuRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  React.useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function submitRename() {
    const t = editTitle.trim();
    if (t) onRename(t);
    setEditing(false);
  }

  return (
    <div className={`group relative rounded-lg transition-colors ${active ? "bg-gray-100" : "hover:bg-gray-50"}`}>
      {editing ? (
        <div className="px-3 py-2.5">
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setEditing(false); }}
            onBlur={submitRename}
            className="w-full text-sm text-gray-900 bg-transparent border-b border-blue-400 focus:outline-none"
          />
        </div>
      ) : (
        <button onClick={onClick} className="w-full text-left px-3 py-2.5 pr-10">
          <p className={`text-sm truncate ${active ? "text-gray-900 font-medium" : "text-gray-700"}`}>
            {conv.is_starred && <span className="text-yellow-400 mr-1">★</span>}
            {conv.title || "New conversation"}
          </p>
          {conv.last_message && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{conv.last_message}</p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">{formatRelative(conv.updated_at)}</p>
        </button>
      )}

      {/* ••• button */}
      <div ref={menuRef} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setEditTitle(conv.title || ""); setEditing(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Rename
            </button>
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onPin(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <svg className="w-3.5 h-3.5 text-gray-400" fill={conv.pinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              {conv.pinned ? "Unpin" : "Pin"}
            </button>
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onStar(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <svg className="w-3.5 h-3.5 text-gray-400" fill={conv.is_starred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
              {conv.is_starred ? "Unstar" : "Star"}
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inner content (needs useSearchParams) ────────────────────────────────────

function ChatContent() {
  const searchParams = useSearchParams();
  const pendingConvId = searchParams.get("conv");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMsg, setStreamingMsg] = useState<Message | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgContent, setEditingMsgContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/assets?file_type=document&page=1&page_size=1`)
      .then((r) => r.json()).then((d) => setDocCount(d.total ?? 0)).catch(() => setDocCount(0));
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const data = await fetch(`${API_URL}/api/v1/chat/conversations`).then((r) => r.json());
      setConversations(data);
      return data as Conversation[];
    } catch { return []; }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Auto-select conversation from URL param (set by Sidebar "New Chat")
  useEffect(() => {
    if (pendingConvId && conversations.length > 0) {
      const found = conversations.find((c) => c.id === pendingConvId);
      if (found && activeConvId !== pendingConvId) {
        setActiveConvId(pendingConvId);
      }
    }
  }, [pendingConvId, conversations, activeConvId]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMsg, sending]);

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

  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    let convId = activeConvId;
    if (!convId) { convId = await createConversation(); if (!convId) return; }

    const tempMsg: Message = {
      id: `tmp-${Date.now()}`, role: "user", content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput("");
    setSending(true);
    setStreamingMsg(null);
    if (inputRef.current) inputRef.current.style.height = "24px";

    const streamId = `streaming-${Date.now()}`;
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch(`${API_URL}/api/v1/chat/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, profile: loadProfile() }),
        signal: abort.signal,
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.token !== undefined) {
              currentContent += event.token;
              setStreamingMsg({
                id: streamId,
                role: "assistant",
                content: currentContent,
                created_at: new Date().toISOString(),
              });
            }

            if (event.done && event.id) {
              const finalMsg: Message = {
                id: event.id,
                role: "assistant",
                content: event.content,
                created_at: event.created_at,
              };
              setMessages((prev) => [...prev, finalMsg]);
              setStreamingMsg(null);
            }
          } catch { /* ignore parse errors */ }
        }
      }

      await loadConversations();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User stopped the stream — keep partial content as the final message
        setStreamingMsg((prev) => {
          if (prev) setMessages((msgs) => [...msgs, { ...prev, id: `stopped-${Date.now()}` }]);
          return null;
        });
      } else {
        setMessages((prev) => [...prev, {
          id: `err-${Date.now()}`, role: "assistant",
          content: "Something went wrong. Please try again.",
          created_at: new Date().toISOString(),
        }]);
        setStreamingMsg(null);
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function startEditMessage(msg: Message) {
    setEditingMsgId(msg.id);
    setEditingMsgContent(msg.content);
  }

  function submitEditMessage() {
    if (!editingMsgId || !editingMsgContent.trim()) { setEditingMsgId(null); return; }
    const text = editingMsgContent.trim();
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === editingMsgId);
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });
    setEditingMsgId(null);
    sendMessage(text);
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

  async function starConversation(conv: Conversation) {
    try {
      const updated = await fetch(`${API_URL}/api/v1/chat/conversations/${conv.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_starred: !conv.is_starred }),
      }).then((r) => r.json());
      setConversations((prev) => prev.map((c) => c.id === conv.id ? updated : c));
    } catch { /* ignore */ }
  }

  async function renameConversation(conv: Conversation, title: string) {
    try {
      const updated = await fetch(`${API_URL}/api/v1/chat/conversations/${conv.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).then((r) => r.json());
      setConversations((prev) => prev.map((c) => c.id === conv.id ? updated : c));
    } catch { /* ignore */ }
  }

  async function deleteConversation(id: string) {
    try {
      await fetch(`${API_URL}/api/v1/chat/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) { setActiveConvId(null); setMessages([]); setStreamingMsg(null); }
    } catch { /* ignore */ }
  }

  const pinned = conversations.filter((c) => c.pinned);
  const unpinned = conversations.filter((c) => !c.pinned);
  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <div className="flex h-full bg-white">
      {/* Left panel */}
      <div className="w-[300px] shrink-0 border-r border-gray-200 flex flex-col bg-white">
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

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">No conversations yet</p>
          )}
          {pinned.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 py-1.5">Pinned</p>
              {pinned.map((c) => (
                <ConvRow key={c.id} conv={c} active={c.id === activeConvId}
                  onClick={() => setActiveConvId(c.id)} onPin={() => togglePin(c)} onDelete={() => deleteConversation(c.id)}
                  onStar={() => starConversation(c)} onRename={(t) => renameConversation(c, t)} />
              ))}
              {unpinned.length > 0 && (
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 py-1.5 pt-3">Recent</p>
              )}
            </>
          )}
          {unpinned.map((c) => (
            <ConvRow key={c.id} conv={c} active={c.id === activeConvId}
              onClick={() => setActiveConvId(c.id)} onPin={() => togglePin(c)} onDelete={() => deleteConversation(c.id)}
              onStar={() => starConversation(c)} onRename={(t) => renameConversation(c, t)} />
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
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
            ) : (
              <>
                {messages.length === 0 && !streamingMsg && !sending && (
                  <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
                    <TroyAvatar />
                    <p className="text-sm text-gray-400 mt-4">Say something to get started.</p>
                  </div>
                )}
                {messages.map((m) => {
                  if (editingMsgId === m.id) {
                    return (
                      <div key={m.id} className="flex justify-end mb-5">
                        <div className="max-w-[75%] w-full">
                          <textarea
                            autoFocus
                            value={editingMsgContent}
                            onChange={(e) => setEditingMsgContent(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEditMessage(); } if (e.key === "Escape") setEditingMsgId(null); }}
                            className="w-full bg-gray-900 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-gray-500"
                            rows={3}
                          />
                          <div className="flex gap-2 mt-1.5 justify-end">
                            <button onClick={() => setEditingMsgId(null)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                            <button onClick={submitEditMessage} className="px-3 py-1 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700">Resubmit</button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return <MessageBubble key={m.id} msg={m} onEdit={m.role === "user" ? () => startEditMessage(m) : undefined} />;
                })}
                {sending && !streamingMsg && <TypingIndicator />}
                {streamingMsg && <MessageBubble key="streaming" msg={streamingMsg} streaming />}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 bg-white px-6 py-4">
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
              <button
                title="Attach from vault (coming soon)"
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors shrink-0 mb-0.5"
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

              {sending ? (
                <button
                  onClick={stopStreaming}
                  className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center hover:bg-red-600 transition-all shrink-0"
                  title="Stop generating"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="5" y="5" width="14" height="14" rx="1" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim()}
                  className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-all shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page (Suspense wrapper required for useSearchParams) ─────────────────────

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-white" />}>
      <ChatContent />
    </Suspense>
  );
}

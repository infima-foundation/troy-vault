"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PROFILE_KEY = "troy_profile";

interface Profile {
  name: string; occupation: string; about: string; language: string; tone: string;
}
interface Message {
  id: string; role: "user" | "assistant"; content: string; created_at: string;
}

function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
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

function MessageBubble({ msg, streaming = false }: { msg: Message; streaming?: boolean }) {
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

const SUGGESTED_PROMPTS = [
  "What photos did I take last summer?",
  "Summarize my documents",
  "Find files from last week",
  "What's in my vault?",
];

// ─── Inner content ────────────────────────────────────────────────────────────

function HomeContent() {
  const searchParams = useSearchParams();
  const convIdParam = searchParams.get("conv");

  const [activeConvId, setActiveConvId] = useState<string | null>(convIdParam);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMsg, setStreamingMsg] = useState<Message | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasMessages = messages.length > 0 || !!streamingMsg || sending;

  // Load messages when conv param changes
  const loadMessages = useCallback(async (id: string) => {
    setLoadingMessages(true);
    try {
      const data = await fetch(`${API_URL}/api/v1/chat/conversations/${id}/messages`).then((r) => r.json());
      setMessages(data);
    } catch { setMessages([]); }
    finally { setLoadingMessages(false); }
  }, []);

  useEffect(() => {
    if (convIdParam) {
      setActiveConvId(convIdParam);
      loadMessages(convIdParam);
    } else {
      setActiveConvId(null);
      setMessages([]);
    }
  }, [convIdParam, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMsg, sending]);

  async function createConversation(): Promise<string | null> {
    try {
      const conv = await fetch(`${API_URL}/api/v1/chat/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => r.json());
      setActiveConvId(conv.id);
      // Update URL without navigation
      window.history.replaceState(null, "", `/?conv=${conv.id}`);
      return conv.id;
    } catch { return null; }
  }

  async function sendMessage(text?: string) {
    const msgText = (text ?? input).trim();
    if (!msgText || sending) return;
    let convId = activeConvId;
    if (!convId) { convId = await createConversation(); if (!convId) return; }

    const tempMsg: Message = {
      id: `tmp-${Date.now()}`, role: "user", content: msgText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput("");
    setSending(true);
    setStreamingMsg(null);
    if (inputRef.current) { inputRef.current.style.height = "24px"; }

    const streamId = `streaming-${Date.now()}`;
    try {
      const response = await fetch(`${API_URL}/api/v1/chat/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msgText, profile: loadProfile() }),
      });
      if (!response.body) throw new Error("No body");

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
              setStreamingMsg({ id: streamId, role: "assistant", content: currentContent, created_at: new Date().toISOString() });
            }
            if (event.done && event.id) {
              setMessages((prev) => [...prev, {
                id: event.id, role: "assistant",
                content: event.content, created_at: event.created_at,
              }]);
              setStreamingMsg(null);
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, role: "assistant",
        content: "Something went wrong. Please try again.",
        created_at: new Date().toISOString(),
      }]);
      setStreamingMsg(null);
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

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!hasMessages && !loadingMessages ? (
          /* Empty state — Claude-style centered */
          <div className="h-full flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-2xl flex flex-col items-center">
              {/* Logo */}
              <div className="w-16 h-16 rounded-2xl bg-gray-900 flex items-center justify-center mb-4 shadow-lg">
                <span className="text-2xl font-bold text-white">T</span>
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-1">TROY</h1>
              <p className="text-sm text-gray-500 mb-8 text-center">Your personal vault assistant — ask me anything about your files</p>

              {/* Input */}
              <div className="w-full border border-gray-200 rounded-2xl px-4 py-3 bg-white shadow-sm focus-within:border-gray-400 focus-within:shadow-md transition-all">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask TROY anything about your files…"
                  rows={1}
                  disabled={sending}
                  className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none leading-relaxed max-h-40 disabled:opacity-50"
                  style={{ height: "24px" }}
                />
                <div className="flex items-center justify-between mt-2">
                  <button
                    title="Attach from vault (coming soon)"
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || sending}
                    className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Suggested prompts */}
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="px-4 py-2 rounded-full border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : loadingMessages ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
          </div>
        ) : (
          /* Chat messages */
          <div className="max-w-3xl mx-auto px-6 py-8">
            {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
            {sending && !streamingMsg && <TypingIndicator />}
            {streamingMsg && <MessageBubble key="streaming" msg={streamingMsg} streaming />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar — only shown when conversation is active */}
      {(hasMessages || activeConvId) && (
        <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4">
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
              <button
                onClick={() => sendMessage()}
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
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-full bg-white" />}>
      <HomeContent />
    </Suspense>
  );
}

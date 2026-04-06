"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Dynamically import heavy editor components (SSR disabled)
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface Asset {
  id: string;
  filename: string;
  file_type: string;
  mime_type: string;
  size_bytes: number;
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine doc type from mime type
  const isSpreadsheet = asset?.mime_type === "text/csv";
  const isPresentation = asset?.filename?.endsWith(".pptx") || (asset?.filename?.endsWith(".md") && asset?.filename?.includes("presentation"));
  const isDocument = !isSpreadsheet && !isPresentation;

  // Load asset and file content
  useEffect(() => {
    async function load() {
      try {
        const [assetRes, fileRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/assets/${id}`),
          fetch(`${API_URL}/api/v1/assets/${id}/file`),
        ]);
        const assetData = await assetRes.json();
        setAsset(assetData);
        setTitleValue(assetData.filename ?? "");

        if (fileRes.ok) {
          const text = await fileRes.text();
          setContent(text);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, [id]);

  const save = useCallback(async (text: string) => {
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/v1/assets/${id}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      setLastSaved(new Date());
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }, [id]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => { save(content); }, 30000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [content, save]);

  async function saveTitle() {
    if (!titleValue.trim()) return;
    try {
      await fetch(`${API_URL}/api/v1/assets/${id}/filename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: titleValue.trim() }),
      });
      setAsset((prev) => prev ? { ...prev, filename: titleValue.trim() } : prev);
    } catch { /* ignore */ }
    setEditingTitle(false);
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white text-center px-8">
        <p className="text-gray-600 font-medium mb-2">Document not found</p>
        <button onClick={() => router.push("/drive")} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Drive
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top bar */}
      <div className="shrink-0 border-b border-gray-100 px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => { save(content); router.push("/drive"); }}
          className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          title="Back to Drive"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Document title */}
        {editingTitle ? (
          <input
            autoFocus
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
            onBlur={saveTitle}
            className="text-sm font-semibold text-gray-900 bg-transparent border-b border-blue-400 focus:outline-none flex-1 max-w-xs"
          />
        ) : (
          <p
            className="text-sm font-semibold text-gray-900 cursor-text hover:text-gray-600 transition-colors"
            onDoubleClick={() => setEditingTitle(true)}
            title="Double-click to rename"
          >
            {asset.filename}
          </p>
        )}

        <div className="flex-1" />

        {/* Auto-save status */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {saving ? (
            <>
              <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
              Saving…
            </>
          ) : lastSaved ? (
            <>
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved {lastSaved.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </>
          ) : (
            <span>Auto-saves every 30s</span>
          )}
        </div>

        <button
          onClick={() => save(content)}
          className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors"
        >
          Save
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {isPresentation ? (
          /* Presentation placeholder */
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <p className="text-gray-700 font-semibold text-lg mb-1">Coming soon — presentation editor</p>
            <p className="text-sm text-gray-400 max-w-sm">
              Slide-based presentation editing is on the roadmap. For now, you can edit the raw content as markdown below.
            </p>
            <div className="mt-6 w-full max-w-2xl">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-64 p-4 border border-gray-200 rounded-xl text-sm text-gray-700 font-mono resize-none focus:outline-none focus:border-gray-400 transition-colors"
                placeholder="Markdown content…"
              />
            </div>
          </div>
        ) : isSpreadsheet ? (
          /* Spreadsheet — simple CSV editor */
          <SpreadsheetEditor content={content} onChange={setContent} />
        ) : (
          /* Document — markdown editor */
          <div className="h-full flex flex-col" data-color-mode="light">
            <MDEditor
              value={content}
              onChange={(v) => setContent(v ?? "")}
              height="100%"
              preview="live"
              style={{ flex: 1, borderRadius: 0, border: "none" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Simple CSV spreadsheet editor ───────────────────────────────────────────

function SpreadsheetEditor({ content, onChange }: { content: string; onChange: (v: string) => void }) {
  const [rows, setRows] = useState<string[][]>(() => parseCSV(content));

  function parseCSV(csv: string): string[][] {
    if (!csv.trim()) return [["", "", "", ""], ["", "", "", ""], ["", "", "", ""]];
    return csv.split("\n").map((r) => r.split(",").map((c) => c.trim()));
  }

  function toCSV(data: string[][]): string {
    return data.map((r) => r.join(",")).join("\n");
  }

  useEffect(() => {
    setRows(parseCSV(content));
  }, [content]);

  function updateCell(ri: number, ci: number, val: string) {
    const next = rows.map((r, i) => i === ri ? r.map((c, j) => j === ci ? val : c) : r);
    setRows(next);
    onChange(toCSV(next));
  }

  function addRow() {
    const next = [...rows, Array(rows[0]?.length ?? 4).fill("")];
    setRows(next);
    onChange(toCSV(next));
  }

  function addCol() {
    const next = rows.map((r) => [...r, ""]);
    setRows(next);
    onChange(toCSV(next));
  }

  const colCount = Math.max(...rows.map((r) => r.length), 4);

  return (
    <div className="h-full flex flex-col overflow-auto p-4">
      <div className="overflow-auto border border-gray-200 rounded-xl">
        <table className="border-collapse min-w-full">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? "bg-gray-50" : "hover:bg-gray-50/50"}>
                <td className="border border-gray-200 px-2 py-1 text-xs text-gray-400 w-8 text-center select-none bg-gray-50">
                  {ri + 1}
                </td>
                {Array.from({ length: colCount }).map((_, ci) => (
                  <td key={ci} className="border border-gray-200 p-0 min-w-[120px]">
                    <input
                      value={row[ci] ?? ""}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      className={`w-full px-2 py-1.5 text-sm focus:outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-300 ${ri === 0 ? "font-semibold text-gray-700" : "text-gray-600"}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={addRow}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          + Add row
        </button>
        <button onClick={addCol}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          + Add column
        </button>
      </div>
    </div>
  );
}

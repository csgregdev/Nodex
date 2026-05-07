import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "../components/ui/input"

interface SearchResult {
  id: string;
  name: string;
  type: string;
  file: string;
  line?: number;
  language?: string;
}

interface SearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  onNodeSelect: (id: string) => void;
}

const TYPE_COLORS: Record<string, { border: string; color: string; bg: string }> = {
  fn:        { border: "rgba(6,182,212,0.5)",   color: "#22d3ee", bg: "rgba(6,182,212,0.1)" },
  class:     { border: "rgba(168,85,247,0.5)",  color: "#c084fc", bg: "rgba(168,85,247,0.1)" },
  interface: { border: "rgba(74,222,128,0.5)",  color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
  module:    { border: "rgba(251,191,36,0.5)",  color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  widget:    { border: "rgba(251,146,60,0.5)",  color: "#fb923c", bg: "rgba(251,146,60,0.1)" },
};

export function SearchBar({ query, onQueryChange, onNodeSelect }: SearchBarProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
        const data = (await r.json()) as SearchResult[];
        setResults(data);
        setOpen(true);
      } catch { /* ignore */ }
    }, 200);
  }, []);

  useEffect(() => { search(query); }, [query, search]);

  return (
    <div style={{ position: "relative", flex: 1, maxWidth: 448 }}>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          color: "var(--muted-foreground)", fontSize: 14, pointerEvents: "none", userSelect: "none",
        }}>⌕</span>
        <Input
          ref={inputRef}
          placeholder="Search symbols, files..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{
            width: "100%", height: 32, paddingLeft: 30, paddingRight: 10,
            fontSize: 12, fontFamily: "ui-monospace, monospace",
            background: "var(--background)", border: "1px solid var(--border)",
            borderRadius: 2, color: "var(--foreground)", outline: "none",
            boxSizing: "border-box",
          }}
          onFocusCapture={e => (e.target as HTMLInputElement).style.borderColor = "var(--primary)"}
          onBlurCapture={e => (e.target as HTMLInputElement).style.borderColor = "var(--border)"}
        />
      </div>

      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
          zIndex: 50, background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", overflow: "hidden",
        }}>
          {results.map(r => {
            const tc = TYPE_COLORS[r.type];
            return (
              <div
                key={r.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", cursor: "pointer", fontSize: 12,
                  background: hoveredId === r.id ? "var(--accent)" : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setHoveredId(r.id)}
                onMouseLeave={() => setHoveredId(null)}
                onMouseDown={() => { onNodeSelect(r.id); setOpen(false); }}
              >
                {tc && (
                  <span style={{
                    fontSize: 9, padding: "1px 4px", borderRadius: 2,
                    border: `1px solid ${tc.border}`, color: tc.color, background: tc.bg,
                    flexShrink: 0, fontFamily: "ui-monospace, monospace",
                  }}>
                    {r.type}
                  </span>
                )}
                <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.name}
                </span>
                <span style={{ color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace", fontSize: 10, marginLeft: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {r.file}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

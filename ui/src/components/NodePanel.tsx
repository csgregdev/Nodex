import React, { useEffect, useState } from "react";

interface NodeData {
  node: {
    id: string;
    name: string;
    type: string;
    file: string;
    line?: number;
    language?: string;
    token?: string;
    summary?: string;
    complexity?: number;
  };
  meta: Array<{ key: string; value: string }>;
  outEdges: Array<{ to_id: string; relationship: string }>;
  inEdges: Array<{ from_id: string; relationship: string }>;
}

interface NodePanelProps {
  nodeId: string;
  onClose: () => void;
  onImpact: (id: string) => void;
  impactActive: boolean;
}

const TYPE_COLORS: Record<string, { border: string; color: string; bg: string }> = {
  fn:        { border: "rgba(6,182,212,0.5)",   color: "#22d3ee", bg: "rgba(6,182,212,0.1)" },
  class:     { border: "rgba(168,85,247,0.5)",  color: "#c084fc", bg: "rgba(168,85,247,0.1)" },
  interface: { border: "rgba(74,222,128,0.5)",  color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
  module:    { border: "rgba(251,191,36,0.5)",  color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  widget:    { border: "rgba(251,146,60,0.5)",  color: "#fb923c", bg: "rgba(251,146,60,0.1)" },
};

const s = {
  panel: {
    width: 360, flexShrink: 0,
    borderLeft: "1px solid var(--border)",
    background: "var(--card)",
    display: "flex", flexDirection: "column" as const,
    overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "flex-start", gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  label: {
    fontSize: 10, fontWeight: 600, padding: "1px 6px",
    borderRadius: 2, border: "1px solid",
    fontFamily: "ui-monospace, monospace",
  },
  name: { fontSize: 13, fontWeight: 600, fontFamily: "ui-monospace, monospace", color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  file: { fontSize: 11, color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  closeBtn: {
    background: "transparent", border: "none", cursor: "pointer",
    color: "var(--muted-foreground)", fontSize: 14, padding: "2px 6px",
    borderRadius: 2, flexShrink: 0,
  },
  scrollBody: { flex: 1, overflowY: "auto" as const },
  section: { display: "flex", flexDirection: "column" as const, gap: 6 },
  sectionLabel: { fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--muted-foreground)" },
  divider: { height: 1, background: "var(--border)", margin: "4px 0" },
  tokenBox: {
    cursor: "pointer", borderRadius: 2, padding: "8px 12px",
    fontFamily: "ui-monospace, monospace", fontSize: 12,
    color: "var(--primary)", background: "var(--secondary)",
    border: "1px solid var(--border)", transition: "background 0.15s",
  },
  impactBtn: (active: boolean) => ({
    width: "100%", padding: "6px 12px", fontSize: 12,
    fontFamily: "ui-monospace, monospace", cursor: "pointer", borderRadius: 2,
    border: active ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--border)",
    color: active ? "#f87171" : "var(--muted-foreground)",
    background: active ? "rgba(239,68,68,0.1)" : "transparent",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    transition: "all 0.15s",
  }),
  edgeRow: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "4px 8px", borderRadius: 2, fontSize: 12,
    fontFamily: "ui-monospace, monospace",
  },
};

export function NodePanel({ nodeId, onClose, onImpact, impactActive }: NodePanelProps) {
  const [data, setData] = useState<NodeData | null>(null);
  const [tokenHover, setTokenHover] = useState(false);

  useEffect(() => {
    setData(null);
    fetch(`/api/node/${encodeURIComponent(nodeId)}`)
      .then(r => r.json())
      .then((d: unknown) => setData(d as NodeData));
  }, [nodeId]);

  const copyToken = () => {
    if (data?.node.token) (navigator as any).clipboard?.writeText(data.node.token);
  };

  if (!data) {
    return (
      <div style={s.panel as any}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", gap: 4 }}>
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
        </div>
      </div>
    );
  }

  const { node, meta, outEdges, inEdges } = data;
  const gotchas = meta.filter(m => m.key === "gotcha");
  const decisions = meta.filter(m => m.key === "ai_decision");
  const typeColors = TYPE_COLORS[node.type];

  const complexityColor =
    !node.complexity || node.complexity === 0 ? "var(--muted-foreground)"
    : node.complexity > 10 ? "#f87171"
    : node.complexity > 5  ? "#fbbf24"
    : "#4ade80";

  return (
    <div style={s.panel as any}>
      {/* Header */}
      <div style={s.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {typeColors && (
              <span style={{
                ...s.label,
                borderColor: typeColors.border,
                color: typeColors.color,
                background: typeColors.bg,
              }}>
                {node.type}
              </span>
            )}
            {node.language && (
              <span style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" }}>
                {node.language}
              </span>
            )}
          </div>
          <div style={s.name}>{node.name}</div>
          <div style={s.file}>{node.file}{node.line ? `:${node.line}` : ""}</div>
        </div>
        <button style={s.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Body */}
      <div style={s.scrollBody}>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

          {node.token && (
            <div style={s.section}>
              <div style={s.sectionLabel}>Token</div>
              <div
                style={{ ...s.tokenBox, background: tokenHover ? "var(--accent)" : "var(--secondary)" }}
                onClick={copyToken}
                onMouseEnter={() => setTokenHover(true)}
                onMouseLeave={() => setTokenHover(false)}
                title="Click to copy"
              >
                {node.token}
              </div>
            </div>
          )}

          {node.summary && (
            <>
              {node.token && <div style={s.divider} />}
              <div style={s.section}>
                <div style={s.sectionLabel}>Summary</div>
                <p style={{ fontSize: 12, color: "rgba(223,223,226,0.8)", lineHeight: 1.6, margin: 0 }}>{node.summary}</p>
              </div>
            </>
          )}

          {gotchas.length > 0 && (
            <>
              <div style={s.divider} />
              <div style={s.section}>
                <div style={s.sectionLabel}>Gotchas</div>
                {gotchas.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "rgba(251,191,36,0.9)" }}>
                    <span style={{ flexShrink: 0 }}>⚠</span>
                    <span style={{ lineHeight: 1.6 }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {decisions.length > 0 && (
            <>
              <div style={s.divider} />
              <div style={s.section}>
                <div style={s.sectionLabel}>AI Decisions</div>
                {decisions.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "rgba(0,212,255,0.8)" }}>
                    <span style={{ flexShrink: 0 }}>◆</span>
                    <span style={{ lineHeight: 1.6 }}>{m.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!!node.complexity && node.complexity > 0 && (
            <>
              <div style={s.divider} />
              <div style={s.section}>
                <div style={s.sectionLabel}>Complexity</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                  <span style={{ color: complexityColor }}>{node.complexity}</span>
                  <span style={{ color: "var(--muted-foreground)", fontSize: 11 }}> cyclomatic</span>
                </div>
              </div>
            </>
          )}

          <div style={s.divider} />
          <button style={s.impactBtn(impactActive)} onClick={() => onImpact(node.id)}>
            <span>{impactActive ? "◉" : "◎"}</span>
            {impactActive ? "Hide Impact" : "Show Impact Map"}
          </button>

          {outEdges.length > 0 && (
            <>
              <div style={s.divider} />
              <div style={s.section}>
                <div style={s.sectionLabel}>Calls / Imports ({outEdges.length})</div>
                {outEdges.slice(0, 8).map((e, i) => (
                  <div key={i} style={s.edgeRow} title={e.to_id}>
                    <span style={{ color: "var(--muted-foreground)", flexShrink: 0 }}>{e.relationship}→</span>
                    <span style={{ color: "rgba(223,223,226,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.to_id.split("::").pop()}</span>
                  </div>
                ))}
                {outEdges.length > 8 && (
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", padding: "4px 8px" }}>+{outEdges.length - 8} more</div>
                )}
              </div>
            </>
          )}

          {inEdges.length > 0 && (
            <>
              <div style={s.divider} />
              <div style={s.section}>
                <div style={s.sectionLabel}>Used By ({inEdges.length})</div>
                {inEdges.slice(0, 8).map((e, i) => (
                  <div key={i} style={s.edgeRow} title={e.from_id}>
                    <span style={{ color: "var(--muted-foreground)", flexShrink: 0 }}>←</span>
                    <span style={{ color: "rgba(223,223,226,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.from_id.split("::").pop()}</span>
                  </div>
                ))}
                {inEdges.length > 8 && (
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", padding: "4px 8px" }}>+{inEdges.length - 8} more</div>
                )}
              </div>
            </>
          )}

          <div style={{ height: 8 }} />
        </div>
      </div>
    </div>
  );
}

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
    last_ai?: number | null;
    hash?: string | null;
    current_hash?: string | null;
    hotspot_score?: number;
    commit_count?: number;
  };
  meta: Array<{ key: string; value: string; created?: number }>;
  outEdges: Array<{ to_id: string; relationship: string; weight?: number }>;
  inEdges: Array<{ from_id: string; relationship: string; weight?: number }>;
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

type AIStatus = "fresh" | "stale" | "unknown";

function getAIStatus(node: NodeData["node"]): AIStatus {
  if (node.last_ai == null) return "unknown";
  if (!node.hash || !node.current_hash) return "unknown";
  return node.hash === node.current_hash ? "fresh" : "stale";
}

function formatRelTime(unixSec: number): string {
  const diff = Math.floor((Date.now() / 1000) - unixSec);
  if (diff < 60) return "most";
  if (diff < 3600) return `${Math.floor(diff / 60)} perce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} órája`;
  return `${Math.floor(diff / 86400)} napja`;
}

const STATUS_COLORS: Record<AIStatus, { color: string; bg: string; border: string; label: string }> = {
  fresh:   { color: "#4ade80", bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.3)",  label: "FRISS" },
  stale:   { color: "#f97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.3)",  label: "ELAVULT" },
  unknown: { color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.3)", label: "ISMERETLEN" },
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
  actionBtn: (active: boolean, color?: string) => ({
    width: "100%", padding: "6px 12px", fontSize: 12,
    fontFamily: "ui-monospace, monospace", cursor: "pointer", borderRadius: 2,
    border: active ? `1px solid ${color ?? "rgba(239,68,68,0.5)"}` : "1px solid var(--border)",
    color: active ? (color ?? "#f87171") : "var(--muted-foreground)",
    background: active ? `${color ?? "rgba(239,68,68,"}0.1)` : "transparent",
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
  const [enriching, setEnriching] = useState(false);

  const loadNode = () => {
    setData(null);
    fetch(`/api/node/${encodeURIComponent(nodeId)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: unknown) => { if (d) setData(d as NodeData); });
  };

  useEffect(() => { loadNode(); }, [nodeId]);

  const copyToken = () => {
    if (data?.node.token) (navigator as any).clipboard?.writeText(data.node.token);
  };

  const handleEnrich = async () => {
    if (!data) return;
    setEnriching(true);
    try {
      await fetch(`/api/enrich/${encodeURIComponent(data.node.id)}`, { method: "POST" });
      loadNode();
    } finally {
      setEnriching(false);
    }
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
  const decisions = meta.filter(m => m.key === "ai_decision" || m.key === "decision");
  const whyMeta = meta.filter(m => m.key === "why");
  const tradeoffs = meta.filter(m => m.key === "tradeoff");
  const failedApproaches = meta.filter(m => m.key === "failed_approach");
  const gitDecisions = meta.filter(m => m.key === "git_decision");
  const coChanges = outEdges.filter(e => e.relationship === "co_changes");

  const typeColors = TYPE_COLORS[node.type];
  const aiStatus = getAIStatus(node);
  const statusStyle = STATUS_COLORS[aiStatus];
  const isStale = aiStatus === "stale";
  const isUnknown = aiStatus === "unknown";
  const hotspotScore = node.hotspot_score ?? 0;

  const complexityColor =
    !node.complexity || node.complexity === 0 ? "var(--muted-foreground)"
    : node.complexity > 10 ? "#f87171"
    : node.complexity > 5  ? "#fbbf24"
    : "#4ade80";

  const allDecisions = [...decisions, ...whyMeta, ...tradeoffs, ...failedApproaches, ...gitDecisions];
  const hasStaleDecision = allDecisions.length > 0 && isStale;

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

          {/* AI Knowledge Status */}
          <div style={s.section}>
            <div style={s.sectionLabel}>AI Tudás Állapota</div>
            <div style={{
              borderRadius: 4, padding: "10px 12px",
              background: statusStyle.bg,
              border: `1px solid ${statusStyle.border}`,
              display: "flex", flexDirection: "column", gap: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: statusStyle.color }}>
                  {statusStyle.label}
                </span>
                {node.last_ai && (
                  <span style={{ fontSize: 10, color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" }}>
                    AI utoljára látta: {formatRelTime(node.last_ai)}
                  </span>
                )}
              </div>
              {isStale && (
                <div style={{ fontSize: 11, color: "#f97316", fontFamily: "ui-monospace, monospace" }}>
                  ⚠ Fájl változott az AI indexelés óta
                </div>
              )}
              {hotspotScore > 0.4 && (
                <div style={{ fontSize: 11, color: hotspotScore > 0.7 ? "#ef4444" : "#f97316", fontFamily: "ui-monospace, monospace" }}>
                  🔥 Hotspot: {Math.round(hotspotScore * 100)}% — {node.commit_count ?? 0} commit / 90 nap
                </div>
              )}
              {(isStale || isUnknown) && (
                <button
                  style={{
                    marginTop: 4, padding: "5px 10px", fontSize: 11,
                    fontFamily: "ui-monospace, monospace", cursor: enriching ? "not-allowed" : "pointer",
                    borderRadius: 2, border: `1px solid ${statusStyle.border}`,
                    color: statusStyle.color, background: statusStyle.bg,
                    opacity: enriching ? 0.6 : 1,
                    transition: "all 0.15s", alignSelf: "flex-start",
                  }}
                  onClick={handleEnrich}
                  disabled={enriching}
                >
                  {enriching ? "⠸ Enrichment..." : "⚡ Enrich most"}
                </button>
              )}
            </div>
          </div>

          {node.token && (
            <>
              <div style={s.divider} />
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
            </>
          )}

          {node.summary && (
            <>
              <div style={s.divider} />
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

          {allDecisions.length > 0 && (
            <>
              <div style={s.divider} />
              <div style={s.section}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={s.sectionLabel}>Decisions</span>
                  {hasStaleDecision && (
                    <span style={{ fontSize: 9, color: "#f97316", fontFamily: "ui-monospace, monospace" }}>⚠ elavult</span>
                  )}
                </div>
                {allDecisions.map((m, i) => {
                  const keyColors: Record<string, string> = {
                    decision: "#22d3ee",
                    ai_decision: "#22d3ee",
                    why: "#a3e635",
                    tradeoff: "#fbbf24",
                    failed_approach: "#f87171",
                    git_decision: "#94a3b8",
                  };
                  const color = keyColors[m.key] ?? "#94a3b8";
                  return (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                      <span style={{ flexShrink: 0, color, fontFamily: "ui-monospace, monospace", fontSize: 10 }}>[{m.key}]</span>
                      <span style={{ lineHeight: 1.6, color: "rgba(223,223,226,0.8)" }}>{m.value}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {coChanges.length > 0 && (
            <>
              <div style={s.divider} />
              <div style={s.section}>
                <div style={s.sectionLabel}>Rejtett Coupling</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace", marginBottom: 2 }}>
                  Ezekkel a fájlokkal változik együtt rendszeresen:
                </div>
                {coChanges.slice(0, 5).map((e, i) => (
                  <div key={i} style={s.edgeRow}>
                    <span style={{ color: "#f97316", flexShrink: 0 }}>↔</span>
                    <span style={{ color: "rgba(223,223,226,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {e.to_id.replace(/^file::/, "")}
                    </span>
                    <span style={{ color: "var(--muted-foreground)", fontSize: 10, flexShrink: 0 }}>×{e.weight ?? 1}</span>
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
          <button
            style={{
              width: "100%", padding: "6px 12px", fontSize: 12,
              fontFamily: "ui-monospace, monospace", cursor: "pointer", borderRadius: 2,
              border: impactActive ? "1px solid rgba(239,68,68,0.5)" : "1px solid var(--border)",
              color: impactActive ? "#f87171" : "var(--muted-foreground)",
              background: impactActive ? "rgba(239,68,68,0.1)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.15s",
            }}
            onClick={() => onImpact(node.id)}
          >
            <span>{impactActive ? "◉" : "◎"}</span>
            {impactActive ? "Hide Impact" : "Show Impact Map"}
          </button>

          {outEdges.filter(e => e.relationship !== "co_changes").length > 0 && (
            <>
              <div style={s.divider} />
              <div style={s.section}>
                <div style={s.sectionLabel}>Calls / Imports ({outEdges.filter(e => e.relationship !== "co_changes").length})</div>
                {outEdges.filter(e => e.relationship !== "co_changes").slice(0, 8).map((e, i) => (
                  <div key={i} style={s.edgeRow} title={e.to_id}>
                    <span style={{ color: "var(--muted-foreground)", flexShrink: 0 }}>{e.relationship}→</span>
                    <span style={{ color: "rgba(223,223,226,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.to_id.split("::").pop()}</span>
                  </div>
                ))}
                {outEdges.filter(e => e.relationship !== "co_changes").length > 8 && (
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", padding: "4px 8px" }}>
                    +{outEdges.filter(e => e.relationship !== "co_changes").length - 8} more
                  </div>
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

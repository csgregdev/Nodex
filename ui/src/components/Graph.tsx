import React, { useEffect, useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type EdgeTypes,
  type Node as RFNode,
  type Edge as RFEdge,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import type { GraphNode, GraphEdge, GraphViewMode } from "../App";

// ── Edge relationship config ──────────────────────────────────────────────────
export const EDGE_STYLES: Record<string, { color: string; dash?: string; width?: number }> = {
  imports:    { color: "#6b7280", dash: "4 3",   width: 1   },
  calls:      { color: "#06b6d4", dash: undefined, width: 1.5 },
  extends:    { color: "#a855f7", dash: undefined, width: 2   },
  implements: { color: "#4ade80", dash: "2 2",   width: 1.5 },
  co_changes: { color: "#f97316", dash: "6 3",   width: 2   },
};
const DEFAULT_EDGE_STYLE: { color: string; dash?: string; width?: number } = { color: "#374151", width: 1 };

// ── Custom edge ───────────────────────────────────────────────────────────────
function NodexEdge({ id, sourceX, sourceY, targetX, targetY, data, label, markerEnd }: any) {
  const rel = (label as string) ?? "calls";
  const style = EDGE_STYLES[rel] ?? DEFAULT_EDGE_STYLE;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  const showLabels = (data as any)?.showLabels ?? false;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: style.color,
          strokeWidth: style.width ?? 1,
          strokeDasharray: style.dash,
          opacity: 0.7,
        }}
      />
      {showLabels && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 9,
              fontFamily: "ui-monospace, monospace",
              color: style.color,
              background: "var(--card)",
              padding: "1px 4px",
              borderRadius: 2,
              border: `1px solid ${style.color}33`,
              pointerEvents: "none",
            }}
            className="nodrag nopan"
          >
            {rel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function CoChangeEdge({ id, sourceX, sourceY, targetX, targetY, data, markerEnd }: any) {
  const weight = (data as any)?.weight ?? 1;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  const style = EDGE_STYLES["co_changes"]!;
  const opacity = Math.min(0.3 + (weight / 20) * 0.7, 1);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: style.color,
          strokeWidth: style.width ?? 2,
          strokeDasharray: style.dash,
          opacity,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 8,
            fontFamily: "ui-monospace, monospace",
            color: style.color,
            background: "var(--card)",
            padding: "1px 4px",
            borderRadius: 2,
            border: `1px solid ${style.color}55`,
            pointerEvents: "none",
            opacity: 0.8,
          }}
          className="nodrag nopan"
        >
          co×{weight}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const EDGE_TYPES: EdgeTypes = {
  nodexEdge: NodexEdge as any,
  coChangeEdge: CoChangeEdge as any,
};

// ── AI status helpers ─────────────────────────────────────────────────────────
type AIStatus = "fresh" | "stale" | "unknown" | "processing";

function aiStatusBorder(status: AIStatus, hotspotScore: number): React.CSSProperties {
  const borderWidth = hotspotScore > 0.7 ? 3 : hotspotScore > 0.4 ? 2 : 1;
  switch (status) {
    case "stale":   return { borderColor: "#f97316", borderWidth, boxShadow: "0 0 0 1px #f9731633" };
    case "unknown": return { borderColor: "#6b7280", borderWidth: 1, opacity: 0.7 };
    case "processing": return { borderColor: "#06b6d4", borderWidth: 2 };
    case "fresh":
    default:
      if (hotspotScore > 0.7) return { borderColor: "#ef4444", borderWidth };
      if (hotspotScore > 0.4) return { borderColor: "#f97316", borderWidth };
      return {};
  }
}

function AIStatusDot({ status }: { status: AIStatus }) {
  const colors: Record<AIStatus, string> = {
    fresh: "#4ade80",
    stale: "#f97316",
    unknown: "#6b7280",
    processing: "#06b6d4",
  };
  const isProcessing = status === "processing";
  return (
    <span style={{
      display: "inline-block",
      width: 6, height: 6,
      borderRadius: "50%",
      background: colors[status],
      marginLeft: 4,
      flexShrink: 0,
      animation: isProcessing ? "pulse 1s infinite" : undefined,
    }} title={`AI: ${status}`} />
  );
}

// ── Custom node ───────────────────────────────────────────────────────────────
const NodexNode = ({ data, selected }: { data: GraphNode["data"]; selected: boolean }) => {
  const typeClass = `nodex-node-${data.nodeType}`;
  const aiStatus = (data as any).aiStatus as AIStatus ?? "unknown";
  const hotspotScore = (data as any).hotspotScore as number ?? 0;
  const borderOverride = aiStatusBorder(aiStatus, hotspotScore);

  return (
    <div
      className={`nodex-node ${typeClass} ${selected ? "selected" : ""} ${aiStatus === "unknown" ? "ai-unknown" : ""}`}
      style={borderOverride}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="nodex-node-label" style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {data.label}
        </span>
        <AIStatusDot status={aiStatus} />
      </div>
      <div className="nodex-node-meta">{data.file.split("/").slice(-1)[0]}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {data.complexity > 3 && (
          <div className="nodex-node-complexity">cx:{data.complexity}</div>
        )}
        {hotspotScore > 0.4 && (
          <div className="nodex-node-complexity" style={{ color: hotspotScore > 0.7 ? "#ef4444" : "#f97316" }}>
            🔥{Math.round(hotspotScore * 100)}%
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
};

const NODE_TYPES: NodeTypes = { nodexNode: NodexNode as any };

// ── Dagre layout ──────────────────────────────────────────────────────────────
export type LayoutDir = "LR" | "TB";

function dagreLayout(nodes: RFNode[], edges: RFEdge[], direction: LayoutDir = "LR"): RFNode[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80, marginx: 40, marginy: 40 });

  for (const n of nodes) {
    g.setNode(n.id, { width: 180, height: 52 });
  }
  for (const e of edges) {
    if (e.source && e.target) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return pos ? { ...n, position: { x: pos.x - 90, y: pos.y - 26 } } : n;
  });
}

// ── Legend ────────────────────────────────────────────────────────────────────
function EdgeLegend() {
  return (
    <div style={{
      position: "absolute", bottom: 48, left: 12, zIndex: 10,
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 2, padding: "8px 12px",
      fontFamily: "ui-monospace, monospace", fontSize: 10,
      display: "flex", flexDirection: "column", gap: 5,
    }}>
      {Object.entries(EDGE_STYLES).map(([rel, style]) => (
        <div key={rel} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="24" height="10">
            <line
              x1="0" y1="5" x2="24" y2="5"
              stroke={style.color}
              strokeWidth={style.width ?? 1}
              strokeDasharray={style.dash}
            />
          </svg>
          <span style={{ color: "var(--muted-foreground)" }}>{rel}</span>
        </div>
      ))}
    </div>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
interface ToolbarProps {
  showLabels: boolean;
  onToggleLabels: () => void;
  layoutDir: LayoutDir;
  onToggleLayout: () => void;
  showLegend: boolean;
  onToggleLegend: () => void;
  viewMode: GraphViewMode;
  neighborhoodActive: boolean;
  onClearNeighborhood: () => void;
}

function GraphToolbar({
  showLabels, onToggleLabels,
  layoutDir, onToggleLayout,
  showLegend, onToggleLegend,
  viewMode, neighborhoodActive, onClearNeighborhood,
}: ToolbarProps) {
  const btn = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--accent)" : "transparent",
    border: "1px solid var(--border)",
    color: active ? "var(--foreground)" : "var(--muted-foreground)",
    fontSize: 10, fontFamily: "ui-monospace, monospace",
    padding: "3px 8px", borderRadius: 2, cursor: "pointer",
    transition: "all 0.15s",
  });

  return (
    <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10, display: "flex", gap: 4 }}>
      {neighborhoodActive && (
        <button style={{ ...btn(true), borderColor: "rgba(6,182,212,0.5)", color: "#22d3ee" }} onClick={onClearNeighborhood}>
          ← full graph
        </button>
      )}
      <button style={btn(showLabels)} onClick={onToggleLabels}>
        {showLabels ? "labels on" : "labels off"}
      </button>
      <button style={btn(false)} onClick={onToggleLayout}>
        {layoutDir === "LR" ? "→ LR" : "↓ TB"}
      </button>
      <button style={btn(showLegend)} onClick={onToggleLegend}>
        legend
      </button>
    </div>
  );
}

// ── GraphView ─────────────────────────────────────────────────────────────────
interface GraphViewProps {
  searchQuery: string;
  selectedNodeId: string | null;
  impactNodeId: string | null;
  onNodeSelect: (id: string | null) => void;
  viewMode: GraphViewMode;
}

const CLUSTER_THRESHOLD = 500;

function buildRFEdges(edges: GraphEdge[], showLabels: boolean): RFEdge[] {
  return edges.map((e, i) => {
    const isCoChange = e.label === "co_changes" || (e as any).type === "coChangeEdge";
    return {
      id: `e${(e as any).id ?? i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      type: isCoChange ? "coChangeEdge" : "nodexEdge",
      data: { showLabels, weight: (e as any).data?.weight ?? 1 },
    };
  });
}

// ── Context menu ──────────────────────────────────────────────────────────────
interface ContextMenuProps {
  x: number;
  y: number;
  nodeId: string;
  file: string;
  onClose: () => void;
}

function NodeContextMenu({ x, y, nodeId, file, onClose }: ContextMenuProps) {
  const action = async (url: string) => {
    onClose();
    await fetch(url, { method: "POST" });
    window.location.reload();
  };

  return (
    <div
      style={{
        position: "fixed", left: x, top: y, zIndex: 9999,
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 4, padding: "4px 0",
        fontFamily: "ui-monospace, monospace", fontSize: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        minWidth: 200,
      }}
      onClick={e => e.stopPropagation()}
    >
      {[
        { label: "⚡ Enrich this now", url: `/api/enrich/${encodeURIComponent(nodeId)}` },
        { label: "📂 Enrich this module", url: `/api/enrich/module/${encodeURIComponent(file)}` },
        { label: "🔴 Mark as stale", url: `/api/mark-stale/${encodeURIComponent(nodeId)}` },
      ].map(item => (
        <button
          key={item.label}
          style={{
            display: "block", width: "100%", textAlign: "left",
            background: "transparent", border: "none",
            color: "var(--foreground)", fontSize: 12,
            fontFamily: "ui-monospace, monospace",
            padding: "6px 14px", cursor: "pointer",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--accent)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          onClick={() => action(item.url)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function GraphViewInner({
  searchQuery, selectedNodeId, impactNodeId, onNodeSelect, viewMode,
}: GraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const [loading, setLoading] = useState(true);
  const [impactData, setImpactData] = useState<{ direct: string[]; indirect: string[] } | null>(null);
  const [showLabels, setShowLabels] = useState(() => localStorage.getItem("nodex-edge-labels") === "true");
  const [layoutDir, setLayoutDir] = useState<LayoutDir>(() =>
    (localStorage.getItem("nodex-layout-dir") as LayoutDir) ?? "LR"
  );
  const [showLegend, setShowLegend] = useState(false);
  const [totalNodeCount, setTotalNodeCount] = useState(0);
  const [neighborhoodCenter, setNeighborhoodCenter] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; file: string } | null>(null);
  const { fitView } = useReactFlow();

  const applyLayout = useCallback((rfNodes: RFNode[], rfEdges: RFEdge[], dir: LayoutDir) => {
    const laid = dagreLayout(rfNodes, rfEdges, dir);
    setNodes(laid as any);
    setEdges(rfEdges);
    setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 50);
  }, [fitView]);

  const loadGraph = useCallback((url: string) => {
    setLoading(true);
    fetch(url)
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data as { nodes: GraphNode[]; edges: GraphEdge[]; total?: number };
        setTotalNodeCount(d.total ?? d.nodes.length);
        const rfEdges = buildRFEdges(d.edges, showLabels);
        applyLayout(d.nodes as RFNode[], rfEdges, layoutDir);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [showLabels, layoutDir, applyLayout]);

  // Load graph based on viewMode
  useEffect(() => {
    setNeighborhoodCenter(null);
    setImpactData(null);
    if (viewMode === "tree") {
      loadGraph("/api/graph/tree");
    } else {
      loadGraph("/api/graph");
    }
  }, [viewMode]);

  // Neighborhood mode: double-click node
  const handleNeighborhood = useCallback((nodeId: string) => {
    if (viewMode !== "full") return;
    setNeighborhoodCenter(nodeId);
    setLoading(true);
    fetch(`/api/graph/neighborhood/${encodeURIComponent(nodeId)}?depth=1`)
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data as { nodes: GraphNode[]; edges: GraphEdge[] };
        const rfEdges = buildRFEdges(d.edges, showLabels);
        applyLayout(d.nodes as RFNode[], rfEdges, layoutDir);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [viewMode, showLabels, layoutDir, applyLayout]);

  const clearNeighborhood = useCallback(() => {
    setNeighborhoodCenter(null);
    loadGraph("/api/graph");
  }, [loadGraph]);

  // Update edge showLabels without refetch
  useEffect(() => {
    setEdges(prev => prev.map(e => ({
      ...e,
      data: { ...(e.data ?? {}), showLabels },
    })));
    localStorage.setItem("nodex-edge-labels", String(showLabels));
  }, [showLabels]);

  // Re-layout on direction change
  useEffect(() => {
    if (nodes.length === 0) return;
    const laid = dagreLayout(nodes, edges, layoutDir);
    setNodes(laid as any);
    localStorage.setItem("nodex-layout-dir", layoutDir);
    setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 50);
  }, [layoutDir]);

  // Impact map
  useEffect(() => {
    if (!impactNodeId) { setImpactData(null); return; }
    fetch(`/api/impact/${encodeURIComponent(impactNodeId)}`)
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data as { direct: Array<{ id: string }>; indirect: Array<{ id: string }> };
        setImpactData({
          direct: d.direct.map(n => n.id),
          indirect: d.indirect.map(n => n.id),
        });
      });
  }, [impactNodeId]);

  const filteredNodeIds = useMemo(() => {
    if (!searchQuery) return null;
    const q = searchQuery.toLowerCase();
    return new Set(
      nodes.filter(n => {
        const d = n.data as GraphNode["data"];
        return d.label.toLowerCase().includes(q) ||
          d.file.toLowerCase().includes(q) ||
          (d.token ?? "").toLowerCase().includes(q);
      }).map(n => n.id)
    );
  }, [nodes, searchQuery]);

  const displayNodes = useMemo(() => nodes.map(n => {
    const isDimmed = filteredNodeIds && !filteredNodeIds.has(n.id);
    const isImpactDirect = impactData?.direct.includes(n.id);
    const isImpactIndirect = impactData?.indirect.includes(n.id);
    return {
      ...n,
      selected: n.id === selectedNodeId,
      className: [
        isImpactDirect ? "impact-direct" : "",
        isImpactIndirect ? "impact-indirect" : "",
      ].filter(Boolean).join(" "),
      style: isDimmed
        ? { opacity: 0.15, transition: "opacity 0.2s" }
        : { opacity: 1, transition: "opacity 0.2s" },
    };
  }), [nodes, selectedNodeId, filteredNodeIds, impactData]);

  const onNodeClick = useCallback((_: any, node: RFNode) => {
    onNodeSelect(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId, onNodeSelect]);

  const onNodeDoubleClick = useCallback((_: any, node: RFNode) => {
    handleNeighborhood(node.id);
  }, [handleNeighborhood]);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: RFNode) => {
    e.preventDefault();
    const file = (node.data as GraphNode["data"]).file;
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, file });
  }, []);

  const centerStyle: React.CSSProperties = {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--background)",
  };

  if (loading) {
    return (
      <div style={centerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
          <span style={{ marginLeft: 8, fontSize: 13, color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" }}>
            Loading graph...
          </span>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div style={centerStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ color: "var(--foreground)", fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>No index found</div>
          <div style={{ color: "var(--muted-foreground)", fontSize: 13, fontFamily: "ui-monospace, monospace" }}>Run: nodex init</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, position: "relative" }} onClick={() => setContextMenu(null)}>
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          file={contextMenu.file}
          onClose={() => setContextMenu(null)}
        />
      )}
      <GraphToolbar
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels(v => !v)}
        layoutDir={layoutDir}
        onToggleLayout={() => setLayoutDir(d => d === "LR" ? "TB" : "LR")}
        showLegend={showLegend}
        onToggleLegend={() => setShowLegend(v => !v)}
        viewMode={viewMode}
        neighborhoodActive={!!neighborhoodCenter}
        onClearNeighborhood={clearNeighborhood}
      />
      {showLegend && <EdgeLegend />}
      {totalNodeCount > CLUSTER_THRESHOLD && !neighborhoodCenter && (
        <div style={{
          position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)",
          zIndex: 10,
          background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.4)",
          borderRadius: 2, padding: "4px 12px",
          fontSize: 11, fontFamily: "ui-monospace, monospace", color: "#fbbf24",
        }}>
          {totalNodeCount} nodes — double-click node for neighborhood view, or switch to file tree
        </div>
      )}
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={() => { onNodeSelect(null); setContextMenu(null); }}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        minZoom={0.05}
        maxZoom={2}
        onlyRenderVisibleElements={totalNodeCount > CLUSTER_THRESHOLD}
      >
        <Background color="#1a1a2e" gap={28} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const t = (n.data as GraphNode["data"])?.nodeType;
            if (t === "fn") return "#00d4ff44";
            if (t === "class") return "#9d5cff44";
            if (t === "interface") return "#00ff9d44";
            if (t === "module") return "#ffaa0044";
            return "#1e1e32";
          }}
          maskColor="rgba(7,7,9,0.8)"
        />
      </ReactFlow>
    </div>
  );
}

export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}

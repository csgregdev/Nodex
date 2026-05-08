import React, { useEffect, useCallback, useState, useRef, useDeferredValue } from "react";
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
import { Code2, Box, Braces, Package, Component, Hash } from "lucide-react";
import type { GraphNode, GraphEdge, GraphViewMode } from "../App";
import { ALL_NODE_TYPES, ALL_EDGE_TYPES } from "./FilterBar";

// ── Node type icon + color config ─────────────────────────────────────────────
const NODE_ICON_MAP: Record<string, React.ElementType> = {
  fn: Code2, class: Box, interface: Braces, module: Package, widget: Component, type: Hash,
};
const NODE_COLOR_MAP: Record<string, string> = {
  fn: "#22d3ee", class: "#c084fc", interface: "#4ade80",
  module: "#fbbf24", widget: "#fb923c", type: "#6b7280",
};

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
  const Icon = NODE_ICON_MAP[data.nodeType];
  const iconColor = NODE_COLOR_MAP[data.nodeType] ?? "var(--muted-foreground)";

  return (
    <div
      className={`nodex-node ${typeClass} ${selected ? "selected" : ""} ${aiStatus === "unknown" ? "ai-unknown" : ""}`}
      style={borderOverride}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="nodex-node-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {Icon && <Icon size={10} style={{ color: iconColor, flexShrink: 0, opacity: 0.85 }} />}
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
  activeTypes: Set<string>;
  activeEdgeTypes: Set<string>;
  folderScope: string;
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
  activeTypes, activeEdgeTypes, folderScope,
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

  // Raw data from API — filters applied client-side
  const rawNodesRef = useRef<GraphNode[]>([]);
  const rawEdgesRef = useRef<GraphEdge[]>([]);

  // Deferred search so layout doesn't thrash on every keystroke
  const deferredSearch = useDeferredValue(searchQuery);

  const applyLayout = useCallback((rfNodes: RFNode[], rfEdges: RFEdge[], dir: LayoutDir) => {
    const laid = dagreLayout(rfNodes, rfEdges, dir);
    setNodes(laid as any);
    setEdges(rfEdges);
    setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 50);
  }, [fitView]);

  // doFilterRef always holds latest filter function (avoids stale closures in loadGraph)
  const doFilterRef = useRef<() => void>(() => {});
  doFilterRef.current = () => {
    let filteredNodes = rawNodesRef.current;

    // Hard filter by node type
    if (activeTypes.size < ALL_NODE_TYPES.length) {
      filteredNodes = filteredNodes.filter(n => activeTypes.has((n as any).data.nodeType));
    }

    // Hard filter by folder scope
    if (folderScope.trim()) {
      const scope = folderScope.trim();
      filteredNodes = filteredNodes.filter(n => (n as any).data.file.includes(scope));
    }

    // Hard filter by search query
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase();
      filteredNodes = filteredNodes.filter(n => {
        const d = (n as any).data as GraphNode["data"];
        return (
          d.label.toLowerCase().includes(q) ||
          d.file.toLowerCase().includes(q) ||
          (d.token ?? "").toLowerCase().includes(q)
        );
      });
    }

    const nodeIds = new Set(filteredNodes.map(n => n.id));

    // Keep edges where both endpoints survive the node filter
    let filteredEdges = rawEdgesRef.current.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    // Hard filter by edge type
    if (activeEdgeTypes.size < ALL_EDGE_TYPES.length) {
      filteredEdges = filteredEdges.filter(e => activeEdgeTypes.has(e.label ?? "calls"));
    }

    const rfEdges = buildRFEdges(filteredEdges, showLabels);
    applyLayout(filteredNodes as RFNode[], rfEdges, layoutDir);
  };

  // Load graph from API, store raw data, apply filters
  const loadGraph = useCallback((url: string) => {
    setLoading(true);
    fetch(url)
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data as { nodes: GraphNode[]; edges: GraphEdge[]; total?: number };
        setTotalNodeCount(d.total ?? d.nodes.length);
        rawNodesRef.current = d.nodes;
        rawEdgesRef.current = d.edges;
        doFilterRef.current();
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []); // stable — reads everything via refs

  // Reload on view mode change
  useEffect(() => {
    setNeighborhoodCenter(null);
    setImpactData(null);
    if (viewMode === "tree") loadGraph("/api/graph/tree");
    else loadGraph("/api/graph");
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Neighborhood mode: double-click node
  const handleNeighborhood = useCallback((nodeId: string) => {
    if (viewMode !== "full") return;
    setNeighborhoodCenter(nodeId);
    setLoading(true);
    fetch(`/api/graph/neighborhood/${encodeURIComponent(nodeId)}?depth=1`)
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data as { nodes: GraphNode[]; edges: GraphEdge[] };
        rawNodesRef.current = d.nodes;
        rawEdgesRef.current = d.edges;
        doFilterRef.current();
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [viewMode]);

  const clearNeighborhood = useCallback(() => {
    setNeighborhoodCenter(null);
    loadGraph(viewMode === "tree" ? "/api/graph/tree" : "/api/graph");
  }, [loadGraph, viewMode]);

  // Re-filter when any filter prop or layout dir changes
  useEffect(() => {
    if (rawNodesRef.current.length === 0) return;
    doFilterRef.current();
  }, [activeTypes, activeEdgeTypes, folderScope, deferredSearch, layoutDir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update edge labels in-place (no re-layout needed)
  useEffect(() => {
    setEdges(prev => prev.map(e => ({
      ...e,
      data: { ...(e.data ?? {}), showLabels },
    })));
    localStorage.setItem("nodex-edge-labels", String(showLabels));
  }, [showLabels]);

  // Persist layout direction
  useEffect(() => {
    localStorage.setItem("nodex-layout-dir", layoutDir);
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

  const displayNodes = nodes.map(n => {
    const isImpactDirect = impactData?.direct.includes(n.id);
    const isImpactIndirect = impactData?.indirect.includes(n.id);
    return {
      ...n,
      selected: n.id === selectedNodeId,
      className: [
        isImpactDirect ? "impact-direct" : "",
        isImpactIndirect ? "impact-indirect" : "",
      ].filter(Boolean).join(" "),
    };
  });

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

  if (rawNodesRef.current.length === 0) {
    return (
      <div style={centerStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ color: "var(--foreground)", fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>No index found</div>
          <div style={{ color: "var(--muted-foreground)", fontSize: 13, fontFamily: "ui-monospace, monospace" }}>Run: nodex init</div>
        </div>
      </div>
    );
  }

  const filteredCount = nodes.length;
  const totalCount = rawNodesRef.current.length;
  const isFiltering = filteredCount < totalCount;

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
      {/* Filter / cluster status banner */}
      {(isFiltering || (totalNodeCount > CLUSTER_THRESHOLD && !neighborhoodCenter)) && (
        <div style={{
          position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)",
          zIndex: 10,
          background: isFiltering ? "rgba(6,182,212,0.1)" : "rgba(251,191,36,0.1)",
          border: `1px solid ${isFiltering ? "rgba(6,182,212,0.4)" : "rgba(251,191,36,0.4)"}`,
          borderRadius: 2, padding: "4px 12px",
          fontSize: 11, fontFamily: "ui-monospace, monospace",
          color: isFiltering ? "#22d3ee" : "#fbbf24",
        }}>
          {isFiltering
            ? `${filteredCount} / ${totalCount} nodes`
            : `${totalNodeCount} nodes — double-click node for neighborhood view`}
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
            return NODE_COLOR_MAP[t] ? `${NODE_COLOR_MAP[t]}44` : "#1e1e32";
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
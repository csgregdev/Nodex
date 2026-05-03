import React, { useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Node as RFNode,
  type Edge as RFEdge,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphNode, GraphEdge } from "../App";

// Custom node component
const NodexNode = ({ data, selected }: { data: GraphNode["data"]; selected: boolean }) => {
  const typeClass = `nodex-node-${data.nodeType}`;
  return (
    <div className={`nodex-node ${typeClass} ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="nodex-node-label">{data.label}</div>
      <div className="nodex-node-meta">{data.file.split("/").slice(-1)[0]}</div>
      {data.complexity > 3 && (
        <div className="nodex-node-complexity">cx:{data.complexity}</div>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
};

const NODE_TYPES: NodeTypes = { nodexNode: NodexNode as any };

function autoLayout(nodes: RFNode[], edges: RFEdge[]): RFNode[] {
  if (nodes.length === 0) return nodes;
  const byFile = new Map<string, RFNode[]>();
  for (const n of nodes) {
    const file = (n.data as any).file as string;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(n);
  }
  const result: RFNode[] = [];
  let groupX = 0;
  for (const [, fileNodes] of byFile) {
    let nodeY = 0;
    for (const n of fileNodes) {
      result.push({ ...n, position: { x: groupX, y: nodeY } });
      nodeY += 70;
    }
    groupX += 260;
  }
  return result;
}

interface GraphViewProps {
  searchQuery: string;
  selectedNodeId: string | null;
  impactNodeId: string | null;
  onNodeSelect: (id: string | null) => void;
}

function GraphViewInner({ searchQuery, selectedNodeId, impactNodeId, onNodeSelect }: GraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);
  const [loading, setLoading] = React.useState(true);
  const [impactData, setImpactData] = React.useState<{ direct: string[]; indirect: string[] } | null>(null);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setLoading(true);
    fetch("/api/graph")
      .then(r => r.json())
      .then((data: unknown) => {
        const d = data as { nodes: GraphNode[]; edges: GraphEdge[] };
        const laidOut = autoLayout(d.nodes as RFNode[], d.edges as RFEdge[]);
        setNodes(laidOut as any);
        setEdges(d.edges as any);
        setLoading(false);
        setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 50);
      })
      .catch(() => setLoading(false));
  }, []);

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
        ? { opacity: 0.2, transition: "opacity 0.2s" }
        : { opacity: 1, transition: "opacity 0.2s" },
    };
  }), [nodes, selectedNodeId, filteredNodeIds, impactData]);

  const onNodeClick = useCallback((_: any, node: RFNode) => {
    onNodeSelect(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId, onNodeSelect]);

  const centerStyle: React.CSSProperties = {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--background)",
  };

  if (loading) {
    return (
      <div style={centerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="loading-dot" />
          <div className="loading-dot" />
          <div className="loading-dot" />
          <span style={{ marginLeft: 8, fontSize: 13, color: "var(--muted-foreground)", fontFamily: "ui-monospace, monospace" }}>Loading graph...</span>
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
    <div style={{ flex: 1, position: "relative" }}>
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => onNodeSelect(null)}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{
          style: { stroke: "#1e1e32", strokeWidth: 1 },
          animated: false,
        }}
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

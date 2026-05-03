import React, { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { GraphView } from "./components/Graph";
import { NodePanel } from "./components/NodePanel";
import { SearchBar } from "./components/SearchBar";
import { StatsBar } from "./components/StatsBar";

export interface GraphNode {
  id: string;
  type: string;
  data: {
    label: string;
    summary?: string;
    token?: string;
    file: string;
    line?: number;
    nodeType: string;
    language?: string;
    complexity: number;
  };
  position: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
}

function App() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [impactNodeId, setImpactNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    setImpactNodeId(null);
  }, []);

  const handleImpact = useCallback((nodeId: string) => {
    setImpactNodeId(prev => prev === nodeId ? null : nodeId);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden", background: "var(--background)", color: "var(--foreground)" }}>
      <header style={{
        height: 52, display: "flex", alignItems: "center", gap: 16, padding: "0 16px",
        background: "var(--card)", borderBottom: "1px solid var(--border)",
        flexShrink: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, letterSpacing: "0.1em", color: "var(--muted-foreground)" }}>[</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, letterSpacing: "0.1em", fontSize: 14, color: "var(--foreground)" }}>NODEX</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, letterSpacing: "0.1em", color: "var(--muted-foreground)" }}>]</span>
        </div>
        <SearchBar query={searchQuery} onQueryChange={setSearchQuery} onNodeSelect={handleNodeSelect} />
        <StatsBar />
      </header>
      <main style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <GraphView
          searchQuery={searchQuery}
          selectedNodeId={selectedNodeId}
          impactNodeId={impactNodeId}
          onNodeSelect={handleNodeSelect}
        />
        {selectedNodeId && (
          <NodePanel
            nodeId={selectedNodeId}
            onClose={() => setSelectedNodeId(null)}
            onImpact={handleImpact}
            impactActive={impactNodeId === selectedNodeId}
          />
        )}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

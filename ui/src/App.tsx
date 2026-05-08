import React, { useState, useCallback, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Sun, Moon, Layers, Network } from "lucide-react";
import "./styles/globals.css";
import { GraphView } from "./components/Graph";
import { NodePanel } from "./components/NodePanel";
import { SearchBar } from "./components/SearchBar";
import { StatsBar } from "./components/StatsBar";
import { FilterBar, ALL_NODE_TYPES, ALL_EDGE_TYPES } from "./components/FilterBar";

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

export type GraphViewMode = "full" | "tree" | "neighborhood";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("nodex-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("nodex-theme", theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme(t => t === "dark" ? "light" : "dark"), []);
  return { theme, toggle };
}

function App() {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [impactNodeId, setImpactNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<GraphViewMode>(() =>
    (localStorage.getItem("nodex-view-mode") as GraphViewMode) ?? "full"
  );
  const { theme, toggle } = useTheme();

  // Filter state
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(ALL_NODE_TYPES)
  );
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(
    () => new Set(ALL_EDGE_TYPES)
  );
  const [folderScope, setFolderScope] = useState("");

  const handleToggleType = useCallback((type: string) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleToggleEdgeType = useCallback((type: string) => {
    setActiveEdgeTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setActiveTypes(new Set(ALL_NODE_TYPES));
    setActiveEdgeTypes(new Set(ALL_EDGE_TYPES));
    setFolderScope("");
  }, []);

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    if (nodeId?.startsWith("file::")) return;
    setSelectedNodeId(nodeId);
    setImpactNodeId(null);
  }, []);

  const handleImpact = useCallback((nodeId: string) => {
    setImpactNodeId(prev => prev === nodeId ? null : nodeId);
  }, []);

  const handleViewMode = useCallback((mode: GraphViewMode) => {
    setViewMode(mode);
    localStorage.setItem("nodex-view-mode", mode);
    setSelectedNodeId(null);
    setImpactNodeId(null);
  }, []);

  const iconBtn = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 32, height: 32, borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--foreground)" : "var(--muted-foreground)",
    cursor: "pointer", transition: "background 0.15s, color 0.15s",
  });

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

        {/* View mode toggle */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <button
            title="Full symbol graph"
            style={iconBtn(viewMode === "full")}
            onClick={() => handleViewMode("full")}
          >
            <Network size={14} />
          </button>
          <button
            title="File-level tree view"
            style={iconBtn(viewMode === "tree")}
            onClick={() => handleViewMode("tree")}
          >
            <Layers size={14} />
          </button>
        </div>

        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onNodeSelect={handleNodeSelect}
        />
        <StatsBar />
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          style={{
            marginLeft: "auto", flexShrink: 0,
            ...iconBtn(false),
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--foreground)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--muted-foreground)";
          }}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </header>

      <FilterBar
        activeTypes={activeTypes}
        onToggleType={handleToggleType}
        activeEdgeTypes={activeEdgeTypes}
        onToggleEdgeType={handleToggleEdgeType}
        folderScope={folderScope}
        onFolderScopeChange={setFolderScope}
        onReset={handleResetFilters}
      />

      <main style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <GraphView
          searchQuery={searchQuery}
          selectedNodeId={selectedNodeId}
          impactNodeId={impactNodeId}
          onNodeSelect={handleNodeSelect}
          viewMode={viewMode}
          activeTypes={activeTypes}
          activeEdgeTypes={activeEdgeTypes}
          folderScope={folderScope}
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

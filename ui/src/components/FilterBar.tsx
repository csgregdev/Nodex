import React from "react";
import { Code2, Box, Braces, Package, Component, Hash, RotateCcw } from "lucide-react";

export const ALL_NODE_TYPES = ["fn", "class", "interface", "module", "widget", "type"] as const;
export type NodeTypeKey = (typeof ALL_NODE_TYPES)[number];

export const ALL_EDGE_TYPES = ["calls", "imports", "extends", "implements", "co_changes"] as const;
export type EdgeTypeKey = (typeof ALL_EDGE_TYPES)[number];

export const NODE_TYPE_CONFIG: Record<NodeTypeKey, { label: string; icon: React.ElementType; color: string }> = {
  fn:        { label: "fn",     icon: Code2,     color: "#22d3ee" },
  class:     { label: "class",  icon: Box,       color: "#c084fc" },
  interface: { label: "iface",  icon: Braces,    color: "#4ade80" },
  module:    { label: "module", icon: Package,   color: "#fbbf24" },
  widget:    { label: "widget", icon: Component, color: "#fb923c" },
  type:      { label: "type",   icon: Hash,      color: "#6b7280" },
};

export const EDGE_TYPE_CONFIG: Record<EdgeTypeKey, { color: string }> = {
  calls:      { color: "#06b6d4" },
  imports:    { color: "#6b7280" },
  extends:    { color: "#a855f7" },
  implements: { color: "#4ade80" },
  co_changes: { color: "#f97316" },
};

interface FilterBarProps {
  activeTypes: Set<string>;
  onToggleType: (type: string) => void;
  activeEdgeTypes: Set<string>;
  onToggleEdgeType: (type: string) => void;
  folderScope: string;
  onFolderScopeChange: (scope: string) => void;
  onReset: () => void;
}

export function FilterBar({
  activeTypes, onToggleType,
  activeEdgeTypes, onToggleEdgeType,
  folderScope, onFolderScopeChange,
  onReset,
}: FilterBarProps) {
  const isFiltered =
    activeTypes.size < ALL_NODE_TYPES.length ||
    activeEdgeTypes.size < ALL_EDGE_TYPES.length ||
    folderScope.trim() !== "";

  const chip = (active: boolean, color: string): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 3,
    height: 20, padding: "0 6px",
    borderRadius: 2,
    border: `1px solid ${active ? `${color}88` : "var(--border)"}`,
    color: active ? color : "var(--muted-foreground)",
    background: active ? `${color}15` : "transparent",
    fontFamily: "ui-monospace, monospace", fontSize: 9,
    cursor: "pointer", transition: "all 0.12s",
    flexShrink: 0,
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      padding: "0 16px", height: 32, flexShrink: 0,
      borderBottom: "1px solid var(--border)",
      background: "var(--card)",
      overflowX: "auto",
    }}>
      {/* Node type chips */}
      {ALL_NODE_TYPES.map(type => {
        const cfg = NODE_TYPE_CONFIG[type];
        const active = activeTypes.has(type);
        const Icon = cfg.icon;
        return (
          <button key={type} onClick={() => onToggleType(type)} title={`Toggle ${type} nodes`} style={chip(active, cfg.color)}>
            <Icon size={9} />
            {cfg.label}
          </button>
        );
      })}

      <div style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0, marginInline: 2 }} />

      {/* Edge type chips */}
      {ALL_EDGE_TYPES.map(type => {
        const cfg = EDGE_TYPE_CONFIG[type];
        const active = activeEdgeTypes.has(type);
        return (
          <button key={type} onClick={() => onToggleEdgeType(type)} title={`Toggle ${type} edges`} style={chip(active, cfg.color)}>
            {type.replace("_", " ")}
          </button>
        );
      })}

      <div style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0, marginInline: 2 }} />

      {/* Folder scope */}
      <input
        type="text"
        placeholder="scope: src/auth/"
        value={folderScope}
        onChange={e => onFolderScopeChange(e.target.value)}
        style={{
          height: 20, padding: "0 7px",
          fontFamily: "ui-monospace, monospace", fontSize: 9,
          background: folderScope ? "rgba(6,182,212,0.08)" : "transparent",
          border: `1px solid ${folderScope ? "rgba(6,182,212,0.4)" : "var(--border)"}`,
          borderRadius: 2, color: "var(--foreground)",
          width: 130, outline: "none",
          transition: "border-color 0.12s",
        }}
      />

      {isFiltered && (
        <button onClick={onReset} title="Reset all filters" style={chip(true, "#f87171")}>
          <RotateCcw size={9} />
          reset
        </button>
      )}
    </div>
  );
}
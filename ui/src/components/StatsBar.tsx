import React, { useEffect, useState } from "react";

interface Stats {
  nodes: number;
  edges: number;
  files: number;
  languages: string[];
  byType: Record<string, number>;
}

export function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then((d: unknown) => setStats(d as Stats));
  }, []);

  if (!stats) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: "auto", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--primary)", fontSize: 14, fontWeight: 500 }}>{stats.files}</span>
        <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>files</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--primary)", fontSize: 14, fontWeight: 500 }}>{stats.nodes}</span>
        <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>symbols</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--primary)", fontSize: 14, fontWeight: 500 }}>{stats.edges}</span>
        <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>edges</span>
      </div>
      {stats.languages.length > 0 && (
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "var(--muted-foreground)" }}>
          {stats.languages.slice(0, 4).join(" · ")}
        </div>
      )}
    </div>
  );
}

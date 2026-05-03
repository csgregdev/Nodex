import { getDB } from "../store/db.ts";

export function needsAISummary(nodeId: string, currentHash: string): boolean {
  const db = getDB();
  const row = db.query("SELECT last_ai, hash FROM nodes WHERE id = ?").get(nodeId) as { last_ai: number | null; hash: string | null } | null;
  if (!row) return true;
  if (!row.last_ai) return true;
  if (row.hash !== currentHash) return true;
  return false;
}

export function markAISummarized(nodeId: string, hash: string): void {
  const db = getDB();
  const now = Math.floor(Date.now() / 1000);
  db.run("UPDATE nodes SET last_ai = ?, hash = ? WHERE id = ?", [now, hash, nodeId]);
}

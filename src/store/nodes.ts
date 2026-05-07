import { getDB } from "./db.ts";

export interface Node {
  id: string;
  type: string;
  name: string;
  file: string;
  line?: number;
  language?: string;
  token?: string;
  summary?: string;
  complexity: number;
  last_parsed?: number;
  last_ai?: number;
  /** Hash of file content when AI last ran — used to detect staleness */
  hash?: string;
  /** Hash of file content after last tree-sitter parse — always current */
  current_hash?: string;
  /** 0.0–1.0 churn×complexity score, module nodes only */
  hotspot_score?: number;
  /** Number of git commits in last 90 days */
  commit_count?: number;
}

export function upsertNode(node: Node): void {
  const db = getDB();
  db.run(
    `INSERT INTO nodes (id, type, name, file, line, language, token, summary, complexity, last_parsed, last_ai, hash, current_hash, hotspot_score, commit_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       name = excluded.name,
       file = excluded.file,
       line = excluded.line,
       language = excluded.language,
       token = excluded.token,
       summary = excluded.summary,
       complexity = excluded.complexity,
       last_parsed = excluded.last_parsed,
       last_ai = excluded.last_ai,
       hash = excluded.hash,
       current_hash = excluded.current_hash,
       hotspot_score = excluded.hotspot_score,
       commit_count = excluded.commit_count`,
    [
      node.id,
      node.type,
      node.name,
      node.file,
      node.line ?? null,
      node.language ?? null,
      node.token ?? null,
      node.summary ?? null,
      node.complexity,
      node.last_parsed ?? null,
      node.last_ai ?? null,
      node.hash ?? null,
      node.current_hash ?? null,
      node.hotspot_score ?? 0,
      node.commit_count ?? 0,
    ]
  );
}

export function getNode(id: string): Node | null {
  const db = getDB();
  return db.query<Node, [string]>("SELECT * FROM nodes WHERE id = ?").get(id) ?? null;
}

export function getNodesByFile(file: string): Node[] {
  const db = getDB();
  return db.query<Node, [string]>("SELECT * FROM nodes WHERE file = ?").all(file);
}

export function deleteNodesByFile(file: string): void {
  const db = getDB();
  db.run("DELETE FROM nodes WHERE file = ?", [file]);
}

export function getAllNodes(): Node[] {
  const db = getDB();
  return db.query<Node, []>("SELECT * FROM nodes ORDER BY file, line").all();
}

export function searchNodes(query: string, limit = 20): Node[] {
  const db = getDB();
  // FTS5 prefix search — fall back to LIKE if empty query
  if (!query.trim()) return [];
  try {
    const ftsQuery = query.trim().replace(/['"*]/g, "") + "*";
    return db
      .query<Node, [string, number]>(
        `SELECT n.* FROM nodes n
         JOIN nodes_fts f ON n.rowid = f.rowid
         WHERE nodes_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(ftsQuery, limit);
  } catch {
    // FTS table may not exist yet (old DB without migration) — fall back
    const pattern = `%${query}%`;
    return db
      .query<Node, [string, string, string, number]>(
        `SELECT * FROM nodes WHERE name LIKE ? OR token LIKE ? OR summary LIKE ? LIMIT ?`
      )
      .all(pattern, pattern, pattern, limit);
  }
}

export function getNodesPaginated(offset: number, limit: number): Node[] {
  const db = getDB();
  return db
    .query<Node, [number, number]>("SELECT * FROM nodes ORDER BY file, line LIMIT ? OFFSET ?")
    .all(limit, offset);
}

export function getNodeCount(): number {
  const db = getDB();
  return (db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM nodes").get()?.c) ?? 0;
}

export function getNodesByIds(ids: string[]): Node[] {
  if (ids.length === 0) return [];
  const db = getDB();
  const placeholders = ids.map(() => "?").join(",");
  return db
    .query<Node, string[]>(`SELECT * FROM nodes WHERE id IN (${placeholders})`)
    .all(...ids);
}

export type NodeAIStatus = "fresh" | "stale" | "unknown";

export function getNodeStatus(node: Node): NodeAIStatus {
  if (node.last_ai == null) return "unknown";
  if (node.hash == null || node.current_hash == null) return "unknown";
  return node.hash === node.current_hash ? "fresh" : "stale";
}

export function getStaleNodes(): Node[] {
  const db = getDB();
  return db
    .query<Node, []>(
      `SELECT * FROM nodes WHERE last_ai IS NOT NULL AND hash IS NOT NULL AND current_hash IS NOT NULL AND hash != current_hash`
    )
    .all();
}

export function getUnknownNodes(): Node[] {
  const db = getDB();
  return db.query<Node, []>("SELECT * FROM nodes WHERE last_ai IS NULL").all();
}

export function getStaleCount(): number {
  const db = getDB();
  return (
    db
      .query<{ c: number }, []>(
        `SELECT COUNT(*) as c FROM nodes WHERE last_ai IS NOT NULL AND hash IS NOT NULL AND current_hash IS NOT NULL AND hash != current_hash`
      )
      .get()?.c ?? 0
  );
}

export function getUnknownCount(): number {
  const db = getDB();
  return (
    db
      .query<{ c: number }, []>("SELECT COUNT(*) as c FROM nodes WHERE last_ai IS NULL")
      .get()?.c ?? 0
  );
}

/** Update current_hash after tree-sitter parse — does NOT touch AI hash */
export function updateCurrentHash(file: string, currentHash: string): void {
  const db = getDB();
  db.run(
    "UPDATE nodes SET current_hash = ?, last_parsed = ? WHERE file = ?",
    [currentHash, Math.floor(Date.now() / 1000), file]
  );
}

/** Update AI hash + last_ai after enrichment — marks node as fresh */
export function markAIEnriched(nodeId: string, hash: string, summary: string | null): void {
  const db = getDB();
  db.run(
    "UPDATE nodes SET hash = ?, last_ai = ?, summary = ? WHERE id = ?",
    [hash, Math.floor(Date.now() / 1000), summary, nodeId]
  );
}

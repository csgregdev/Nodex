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
  hash?: string;
}

export function upsertNode(node: Node): void {
  const db = getDB();
  db.run(
    `INSERT INTO nodes (id, type, name, file, line, language, token, summary, complexity, last_parsed, last_ai, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       hash = excluded.hash`,
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
  const pattern = `%${query}%`;
  return db
    .query<Node, [string, string, string, number]>(
      `SELECT * FROM nodes
       WHERE name LIKE ? OR token LIKE ? OR summary LIKE ?
       LIMIT ?`
    )
    .all(pattern, pattern, pattern, limit);
}

import { getDB } from "./db.ts";

export interface Edge {
  id?: number;
  from_id: string;
  to_id: string;
  relationship: string;
  /** Number of shared commits — only populated for co_changes relationship */
  weight?: number;
}

export function insertEdge(edge: Edge): void {
  const db = getDB();
  db.run(
    "INSERT INTO edges (from_id, to_id, relationship, weight) VALUES (?, ?, ?, ?)",
    [edge.from_id, edge.to_id, edge.relationship, edge.weight ?? 1]
  );
}

export function deleteEdgesByFile(file: string): void {
  const db = getDB();
  // Delete edges where from_id starts with the file path
  db.run("DELETE FROM edges WHERE from_id LIKE ?", [`${file}::%`]);
}

export function getEdgesFrom(nodeId: string): Edge[] {
  const db = getDB();
  return db.query<Edge, [string]>("SELECT * FROM edges WHERE from_id = ?").all(nodeId);
}

export function getEdgesTo(nodeId: string): Edge[] {
  const db = getDB();
  return db.query<Edge, [string]>("SELECT * FROM edges WHERE to_id = ?").all(nodeId);
}

export function getAllEdges(): Edge[] {
  const db = getDB();
  return db.query<Edge, []>("SELECT * FROM edges").all();
}

export function getEdgeCount(): number {
  const db = getDB();
  return (db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM edges").get()?.c) ?? 0;
}

export function getEdgesByNodeIds(nodeIds: string[]): Edge[] {
  if (nodeIds.length === 0) return [];
  const db = getDB();
  const placeholders = nodeIds.map(() => "?").join(",");
  return db
    .query<Edge, string[]>(
      `SELECT * FROM edges WHERE from_id IN (${placeholders}) OR to_id IN (${placeholders})`
    )
    .all(...nodeIds, ...nodeIds);
}

export function getEdgesPaginated(offset: number, limit: number): Edge[] {
  const db = getDB();
  return db
    .query<Edge, [number, number]>("SELECT * FROM edges LIMIT ? OFFSET ?")
    .all(limit, offset);
}

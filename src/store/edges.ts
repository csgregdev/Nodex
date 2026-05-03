import { getDB } from "./db.ts";

export interface Edge {
  id?: number;
  from_id: string;
  to_id: string;
  relationship: string;
}

export function insertEdge(edge: Edge): void {
  const db = getDB();
  db.run(
    "INSERT INTO edges (from_id, to_id, relationship) VALUES (?, ?, ?)",
    [edge.from_id, edge.to_id, edge.relationship]
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

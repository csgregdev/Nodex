import { getDB } from "./db.ts";

export interface Meta {
  id?: number;
  node_id: string;
  key: string;
  value: string;
  created?: number;
}

export function addMeta(meta: Meta): void {
  const db = getDB();
  db.run(
    "INSERT INTO meta (node_id, key, value, created) VALUES (?, ?, ?, ?)",
    [meta.node_id, meta.key, meta.value, meta.created ?? Math.floor(Date.now() / 1000)]
  );
}

export function getMetaByNode(nodeId: string): Meta[] {
  const db = getDB();
  return db.query<Meta, [string]>("SELECT * FROM meta WHERE node_id = ?").all(nodeId);
}

export function deleteMetaByNode(nodeId: string): void {
  const db = getDB();
  db.run("DELETE FROM meta WHERE node_id = ?", [nodeId]);
}

export function getProject(key: string): string | null {
  const db = getDB();
  const row = db
    .query<{ value: string }, [string]>("SELECT value FROM project WHERE key = ?")
    .get(key);
  return row?.value ?? null;
}

export function setProject(key: string, value: string): void {
  const db = getDB();
  db.run(
    "INSERT INTO project (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

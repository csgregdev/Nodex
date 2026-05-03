import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let _db: Database | null = null;

export function initDB(projectRoot: string): Database {
  const codexDir = join(projectRoot, ".codex");
  mkdirSync(codexDir, { recursive: true });

  const dbPath = join(codexDir, "index.db");
  const db = new Database(dbPath, { create: true });

  db.run("PRAGMA journal_mode = WAL");
  // FK enforcement is kept off: cross-file import edges may reference
  // nodes not yet indexed. We handle referential integrity at the app level.
  db.run("PRAGMA foreign_keys = OFF");

  db.run(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      file TEXT NOT NULL,
      line INTEGER,
      language TEXT,
      token TEXT,
      summary TEXT,
      complexity INTEGER DEFAULT 0,
      last_parsed INTEGER,
      last_ai INTEGER,
      hash TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relationship TEXT NOT NULL,
      FOREIGN KEY (from_id) REFERENCES nodes(id),
      FOREIGN KEY (to_id) REFERENCES nodes(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created INTEGER,
      FOREIGN KEY (node_id) REFERENCES nodes(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS project (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  _db = db;
  return db;
}

export function getDB(): Database {
  if (!_db) throw new Error("DB not initialized. Call initDB() first.");
  return _db;
}

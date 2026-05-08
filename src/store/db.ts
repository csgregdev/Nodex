import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let _db: Database | null = null;

export function initDB(projectRoot: string): Database {
  const nodexDir = join(projectRoot, ".nodex");
  mkdirSync(nodexDir, { recursive: true });

  const dbPath = join(nodexDir, "index.db");
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
      hash TEXT,
      current_hash TEXT,
      hotspot_score REAL DEFAULT 0,
      commit_count INTEGER DEFAULT 0
    )
  `);

  // Migration: add new columns to existing DBs
  for (const col of [
    "ALTER TABLE nodes ADD COLUMN current_hash TEXT",
    "ALTER TABLE nodes ADD COLUMN hotspot_score REAL DEFAULT 0",
    "ALTER TABLE nodes ADD COLUMN commit_count INTEGER DEFAULT 0",
  ]) {
    try { db.run(col); } catch { /* column already exists */ }
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relationship TEXT NOT NULL,
      weight INTEGER DEFAULT 1,
      FOREIGN KEY (from_id) REFERENCES nodes(id),
      FOREIGN KEY (to_id) REFERENCES nodes(id)
    )
  `);

  // Migration: add weight column to existing DBs
  try { db.run("ALTER TABLE edges ADD COLUMN weight INTEGER DEFAULT 1"); } catch { /* already exists */ }

  db.run(`CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id)`);

  // FTS5 for fast full-text search on nodes
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
      name, token, summary,
      content=nodes,
      content_rowid=rowid,
      tokenize='unicode61'
    )
  `);

  // Keep FTS index in sync
  db.run(`
    CREATE TRIGGER IF NOT EXISTS nodes_fts_insert AFTER INSERT ON nodes BEGIN
      INSERT INTO nodes_fts(rowid, name, token, summary)
      VALUES (new.rowid, new.name, new.token, new.summary);
    END
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS nodes_fts_delete AFTER DELETE ON nodes BEGIN
      INSERT INTO nodes_fts(nodes_fts, rowid, name, token, summary)
      VALUES ('delete', old.rowid, old.name, old.token, old.summary);
    END
  `);
  db.run(`
    CREATE TRIGGER IF NOT EXISTS nodes_fts_update AFTER UPDATE ON nodes BEGIN
      INSERT INTO nodes_fts(nodes_fts, rowid, name, token, summary)
      VALUES ('delete', old.rowid, old.name, old.token, old.summary);
      INSERT INTO nodes_fts(rowid, name, token, summary)
      VALUES (new.rowid, new.name, new.token, new.summary);
    END
  `);

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

  db.run(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT,
      file TEXT,
      operation TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      created INTEGER NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_token_usage_file ON token_usage(file)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS query_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      tool TEXT NOT NULL,
      file TEXT,
      latency_ms INTEGER,
      auto_reindexed INTEGER DEFAULT 0,
      bench_session TEXT,
      bench_mode TEXT
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_query_log_ts ON query_log(ts)`);
  // Migration for existing DBs
  for (const col of [
    "ALTER TABLE query_log ADD COLUMN bench_session TEXT",
    "ALTER TABLE query_log ADD COLUMN bench_mode TEXT",
  ]) { try { db.run(col); } catch { /* already exists */ } }

  _db = db;
  return db;
}

export function getDB(): Database {
  if (!_db) throw new Error("DB not initialized. Call initDB() first.");
  return _db;
}

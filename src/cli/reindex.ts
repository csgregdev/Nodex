import { runInit } from "./init.ts";

export async function runReindex(args: string[]) {
  const { getDB, initDB } = await import("../store/db.ts");
  const root = process.cwd();
  initDB(root);
  const db = getDB();
  db.run("DELETE FROM edges");
  db.run("DELETE FROM nodes");
  db.run("DELETE FROM meta WHERE key != 'root_path'");

  console.log("Nodex: Full reindex (cleared existing index)");
  await runInit([]);
}

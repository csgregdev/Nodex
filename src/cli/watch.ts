import { initDB } from "../store/db.ts";
import { startWatcher } from "../watcher/fswatch.ts";

export async function runWatch(args: string[]) {
  const root = process.cwd();
  initDB(root);
  console.log("Nodex: Starting watch mode...");
  startWatcher(root);
  // Keep process alive
  process.stdin.resume();
}

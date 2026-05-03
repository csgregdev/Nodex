import { initDB } from "../store/db.ts";
import { startAPIServer } from "../api/server.ts";

export async function runUI(args: string[]) {
  const root = process.cwd();
  initDB(root);

  const port = parseInt(args[0] ?? "3456");
  const server = startAPIServer(root, port);

  const url = `http://localhost:${port}`;
  console.log(`Nodex UI: ${url}`);
  console.log("Press Ctrl+C to stop.");

  // Open browser
  try {
    await Bun.$`open ${url}`.quiet();
  } catch {
    try {
      await Bun.$`xdg-open ${url}`.quiet();
    } catch { /* ignore */ }
  }

  process.stdin.resume();
}

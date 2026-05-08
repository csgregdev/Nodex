import { initDB, getDB } from "../store/db.ts";
import { join } from "node:path";

const TOOL_LABELS: Record<string, string> = {
  nodex_search: "search",
  nodex_get_context: "context",
  nodex_impact_map: "impact",
  nodex_get_conventions: "conventions",
  nodex_update_file: "update",
  nodex_add_decision: "decision",
};

// Rough token savings per tool call (vs native file reads)
const TOKEN_SAVINGS: Record<string, number> = {
  nodex_search: 1200,      // ~3 Grep calls + results
  nodex_get_context: 800,  // avg 200-line file × 4 tokens
  nodex_impact_map: 2000,  // ~5 files traversal
  nodex_get_conventions: 400,
  nodex_update_file: 0,    // not a savings call
  nodex_add_decision: 0,
};

export async function runStats(args: string[]) {
  const window = args.includes("--all") ? null : parseInt(args.find(a => a.startsWith("--hours="))?.split("=")[1] ?? "2");
  const projectRoot = process.cwd();

  try {
    initDB(projectRoot);
  } catch {
    console.error("No Nodex DB found. Run `nodex init` first.");
    process.exit(1);
  }

  const db = getDB();
  const cutoff = window ? Math.floor(Date.now() / 1000) - window * 3600 : 0;

  const rows = db
    .query<{ tool: string; latency_ms: number; auto_reindexed: number; ts: number }, [number]>(
      "SELECT tool, latency_ms, auto_reindexed, ts FROM query_log WHERE ts >= ? ORDER BY ts ASC"
    )
    .all(cutoff);

  if (rows.length === 0) {
    console.log(window ? `No Nodex tool calls in the last ${window}h.` : "No Nodex tool calls recorded.");
    return;
  }

  // Session detection: split by gaps > 30min
  const sessions: typeof rows[] = [];
  let current: typeof rows = [rows[0]];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].ts - rows[i - 1].ts > 1800) {
      sessions.push(current);
      current = [];
    }
    current.push(rows[i]);
  }
  sessions.push(current);

  const sessionRows = args.includes("--all") ? rows : sessions[sessions.length - 1];
  const sessionStart = new Date(sessionRows[0].ts * 1000);
  const sessionEnd = new Date(sessionRows[sessionRows.length - 1].ts * 1000);
  const durationMin = Math.round((sessionRows[sessionRows.length - 1].ts - sessionRows[0].ts) / 60);

  // Aggregate
  const byTool: Record<string, { count: number; totalMs: number }> = {};
  let totalTokensSaved = 0;
  let autoReindexedCount = 0;

  for (const row of sessionRows) {
    if (!byTool[row.tool]) byTool[row.tool] = { count: 0, totalMs: 0 };
    byTool[row.tool].count++;
    byTool[row.tool].totalMs += row.latency_ms ?? 0;
    totalTokensSaved += TOKEN_SAVINGS[row.tool] ?? 0;
    if (row.auto_reindexed) autoReindexedCount++;
  }

  const totalCalls = sessionRows.length;
  const avgLatency = Math.round(sessionRows.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / totalCalls);
  const costEst = (totalTokensSaved / 1_000_000 * 3.0).toFixed(4); // ~$3/M input tokens Sonnet

  // Print
  const label = args.includes("--all") ? "All time" : `Session (${durationMin > 0 ? durationMin + " min" : "< 1 min"})`;
  console.log(`\n[nodex] ${label}`);
  if (!args.includes("--all")) {
    console.log(`  Started:  ${sessionStart.toLocaleTimeString()}`);
  }
  console.log(`  Calls:    ${totalCalls} total`);

  for (const [tool, { count, totalMs }] of Object.entries(byTool).sort((a, b) => b[1].count - a[1].count)) {
    const avg = Math.round(totalMs / count);
    console.log(`    ${(TOOL_LABELS[tool] ?? tool).padEnd(14)} ${String(count).padStart(3)}x   avg ${avg}ms`);
  }

  console.log(`  Avg latency:    ${avgLatency}ms`);
  if (autoReindexedCount > 0) {
    console.log(`  Auto-reindexed: ${autoReindexedCount} file(s)`);
  }
  console.log(`  Est. tokens saved: ~${totalTokensSaved.toLocaleString()}  (~$${costEst})`);

  if (sessions.length > 1 && !args.includes("--all")) {
    console.log(`\n  (${sessions.length} sessions total — use --all to see everything)`);
  }
  console.log();
}

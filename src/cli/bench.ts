import { initDB, getDB } from "../store/db.ts";
import { setProject, getProject } from "../store/meta.ts";

const C = {
  reset:  "\x1b[0m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  dim:    "\x1b[2m",
  bold:   "\x1b[1m",
};

const TOOL_SAVINGS: Record<string, number> = {
  nodex_search: 1200,
  nodex_get_context: 800,
  nodex_impact_map: 2000,
  nodex_get_conventions: 400,
  nodex_update_file: 0,
  nodex_add_decision: 0,
};

const TOOL_LABELS: Record<string, string> = {
  nodex_search: "search",
  nodex_get_context: "context",
  nodex_impact_map: "impact",
  nodex_get_conventions: "conventions",
  nodex_update_file: "update",
  nodex_add_decision: "decision",
};

function line(w = 44) { return C.dim + "─".repeat(w) + C.reset; }

export async function runBench(args: string[]) {
  const sub = args[0];
  const root = process.cwd();

  try { initDB(root); } catch {
    console.error("No Nodex DB. Run `nodex init` first.");
    process.exit(1);
  }

  // ── on / off ──────────────────────────────────────────
  if (sub === "on" || sub === "off") {
    const sessionId = `bench_${Date.now()}`;
    setProject("bench_mode", sub);
    setProject("bench_session", sessionId);

    if (sub === "on") {
      console.log(`\n${C.cyan}${C.bold} nodex bench${C.reset}  ${C.green}ON${C.reset}  — Nodex active, logging queries`);
      console.log(`${C.dim} Session: ${sessionId}${C.reset}`);
      console.log(`${C.dim} Ask Claude something, then run: nodex bench report${C.reset}\n`);
    } else {
      console.log(`\n${C.cyan}${C.bold} nodex bench${C.reset}  ${C.yellow}OFF${C.reset}  — Baseline mode, Nodex returns no data`);
      console.log(`${C.dim} Session: ${sessionId}${C.reset}`);
      console.log(`${C.dim} Ask Claude the same question, then run: nodex bench report${C.reset}\n`);
    }
    return;
  }

  // ── reset ─────────────────────────────────────────────
  if (sub === "reset") {
    setProject("bench_mode", "");
    setProject("bench_session", "");
    console.log(`${C.dim}Bench mode cleared.${C.reset}`);
    return;
  }

  // ── report ────────────────────────────────────────────
  if (!sub || sub === "report") {
    const db = getDB();

    // Get last two distinct bench sessions
    const sessions = db
      .query<{ bench_session: string; bench_mode: string; count: number; min_ts: number; max_ts: number }, []>(
        `SELECT bench_session, bench_mode,
                COUNT(*) as count,
                MIN(ts) as min_ts, MAX(ts) as max_ts
         FROM query_log
         WHERE bench_session IS NOT NULL AND bench_session != ''
         GROUP BY bench_session, bench_mode
         ORDER BY min_ts DESC
         LIMIT 4`
      )
      .all();

    if (sessions.length === 0) {
      console.log(`\nNo bench sessions found. Run:\n  nodex bench on   → ask Claude something\n  nodex bench off  → ask Claude the same thing\n  nodex bench report\n`);
      return;
    }

    const onSession  = sessions.find(s => s.bench_mode === "on");
    const offSession = sessions.find(s => s.bench_mode === "off");

    console.log(`\n${C.cyan}${C.bold} nodex bench report${C.reset}\n${line()}`);

    function sessionStats(s: typeof sessions[0]) {
      const rows = db
        .query<{ tool: string; latency_ms: number }, [string]>(
          "SELECT tool, latency_ms FROM query_log WHERE bench_session = ?"
        )
        .all(s.bench_session);

      const byTool: Record<string, { count: number; totalMs: number }> = {};
      let tokensSaved = 0;
      for (const r of rows) {
        if (!byTool[r.tool]) byTool[r.tool] = { count: 0, totalMs: 0 };
        byTool[r.tool].count++;
        byTool[r.tool].totalMs += r.latency_ms ?? 0;
        if (s.bench_mode === "on") tokensSaved += TOOL_SAVINGS[r.tool] ?? 0;
      }

      const durationSec = s.max_ts - s.min_ts;
      const avgMs = rows.length
        ? Math.round(rows.reduce((a, r) => a + (r.latency_ms ?? 0), 0) / rows.length)
        : 0;

      return { rows, byTool, tokensSaved, durationSec, avgMs };
    }

    // ── ON session ──
    if (onSession) {
      const s = sessionStats(onSession);
      console.log(`${C.green}${C.bold} WITH Nodex${C.reset}  ${C.dim}(${onSession.bench_session})${C.reset}`);
      console.log(` Calls:      ${C.bold}${s.rows.length}${C.reset}`);
      for (const [tool, { count, totalMs }] of Object.entries(s.byTool).sort((a, b) => b[1].count - a[1].count)) {
        console.log(`   ${(TOOL_LABELS[tool] ?? tool).padEnd(14)} ${String(count).padStart(3)}x  avg ${Math.round(totalMs / count)}ms`);
      }
      console.log(` Avg latency: ${s.avgMs}ms`);
      console.log(` Duration:    ${s.durationSec}s`);
      console.log(` Est. tokens saved: ${C.green}~${s.tokensSaved.toLocaleString()}${C.reset}  (~$${(s.tokensSaved / 1e6 * 3.0).toFixed(4)})`);
    }

    // ── OFF session ──
    if (offSession) {
      const s = sessionStats(offSession);
      console.log(`\n${C.yellow}${C.bold} WITHOUT Nodex${C.reset}  ${C.dim}(baseline)${C.reset}`);
      console.log(` Calls:      ${C.bold}${s.rows.length}${C.reset}  ${C.dim}(all returned empty — Claude used file reads)${C.reset}`);
      console.log(` Avg latency: ${s.avgMs}ms  ${C.dim}(MCP overhead only)${C.reset}`);
      console.log(` Duration:    ${s.durationSec}s`);
    }

    // ── Comparison ──
    if (onSession && offSession) {
      const on  = sessionStats(onSession);
      const off = sessionStats(offSession);
      const speedup = off.durationSec > 0
        ? (off.durationSec / Math.max(on.durationSec, 1)).toFixed(1)
        : "?";
      const tokenDiff = on.tokensSaved;

      console.log(`\n${line()}`);
      console.log(`${C.bold} Comparison${C.reset}`);
      console.log(` Tool calls:     ${on.rows.length} with Nodex  vs  ${off.rows.length} without`);
      console.log(` Est. tokens:    ${C.green}~${tokenDiff.toLocaleString()} saved${C.reset} by using Nodex`);
      console.log(` Cost delta:     ~$${(tokenDiff / 1e6 * 3.0).toFixed(4)} per session`);
      if (speedup !== "?") {
        const col = parseFloat(speedup) >= 1.2 ? C.green : C.dim;
        console.log(` Session time:   ${col}${speedup}x${C.reset} faster with Nodex`);
      }
      console.log(line());
      console.log(`${C.dim} Note: for exact token counts use /cost in Claude Code after each session.${C.reset}`);
    }

    console.log();
    return;
  }

  console.log(`Usage:
  nodex bench on       Start WITH-Nodex session
  nodex bench off      Start WITHOUT-Nodex (baseline) session
  nodex bench report   Compare last on vs off session
  nodex bench reset    Clear bench mode
`);
}

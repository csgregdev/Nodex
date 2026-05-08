import { initDB, getDB } from "../store/db.ts";
import { setProject, getProject } from "../store/meta.ts";
import { join } from "node:path";

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

  // ── run ────────────────────────────────────────────────
  if (sub === "run") {
    const casesPath = args[1]
      ? join(root, args[1])
      : join(import.meta.dir, "bench-cases.json");

    const casesFile = Bun.file(casesPath);
    if (!(await casesFile.exists())) {
      console.error(`Bench cases not found: ${casesPath}`);
      process.exit(1);
    }

    const cases: { id: string; question: string; category: string }[] = await casesFile.json();
    console.log(`\n${C.cyan}${C.bold} nodex bench run${C.reset}  — ${cases.length} test cases\n${line()}`);

    interface RunResult {
      id: string;
      category: string;
      mode: "on" | "off";
      input_tokens: number;
      output_tokens: number;
      cache_read: number;
      cache_creation: number;
      cost_usd: number;
      duration_ms: number;
      num_turns: number;
      response_length: number;
    }

    const results: RunResult[] = [];

    async function runCase(
      c: { id: string; question: string; category: string },
      mode: "on" | "off",
    ): Promise<RunResult> {
      // Set bench mode
      setProject("bench_mode", mode);
      setProject("bench_session", `bench_run_${mode}_${Date.now()}`);

      const proc = Bun.spawn(
        ["claude", "-p", c.question, "--output-format", "json"],
        { cwd: root, stdout: "pipe", stderr: "pipe" }
      );

      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      try {
        const json = JSON.parse(stdout);
        return {
          id: c.id,
          category: c.category,
          mode,
          input_tokens: json.usage?.input_tokens ?? 0,
          output_tokens: json.usage?.output_tokens ?? 0,
          cache_read: json.usage?.cache_read_input_tokens ?? 0,
          cache_creation: json.usage?.cache_creation_input_tokens ?? 0,
          cost_usd: json.total_cost_usd ?? 0,
          duration_ms: json.duration_ms ?? 0,
          num_turns: json.num_turns ?? 0,
          response_length: (json.result?.length ?? 0),
        };
      } catch {
        console.error(`  ${C.red}Failed to parse:${C.reset} ${c.id} (${mode})`);
        return {
          id: c.id, category: c.category, mode,
          input_tokens: 0, output_tokens: 0, cache_read: 0, cache_creation: 0,
          cost_usd: 0, duration_ms: 0, num_turns: 0, response_length: 0,
        };
      }
    }

    // Phase 1: WITH Nodex
    console.log(`\n${C.green}${C.bold} Phase 1: WITH Nodex${C.reset}`);
    for (const c of cases) {
      process.stdout.write(`  ${C.dim}${c.id}...${C.reset}`);
      const r = await runCase(c, "on");
      results.push(r);
      console.log(` ${r.duration_ms}ms  ${r.input_tokens} in  ${r.output_tokens} out  $${r.cost_usd.toFixed(4)}`);
    }

    // Phase 2: WITHOUT Nodex
    console.log(`\n${C.yellow}${C.bold} Phase 2: WITHOUT Nodex (baseline)${C.reset}`);
    for (const c of cases) {
      process.stdout.write(`  ${C.dim}${c.id}...${C.reset}`);
      const r = await runCase(c, "off");
      results.push(r);
      console.log(` ${r.duration_ms}ms  ${r.input_tokens} in  ${r.output_tokens} out  $${r.cost_usd.toFixed(4)}`);
    }

    // Reset bench mode
    setProject("bench_mode", "");
    setProject("bench_session", "");

    // ── Summary ──
    const onResults  = results.filter(r => r.mode === "on");
    const offResults = results.filter(r => r.mode === "off");

    const sum = (arr: RunResult[], key: keyof RunResult) =>
      arr.reduce((s, r) => s + (r[key] as number), 0);

    const onTokens  = sum(onResults, "input_tokens") + sum(onResults, "cache_read") + sum(onResults, "cache_creation");
    const offTokens = sum(offResults, "input_tokens") + sum(offResults, "cache_read") + sum(offResults, "cache_creation");
    const onCost    = sum(onResults, "cost_usd");
    const offCost   = sum(offResults, "cost_usd");
    const onTime    = sum(onResults, "duration_ms");
    const offTime   = sum(offResults, "duration_ms");

    console.log(`\n${line(60)}`);
    console.log(`${C.bold} Summary (${cases.length} test cases)${C.reset}\n`);

    console.log(`  ${"".padEnd(20)} ${C.green}WITH Nodex${C.reset}   ${C.yellow}WITHOUT${C.reset}`);
    console.log(`  ${"Input tokens".padEnd(20)} ${String(onTokens).padStart(10)}   ${String(offTokens).padStart(10)}`);
    console.log(`  ${"Output tokens".padEnd(20)} ${String(sum(onResults, "output_tokens")).padStart(10)}   ${String(sum(offResults, "output_tokens")).padStart(10)}`);
    console.log(`  ${"Total time".padEnd(20)} ${String(onTime + "ms").padStart(10)}   ${String(offTime + "ms").padStart(10)}`);
    console.log(`  ${"Cost".padEnd(20)} ${("$" + onCost.toFixed(4)).padStart(10)}   ${("$" + offCost.toFixed(4)).padStart(10)}`);

    const tokenDiff = offTokens - onTokens;
    const costDiff  = offCost - onCost;
    const timeDiff  = offTime - onTime;

    console.log(`\n${line(60)}`);
    console.log(`${C.bold} Delta${C.reset}`);
    const tokenCol = tokenDiff > 0 ? C.green : C.red;
    const costCol  = costDiff > 0 ? C.green : C.red;
    const timeCol  = timeDiff > 0 ? C.green : C.red;
    console.log(`  Tokens: ${tokenCol}${tokenDiff > 0 ? "+" : ""}${tokenDiff.toLocaleString()} ${tokenDiff > 0 ? "saved" : "more"} with Nodex${C.reset}`);
    console.log(`  Cost:   ${costCol}${costDiff > 0 ? "+" : ""}$${costDiff.toFixed(4)} ${costDiff > 0 ? "saved" : "more"}${C.reset}`);
    console.log(`  Time:   ${timeCol}${timeDiff > 0 ? "+" : ""}${timeDiff}ms ${timeDiff > 0 ? "faster" : "slower"}${C.reset}`);
    console.log(line(60));

    // Per-case comparison
    console.log(`\n${C.bold} Per-case breakdown${C.reset}\n`);
    console.log(`  ${"Case".padEnd(20)} ${"Δ tokens".padStart(10)} ${"Δ cost".padStart(10)} ${"Δ time".padStart(10)}`);
    console.log(`  ${"─".repeat(20)} ${"─".repeat(10)} ${"─".repeat(10)} ${"─".repeat(10)}`);
    for (const c of cases) {
      const on  = onResults.find(r => r.id === c.id)!;
      const off = offResults.find(r => r.id === c.id)!;
      const onT  = on.input_tokens + on.cache_read + on.cache_creation;
      const offT = off.input_tokens + off.cache_read + off.cache_creation;
      const dT = offT - onT;
      const dC = off.cost_usd - on.cost_usd;
      const dMs = off.duration_ms - on.duration_ms;
      console.log(
        `  ${c.id.padEnd(20)} ${(dT > 0 ? "+" + dT : String(dT)).padStart(10)} ${((dC > 0 ? "+" : "") + "$" + dC.toFixed(4)).padStart(10)} ${((dMs > 0 ? "+" : "") + dMs + "ms").padStart(10)}`
      );
    }

    // Save results to file
    const reportPath = join(root, ".nodex", "bench_report.json");
    await Bun.write(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), cases, results }, null, 2));
    console.log(`\n${C.dim}Full report: ${reportPath}${C.reset}\n`);
    return;
  }

  console.log(`Usage:
  nodex bench on       Start WITH-Nodex session
  nodex bench off      Start WITHOUT-Nodex (baseline) session
  nodex bench run      Automated A/B test (runs claude -p for each case)
  nodex bench report   Compare last on vs off session
  nodex bench reset    Clear bench mode
`);
}

import { initDB } from "../store/db.ts";
import { getTokenSummary, getTokenByFile } from "../store/token_usage.ts";

function parseSince(arg: string | undefined): number | undefined {
  if (!arg) return undefined;
  const match = arg.match(/^(\d+)(d|h|w)$/);
  if (!match) return undefined;
  const n = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const now = Math.floor(Date.now() / 1000);
  if (unit === "h") return now - n * 3600;
  if (unit === "d") return now - n * 86400;
  if (unit === "w") return now - n * 7 * 86400;
  return undefined;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export async function runTokens(args: string[]) {
  const root = process.cwd();
  initDB(root);

  const byFile = args.includes("--by-file");
  const sinceArg = args.find(a => a.startsWith("--since="))?.split("=")[1]
    ?? (args.includes("--since") ? args[args.indexOf("--since") + 1] : undefined);
  const sinceSec = parseSince(sinceArg);
  const sinceLabel = sinceArg ? ` (utóbbi ${sinceArg})` : " (összes)";

  const summary = getTokenSummary(sinceSec);

  console.log(`\n\x1b[1mNodex Token Usage${sinceLabel}\x1b[0m`);
  console.log("─".repeat(52));

  const totalTokens = summary.total_input + summary.total_output;

  console.log(`  Összes hívás:  \x1b[1m${summary.total_calls}\x1b[0m`);
  console.log(`  Input tokens:  \x1b[36m${fmtTokens(summary.total_input)}\x1b[0m`);
  console.log(`  Output tokens: \x1b[36m${fmtTokens(summary.total_output)}\x1b[0m`);
  console.log(`  Total tokens:  \x1b[1m${fmtTokens(totalTokens)}\x1b[0m`);

  // By operation
  if (Object.keys(summary.by_operation).length > 0) {
    console.log("\n  Operáció szerint:");
    for (const [op, stats] of Object.entries(summary.by_operation)) {
      console.log(
        `    \x1b[90m${op.padEnd(20)}\x1b[0m` +
        ` in: \x1b[36m${fmtTokens(stats.input).padStart(7)}\x1b[0m` +
        `  out: \x1b[36m${fmtTokens(stats.output).padStart(7)}\x1b[0m` +
        `  \x1b[90m(${stats.calls} call)\x1b[0m`
      );
    }
  }

  // By file
  if (byFile) {
    const fileStats = getTokenByFile(sinceSec, 20);
    if (fileStats.length > 0) {
      console.log("\n  Top fájlok (token szerint, top 20):");
      console.log(`  ${"Fájl".padEnd(48)} ${"In".padStart(8)}  ${"Out".padStart(8)}  Calls`);
      console.log("  " + "─".repeat(76));
      for (const f of fileStats) {
        console.log(
          `  \x1b[90m${f.file.slice(-47).padEnd(48)}\x1b[0m` +
          ` \x1b[36m${fmtTokens(f.input_tokens).padStart(8)}\x1b[0m` +
          `  \x1b[36m${fmtTokens(f.output_tokens).padStart(8)}\x1b[0m` +
          `  ${f.calls}`
        );
      }
    } else {
      console.log("\n  Nincs adat.");
    }
  }

  console.log();
  if (!byFile) {
    console.log("  \x1b[90mRészletes nézet: nodex tokens --by-file\x1b[0m");
    console.log("  \x1b[90mIdőszűrés:       nodex tokens --since=7d  (h/d/w)\x1b[0m");
  }
  console.log();
}

import { join } from "node:path";
import { initDB } from "../store/db.ts";
import { getNodesByFile, searchNodes, getAllNodes, getNodeStatus } from "../store/nodes.ts";
import { getProject } from "../store/meta.ts";
import { detectLanguage } from "../indexer/languages/index.ts";
import { enrichFiles } from "../summarizer/queue.ts";

export async function runFocus(args: string[]) {
  const root = process.cwd();
  initDB(root);

  const query = args[0];
  if (!query) {
    console.error("Usage: nodex focus <path|::symbol|\"intent query\">");
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("nodex focus: ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  const filesToEnrich = resolveTargetFiles(root, query);

  if (filesToEnrich.length === 0) {
    console.log("nodex focus: No matching files found.");
    return;
  }

  console.log(`\nnodex focus: ${filesToEnrich.length} fájl enrichmentje...\n`);

  let cachedCount = 0;
  const results = await enrichFiles(root, filesToEnrich, {
    operation: "focus",
    onProgress: (file, done, total) => {
      process.stdout.write(`  \x1b[33m⠸\x1b[0m ${file}\r`);
    },
    onError: (file, err) => {
      process.stderr.write(`  \x1b[31m✗\x1b[0m ${file} — ${err}\n`);
    },
  });

  // Print per-file results
  for (const r of results) {
    if (r.cached) {
      cachedCount++;
      console.log(`  \x1b[32m✓\x1b[0m ${r.file}  \x1b[90m(cache, nem változott)\x1b[0m`);
    } else {
      console.log(`  \x1b[32m✓\x1b[0m ${r.file}  \x1b[90m${r.gotchas} gotcha, ${r.functions} függvény\x1b[0m`);
    }
  }

  const enriched = results.filter(r => !r.cached).length;
  const totalGotchas = results.reduce((s, r) => s + r.gotchas, 0);
  const totalFunctions = results.reduce((s, r) => s + r.functions, 0);
  const totalIn = results.reduce((s, r) => s + r.inputTokens, 0);
  const totalOut = results.reduce((s, r) => s + r.outputTokens, 0);
  const { calcCost } = await import("../store/token_usage.ts");
  const cost = calcCost(totalIn, totalOut, "claude-haiku-4-5-20251001");
  const costStr = cost < 0.001 ? "<$0.001" : `$${cost.toFixed(4)}`;

  console.log(
    `\n\x1b[35m📍 Összefoglaló:\x1b[0m ${totalFunctions} függvény, ${totalGotchas} gotcha` +
    ` | ${enriched} enrichelve, ${cachedCount} cache` +
    ` \x1b[90m| ${totalIn + totalOut} token (${costStr})\x1b[0m\n`
  );
}

/** Resolve query to list of relative file paths to enrich */
function resolveTargetFiles(root: string, query: string): string[] {
  // Path-based: starts with ./ or src/ or contains / and no spaces
  const isPathLike = /^[./]/.test(query) || (query.includes("/") && !query.includes(" "));
  const isSymbolRef = query.includes("::");

  if (isSymbolRef) {
    // nodex focus src/auth/auth.service.ts::login
    const [filePart] = query.split("::");
    if (filePart) return [filePart];
  }

  if (isPathLike) {
    // nodex focus src/auth/ or nodex focus src/auth/auth.service.ts
    return resolvePathFiles(root, query);
  }

  // Intent-based: FTS search
  return resolveIntentFiles(root, query);
}

function resolvePathFiles(root: string, pathQuery: string): string[] {
  const allNodes = getAllNodes();
  const uniqueFiles = [...new Set(allNodes.map(n => n.file))];

  // Normalize: strip leading ./ or /
  const normalized = pathQuery.replace(/^\.\//, "").replace(/\/$/, "");

  const matched = uniqueFiles.filter(f => f.startsWith(normalized) || f === normalized);

  if (matched.length === 0) {
    console.warn(`  No files found matching path: ${pathQuery}`);
  }

  return matched;
}

function resolveIntentFiles(root: string, intentQuery: string): string[] {
  const results = searchNodes(intentQuery, 30);
  const uniqueFiles = [...new Set(results.map(n => n.file))];

  if (uniqueFiles.length === 0) {
    console.warn("  Intent search returned no results. Try a path-based query.");
    return [];
  }

  // Warn if most results have no summary (FTS unreliable)
  const allNodes = getAllNodes();
  const fileNodes = allNodes.filter(n => uniqueFiles.includes(n.file) && n.name === "__module__");
  const unknownCount = fileNodes.filter(n => getNodeStatus(n) === "unknown").length;

  if (fileNodes.length > 0 && unknownCount / fileNodes.length > 0.5) {
    console.warn(
      `  \x1b[33mFigyelmeztetés:\x1b[0m ${unknownCount}/${fileNodes.length} talált fájlnak nincs AI summary — ` +
      `az intent-alapú keresés pontatlan lehet. Futtasd előbb: \x1b[1mnodex sync --enrich\x1b[0m`
    );
  }

  return uniqueFiles;
}

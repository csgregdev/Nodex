import { initDB } from "../store/db.ts";
import { parseFile } from "../indexer/parser.ts";
import { indexFile } from "../indexer/graph.ts";
import { fileHash } from "../indexer/differ.ts";
import { detectLanguage } from "../indexer/languages/index.ts";
import { join } from "node:path";

export async function runSync(args: string[]) {
  const root = process.cwd();
  const enrich = args.includes("--enrich");
  initDB(root);

  // Get changed files since last commit (or last n commits)
  let gitOutput: string;
  try {
    const result = await Bun.$`git -C ${root} diff --name-only HEAD~1`.text();
    gitOutput = result;
  } catch {
    // Try just staged/unstaged changes
    try {
      const result = await Bun.$`git -C ${root} diff --name-only`.text();
      gitOutput = result;
    } catch (err) {
      console.error("Nodex: git diff failed. Is this a git repo?", err);
      process.exit(1);
    }
  }

  const changedFiles = gitOutput.trim().split("\n").filter(Boolean);

  if (changedFiles.length === 0) {
    console.log("Nodex: No changed files found.");
    return;
  }

  console.log(`Nodex: Syncing ${changedFiles.length} changed files...`);
  let indexed = 0;

  for (const file of changedFiles) {
    const lang = detectLanguage(file);
    if (!lang) continue;

    const absolutePath = join(root, file);
    const bunFile = Bun.file(absolutePath);
    if (!(await bunFile.exists())) continue;

    try {
      const hash = await fileHash(absolutePath);
      const parsed = await parseFile(absolutePath, file, lang.name);
      indexFile(parsed, hash);
      indexed++;
      console.log(`  Updated: ${file} (${parsed.symbols.length} symbols)`);
    } catch (err) {
      console.error(`  Error: ${file}:`, err);
    }
  }

  console.log(`Nodex: Done. ${indexed} files synced.`);

  // AI enrichment of stale/changed files
  if (enrich) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn("Nodex: ANTHROPIC_API_KEY not set. Skipping AI enrichment.");
      return;
    }
    // Also include all stale nodes from DB
    const { getStaleNodes, getUnknownNodes } = await import("../store/nodes.ts");
    const stale = getStaleNodes().map(n => n.file);
    const unknown = getUnknownNodes().map(n => n.file);
    const toEnrich = [...new Set([...changedFiles, ...stale, ...unknown])];

    if (toEnrich.length === 0) {
      console.log("Nodex: Nothing to enrich — AI knowledge is up to date.");
      return;
    }

    console.log(`\nNodex: Enriching ${toEnrich.length} files with AI...`);
    const { enrichFiles } = await import("../summarizer/queue.ts");
    await enrichFiles(root, toEnrich, {
      onProgress: (file, done, total) => {
        process.stdout.write(`\r  Enriched: ${done}/${total} — ${file}                    `);
      },
      onError: (file, err) => {
        process.stderr.write(`\n  AI error: ${file}: ${err}\n`);
      },
    });
    console.log("\nNodex: AI enrichment done.");
  }
}

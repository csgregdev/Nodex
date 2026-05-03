import { initDB } from "../store/db.ts";
import { setProject } from "../store/meta.ts";
import { walkProject } from "../indexer/walker.ts";
import { parseFile } from "../indexer/parser.ts";
import { indexFile } from "../indexer/graph.ts";
import { fileHash } from "../indexer/differ.ts";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function runInit(args: string[]) {
  const root = process.cwd();

  console.log(`Nodex: Initializing index for ${root}`);

  // Create .nodex dir
  await mkdir(join(root, ".nodex"), { recursive: true });

  // Init DB
  initDB(root);

  // Store root
  setProject("root_path", root);
  setProject("last_sync", String(Math.floor(Date.now() / 1000)));

  let fileCount = 0;
  let nodeCount = 0;
  let errorCount = 0;

  console.log("Nodex: Scanning files...");

  for await (const file of walkProject(root)) {
    const hash = await fileHash(file.absolutePath);

    try {
      const parsed = await parseFile(file.absolutePath, file.relativePath, file.language);
      indexFile(parsed, hash);
      fileCount++;
      nodeCount += parsed.symbols.length;
      process.stdout.write(`\r  Indexed: ${fileCount} files, ${nodeCount} symbols`);
    } catch (err) {
      errorCount++;
      process.stderr.write(`\n  Error parsing ${file.relativePath}: ${err}\n`);
    }
  }

  console.log(`\nNodex: Done. ${fileCount} files, ${nodeCount} symbols indexed.${errorCount > 0 ? ` (${errorCount} errors)` : ""}`);
  console.log(`  Database: ${join(root, ".nodex", "index.db")}`);

  // Generate context.md
  await generateContextMd(root);
  console.log(`  Context: ${join(root, ".nodex", "context.md")}`);

  // Generate CLAUDE.md integration template
  const claudeMdContent = `## Nodex Index
This project uses Nodex for live codebase indexing.

After every file modification, call:
\`\`\`
nodex_update_file({ file: "path/to/modified/file.ts" })
\`\`\`

Available MCP tools:
- \`nodex_search(query)\` — find functions, modules, classes
- \`nodex_get_context(file)\` — full context for a file
- \`nodex_impact_map(node_id)\` — what breaks if you change this
- \`nodex_add_decision(node_id, decision)\` — record architectural decisions
- \`nodex_get_conventions()\` — project conventions and AI decisions

Current project summary: .nodex/context.md
`;
  await Bun.write(join(root, ".nodex", "CLAUDE.md"), claudeMdContent);
  console.log(`  Claude integration: ${join(root, ".nodex", "CLAUDE.md")}`);
}

async function generateContextMd(root: string) {
  const { getAllNodes } = await import("../store/nodes.ts");
  const { getAllEdges } = await import("../store/edges.ts");

  const nodes = getAllNodes();
  const edges = getAllEdges();

  // Group by file, exclude __module__ sentinel
  const byFile = new Map<string, typeof nodes>();
  for (const node of nodes) {
    if (node.name === "__module__") continue;
    if (!byFile.has(node.file)) byFile.set(node.file, []);
    byFile.get(node.file)!.push(node);
  }

  const symbolCount = nodes.filter((n) => n.name !== "__module__").length;

  const lines = [
    "# Nodex Context",
    `Generated: ${new Date().toISOString()}`,
    `Files: ${byFile.size} | Symbols: ${symbolCount} | Edges: ${edges.length}`,
    "",
    "## Project Structure",
    "",
  ];

  for (const [file, fileNodes] of [...byFile.entries()].sort()) {
    lines.push(`### ${file}`);
    for (const node of fileNodes) {
      lines.push(`  ${node.type}: ${node.token ?? node.name}`);
    }
    lines.push("");
  }

  await Bun.write(join(root, ".nodex", "context.md"), lines.join("\n"));
}

import { initDB } from "../store/db.ts";
import { getAllNodes, upsertNode } from "../store/nodes.ts";
import { addMeta, getMetaByNode } from "../store/meta.ts";
import { summarizeModules } from "../summarizer/ai.ts";
import { needsAISummary, markAISummarized } from "../summarizer/cache.ts";
import { fileHash } from "../indexer/differ.ts";
import { join } from "node:path";

export async function runSummarize(args: string[]) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable not set");
    console.error("Set it in .env or export it before running codex summarize");
    process.exit(1);
  }

  const root = process.cwd();
  initDB(root);

  const allNodes = getAllNodes();

  // Group nodes by file (module)
  const byFile = new Map<string, typeof allNodes>();
  for (const node of allNodes) {
    if (!byFile.has(node.file)) byFile.set(node.file, []);
    byFile.get(node.file)!.push(node);
  }

  // Determine which files need summarization
  const toSummarize: Array<{
    file: string;
    language: string;
    nodes: typeof allNodes;
    sourceSnippet: string;
    hash: string;
  }> = [];

  for (const [file, nodes] of byFile) {
    // Module node id is `${file}::__module__`
    const moduleNode = nodes.find(n => n.id === `${file}::__module__`);
    if (!moduleNode) continue;

    const absolutePath = join(root, file);
    let hash: string;
    try {
      hash = await fileHash(absolutePath);
    } catch {
      continue; // file might have been deleted
    }

    if (!needsAISummary(moduleNode.id, hash)) {
      continue; // already up to date
    }

    // Read source snippet (first 100 lines)
    let sourceSnippet = "";
    try {
      const content = await Bun.file(absolutePath).text();
      sourceSnippet = content.split("\n").slice(0, 100).join("\n");
    } catch {
      continue;
    }

    toSummarize.push({
      file,
      language: moduleNode.language ?? "unknown",
      nodes,
      sourceSnippet,
      hash,
    });
  }

  if (toSummarize.length === 0) {
    console.log("Codex: All modules up to date. Nothing to summarize.");
    return;
  }

  console.log(`Codex: Summarizing ${toSummarize.length} modules with Claude Haiku...`);

  let done = 0;

  for await (const { file, result } of summarizeModules(toSummarize)) {
    done++;
    process.stdout.write(`\r  [${done}/${toSummarize.length}] ${file}`);

    // Update module node with AI summary and token
    const moduleNode = byFile.get(file)?.find(n => n.id === `${file}::__module__`);
    if (moduleNode) {
      upsertNode({
        ...moduleNode,
        summary: result.summary,
        token: result.token || moduleNode.token,
      });

      const hash = toSummarize.find(m => m.file === file)?.hash ?? "";
      markAISummarized(moduleNode.id, hash);

      // Store gotchas and ai decisions in meta
      for (const gotcha of result.gotchas) {
        addMeta({ node_id: moduleNode.id, key: "gotcha", value: gotcha, created: Math.floor(Date.now() / 1000) });
      }
      for (const decision of result.aiDecisions) {
        addMeta({ node_id: moduleNode.id, key: "ai_decision", value: decision, created: Math.floor(Date.now() / 1000) });
      }
    }
  }

  console.log(`\nCodex: Done. ${done} modules summarized.`);

  // Regenerate context.md with AI data
  await regenerateContextMd(root);
  console.log(`  Updated: ${join(root, ".codex", "context.md")}`);
}

async function regenerateContextMd(root: string) {
  const { getAllNodes } = await import("../store/nodes.ts");
  const { getAllEdges } = await import("../store/edges.ts");

  const nodes = getAllNodes();
  const edges = getAllEdges();

  // Group by file
  const byFile = new Map<string, typeof nodes>();
  for (const node of nodes) {
    if (!byFile.has(node.file)) byFile.set(node.file, []);
    byFile.get(node.file)!.push(node);
  }

  const lines = [
    "# Codex Context (AI Enhanced)",
    `Generated: ${new Date().toISOString()}`,
    `Files: ${byFile.size} | Symbols: ${nodes.filter(n => !n.id.endsWith("::__module__")).length} | Edges: ${edges.length}`,
    "",
    "## Project Structure",
    "",
  ];

  for (const [file, fileNodes] of [...byFile.entries()].sort()) {
    const moduleNode = fileNodes.find(n => n.id === `${file}::__module__`);
    const symbols = fileNodes.filter(n => !n.id.endsWith("::__module__"));

    lines.push(`### ${file}`);

    if (moduleNode?.summary) {
      lines.push(`> ${moduleNode.summary}`);
    }

    if (moduleNode) {
      const meta = getMetaByNode(moduleNode.id);
      const gotchas = meta.filter(m => m.key === "gotcha");
      if (gotchas.length) {
        lines.push(`> ⚠ ${gotchas.map(g => g.value).join(" | ")}`);
      }
    }

    for (const node of symbols) {
      lines.push(`  ${node.type}: ${node.token ?? node.name}`);
    }
    lines.push("");
  }

  await Bun.write(join(root, ".codex", "context.md"), lines.join("\n"));
}

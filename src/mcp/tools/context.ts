import { z } from "zod";
import { getNodesByFile, getNodeStatus, markAIEnriched, upsertNode, type Node } from "../../store/nodes.ts";
import { getEdgesFrom, getEdgesTo, type Edge } from "../../store/edges.ts";
import { getMetaByNode, addMeta, getProject } from "../../store/meta.ts";
import { join } from "node:path";

export const contextToolDef = {
  name: "nodex_get_context",
  description: "Get full context for a file: all its symbols, imports/exports, and AI summaries. Triggers lazy AI enrichment if summary is missing. Auto-reindexes if file was modified since last parse.",
  inputSchema: {
    type: "object" as const,
    properties: {
      file: { type: "string", description: "File path relative to project root" },
      enrich: { type: "boolean", description: "Force re-enrichment even if stale (default false)" },
    },
    required: ["file"],
  },
};

async function isFileStaleSinceLastParse(absolutePath: string, lastParsed: number | null | undefined): Promise<boolean> {
  if (!lastParsed) return false;
  try {
    const stat = await Bun.file(absolutePath).stat();
    return Math.floor(stat.mtimeMs / 1000) > lastParsed;
  } catch {
    return false;
  }
}

interface Digest {
  purpose: string;
  line_count: number;
  symbol_count: number;
  exported_api: string[];
  imports_from: string[];
  used_by: string[];
  warnings: string[];
  change_risk: "low" | "medium" | "high";
  read_these_too: string[];
}

function buildDigest(
  file: string,
  absolutePath: string,
  symbols: Node[],
  moduleNode: Node | null | undefined,
  edges: Edge[],
  coChanges: { from_id: string; to_id: string; weight: number }[],
  meta: { key: string; value: string }[],
): Digest {
  // Line count: max line from symbols or fallback
  const maxLine = Math.max(...symbols.map(s => s.line ?? 0), 0);
  const lineCount = maxLine > 0 ? maxLine : 0;

  // Purpose: infer from framework hint, file path, and symbol types
  const token = moduleNode?.token ?? "";
  const fwMatch = token.match(/\|fw:(\w+)/);
  const framework = fwMatch ? fwMatch[1] : null;
  const fileName = file.split("/").pop() ?? file;
  const dir = file.split("/").slice(-2, -1)[0] ?? "";

  const classNodes = symbols.filter(s => s.type === "class" || s.type === "widget");
  const fnNodes = symbols.filter(s => s.type === "fn");
  const mainClass = classNodes[0];

  let purpose = `${fileName}`;
  if (mainClass) {
    const ext = mainClass.token?.match(/extends:(\w+)/)?.[1];
    purpose = `${mainClass.name}${ext ? ` (${ext})` : ""} — ${fnNodes.length} methods`;
    if (framework) purpose += ` [${framework}]`;
  } else if (fnNodes.length > 0) {
    purpose = `${fnNodes.length} functions`;
    if (framework) purpose += ` [${framework}]`;
  }

  // Exports: what this module's symbols are — parse from module token
  const exportsMatch = token.match(/\|exports:(.+)$/);
  const exportedApi = exportsMatch
    ? exportsMatch[1].split(",").filter(Boolean)
    : symbols.filter(s => s.type === "class" || s.type === "widget" || s.type === "fn").map(s => s.name);

  // Imports from: unique files this file imports
  const importsFrom = [...new Set(
    edges
      .filter(e => e.relationship === "imports" && e.from_id.startsWith(`${file}::`))
      .map(e => e.to_id.replace("::__module__", ""))
  )];

  // Used by: which files import THIS file (reverse lookup)
  const moduleId = `${file}::__module__`;
  const reverseEdges = getEdgesTo(moduleId);
  const usedBy = [...new Set(
    reverseEdges
      .filter(e => e.relationship === "imports")
      .map(e => {
        const parts = e.from_id.split("::");
        return parts.slice(0, -1).join("::");
      })
  )];

  // Warnings
  const warnings: string[] = [];
  if (lineCount > 500) warnings.push(`${lineCount}+ lines — very large file, consider splitting`);
  else if (lineCount > 200) warnings.push(`${lineCount}+ lines — large file`);
  if (symbols.length > 15) warnings.push(`${symbols.length} symbols — complex file`);
  const hotspot = moduleNode?.hotspot_score ?? 0;
  if (hotspot >= 0.7) warnings.push(`🔥 hotspot (score: ${Math.round(hotspot * 100)}%) — high churn + complexity`);
  else if (hotspot >= 0.4) warnings.push(`hotspot (score: ${Math.round(hotspot * 100)}%)`);
  if (coChanges.length >= 5) warnings.push(`${coChanges.length} co-change partners — high coupling`);
  const gotchas = meta.filter(m => m.key === "gotcha");
  if (gotchas.length > 0) warnings.push(`${gotchas.length} gotcha(s) recorded`);

  // Change risk
  const riskFactors = [
    hotspot >= 0.5 ? 2 : hotspot >= 0.2 ? 1 : 0,
    usedBy.length > 5 ? 2 : usedBy.length > 2 ? 1 : 0,
    coChanges.length > 3 ? 1 : 0,
    lineCount > 300 ? 1 : 0,
  ];
  const riskScore = riskFactors.reduce((a, b) => a + b, 0);
  const changeRisk: Digest["change_risk"] = riskScore >= 4 ? "high" : riskScore >= 2 ? "medium" : "low";

  // Read these too: co-change files that are NOT direct imports (hidden coupling)
  const importSet = new Set(importsFrom);
  const readTheseToo = coChanges
    .map(c => {
      const peer = c.from_id === `file::${file}`
        ? c.to_id.replace("file::", "")
        : c.from_id.replace("file::", "");
      return { file: peer, weight: c.weight };
    })
    .filter(c => !importSet.has(c.file))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map(c => c.file);

  return {
    purpose,
    line_count: lineCount,
    symbol_count: symbols.length,
    exported_api: exportedApi.slice(0, 10),
    imports_from: importsFrom,
    used_by: usedBy.slice(0, 10),
    warnings,
    change_risk: changeRisk,
    read_these_too: readTheseToo,
  };
}

export async function contextTool(input: unknown) {
  const { file, enrich } = z.object({
    file: z.string(),
    enrich: z.boolean().optional().default(false),
  }).parse(input);

  const projectRoot = getProject("root_path") ?? process.cwd();
  const absolutePath = join(projectRoot, file);

  let nodes = getNodesByFile(file);
  const moduleNode = nodes.find(n => n.name === "__module__");

  // Auto-reindex if file changed on disk since last parse (watcher may not be running)
  let autoReindexed = false;
  if (await isFileStaleSinceLastParse(absolutePath, moduleNode?.last_parsed)) {
    try {
      const { updateTool } = await import("./update.ts");
      await updateTool({ file });
      nodes = getNodesByFile(file);
      autoReindexed = true;
    } catch { /* fail silently — return existing data */ }
  }

  // Lazy AI enrichment
  if (moduleNode && process.env.ANTHROPIC_API_KEY) {
    const status = getNodeStatus(moduleNode);
    if (status === "unknown" || (status === "stale" && enrich)) {
      try {
        const { enrichFiles } = await import("../../summarizer/queue.ts");
        await enrichFiles(projectRoot, [file], { rpm: 60, operation: "mcp_lazy" });
        // Reload after enrichment
        nodes = getNodesByFile(file);
      } catch { /* fail silently — return what we have */ }
    }
  }

  const freshModuleNode = nodes.find(n => n.name === "__module__");
  const edges: ReturnType<typeof getEdgesFrom> = [];
  for (const node of nodes) {
    edges.push(...getEdgesFrom(node.id));
  }

  // Include co_changes edges
  const { getDB } = await import("../../store/db.ts");
  const db = getDB();
  const coChanges = db
    .query<{ from_id: string; to_id: string; weight: number }, [string, string]>(
      `SELECT from_id, to_id, weight FROM edges WHERE relationship = 'co_changes' AND (from_id = ? OR to_id = ?)`
    )
    .all(`file::${file}`, `file::${file}`);

  const meta = freshModuleNode ? getMetaByNode(freshModuleNode.id) : [];

  const aiStatus = freshModuleNode ? getNodeStatus(freshModuleNode) : "unknown";

  const tokenSummary = nodes
    .filter(n => n.name !== "__module__")
    .map(n => n.token ?? n.name)
    .join(" | ");

  // ── Enrich-free digest (no AI needed) ─────────────────
  const symbols = nodes.filter(n => n.name !== "__module__");
  const digest = buildDigest(file, absolutePath, symbols, freshModuleNode, edges, coChanges, meta);

  return {
    digest,
    nodes: symbols,
    module: freshModuleNode ?? null,
    edges,
    co_changes: coChanges,
    meta,
    token_summary: tokenSummary,
    ai_status: aiStatus,
    auto_reindexed: autoReindexed,
    hotspot_score: freshModuleNode?.hotspot_score ?? 0,
    commit_count: freshModuleNode?.commit_count ?? 0,
  };
}

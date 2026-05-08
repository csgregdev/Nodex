import { z } from "zod";
import { getNodesByFile, getNodeStatus, markAIEnriched, upsertNode } from "../../store/nodes.ts";
import { getEdgesFrom, getEdgesTo } from "../../store/edges.ts";
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

  return {
    nodes: nodes.filter(n => n.name !== "__module__"),
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

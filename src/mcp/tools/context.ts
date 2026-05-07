import { z } from "zod";
import { getNodesByFile, getNodeStatus, markAIEnriched, upsertNode } from "../../store/nodes.ts";
import { getEdgesFrom, getEdgesTo } from "../../store/edges.ts";
import { getMetaByNode, addMeta, getProject } from "../../store/meta.ts";

export const contextToolDef = {
  name: "nodex_get_context",
  description: "Get full context for a file: all its symbols, imports/exports, and AI summaries. Triggers lazy AI enrichment if summary is missing.",
  inputSchema: {
    type: "object" as const,
    properties: {
      file: { type: "string", description: "File path relative to project root" },
      enrich: { type: "boolean", description: "Force re-enrichment even if stale (default false)" },
    },
    required: ["file"],
  },
};

export async function contextTool(input: unknown) {
  const { file, enrich } = z.object({
    file: z.string(),
    enrich: z.boolean().optional().default(false),
  }).parse(input);

  let nodes = getNodesByFile(file);
  const moduleNode = nodes.find(n => n.name === "__module__");

  // Lazy AI enrichment
  if (moduleNode && process.env.ANTHROPIC_API_KEY) {
    const status = getNodeStatus(moduleNode);
    if (status === "unknown" || (status === "stale" && enrich)) {
      try {
        const projectRoot = getProject("root_path") ?? process.cwd();
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
    hotspot_score: freshModuleNode?.hotspot_score ?? 0,
    commit_count: freshModuleNode?.commit_count ?? 0,
  };
}

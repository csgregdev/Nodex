import { z } from "zod";
import { searchNodes, getNodeStatus } from "../../store/nodes.ts";
import { getEdgesTo } from "../../store/edges.ts";

export const searchToolDef = {
  name: "nodex_search",
  description: "Search the codebase index for functions, classes, modules by name or description. Returns rich metadata: type, hotspot score, change risk, dependent count.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "Search query" },
      limit: { type: "number", description: "Max results (default 10)" },
    },
    required: ["query"],
  },
};

export function searchTool(input: unknown) {
  const { query, limit } = z.object({
    query: z.string(),
    limit: z.number().optional().default(10),
  }).parse(input);

  const results = searchNodes(query, limit);
  return results.map(n => {
    const dependents = getEdgesTo(n.id).filter(e => e.relationship !== "co_changes");
    const hotspot = n.hotspot_score ?? 0;
    const warnings: string[] = [];
    if (hotspot >= 0.7) warnings.push("hotspot — high churn");
    if (dependents.length > 5) warnings.push(`${dependents.length} dependents — wide impact`);

    return {
      id: n.id,
      token: n.token ?? n.name,
      summary: n.summary ?? null,
      file: n.file,
      line: n.line,
      type: n.type,
      language: n.language,
      ai_status: getNodeStatus(n),
      hotspot_score: hotspot,
      dependent_count: dependents.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  });
}

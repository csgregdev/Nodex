import { z } from "zod";
import { searchNodes, getNodeStatus } from "../../store/nodes.ts";

export const searchToolDef = {
  name: "nodex_search",
  description: "Search the codebase index for functions, classes, modules by name or description",
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
  return results.map(n => ({
    id: n.id,
    token: n.token ?? n.name,
    summary: n.summary ?? null,
    file: n.file,
    line: n.line,
    type: n.type,
    language: n.language,
    ai_status: getNodeStatus(n),
    hotspot_score: n.hotspot_score ?? 0,
  }));
}

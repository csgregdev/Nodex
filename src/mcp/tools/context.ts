import { z } from "zod";
import { getNodesByFile } from "../../store/nodes.ts";
import { getEdgesFrom, getEdgesTo } from "../../store/edges.ts";
import { getMetaByNode } from "../../store/meta.ts";

export const contextToolDef = {
  name: "nodex_get_context",
  description: "Get full context for a file: all its symbols, imports/exports, and AI summaries",
  inputSchema: {
    type: "object" as const,
    properties: {
      file: { type: "string", description: "File path relative to project root" },
    },
    required: ["file"],
  },
};

export function contextTool(input: unknown) {
  const { file } = z.object({ file: z.string() }).parse(input);

  const nodes = getNodesByFile(file);
  const moduleNode = nodes.find(n => n.name === "__module__");

  const edges: ReturnType<typeof getEdgesFrom> = [];
  for (const node of nodes) {
    edges.push(...getEdgesFrom(node.id));
  }

  const meta = moduleNode ? getMetaByNode(moduleNode.id) : [];

  const tokenSummary = nodes
    .filter(n => n.name !== "__module__")
    .map(n => n.token ?? n.name)
    .join(" | ");

  return {
    nodes: nodes.filter(n => n.name !== "__module__"),
    module: moduleNode ?? null,
    edges,
    meta,
    token_summary: tokenSummary,
  };
}

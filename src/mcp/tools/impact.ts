import { z } from "zod";
import { getNode, getAllNodes } from "../../store/nodes.ts";
import { getEdgesTo, getAllEdges } from "../../store/edges.ts";

export const impactToolDef = {
  name: "nodex_impact_map",
  description: "Show what breaks if you change this node — direct and indirect dependents",
  inputSchema: {
    type: "object" as const,
    properties: {
      node_id: { type: "string", description: "Node ID (e.g. src/auth/auth.service.ts::login)" },
    },
    required: ["node_id"],
  },
};

export function impactTool(input: unknown) {
  const { node_id } = z.object({ node_id: z.string() }).parse(input);

  const node = getNode(node_id);
  if (!node) return { error: `Node not found: ${node_id}` };

  // Direct dependents: nodes that have edges pointing TO this node
  const directEdges = getEdgesTo(node_id);
  const directIds = new Set(directEdges.map(e => e.from_id));

  // Indirect: find nodes that depend on direct dependents (1 more hop)
  const allEdges = getAllEdges();
  const indirectIds = new Set<string>();
  for (const id of directIds) {
    const incoming = allEdges.filter(e => e.to_id === id);
    for (const edge of incoming) {
      if (!directIds.has(edge.from_id) && edge.from_id !== node_id) {
        indirectIds.add(edge.from_id);
      }
    }
  }

  const allNodes = getAllNodes();
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  const direct = [...directIds].map(id => nodeMap.get(id)).filter(Boolean);
  const indirect = [...indirectIds].map(id => nodeMap.get(id)).filter(Boolean);

  // Risk: high if >5 direct, medium if >2, low otherwise
  const risk = direct.length > 5 ? "high" : direct.length > 2 ? "medium" : "low";

  return { direct, indirect, risk };
}

import { z } from "zod";
import { getNode } from "../../store/nodes.ts";
import { addMeta } from "../../store/meta.ts";

export const decisionToolDef = {
  name: "nodex_add_decision",
  description: "Record an architectural decision or gotcha about a node for future AI context",
  inputSchema: {
    type: "object" as const,
    properties: {
      node_id: { type: "string", description: "Node ID" },
      decision: { type: "string", description: "The decision or gotcha to record" },
      type: { type: "string", enum: ["ai_decision", "gotcha", "why", "todo_debt", "failed_approach"], description: "Type of note (default: ai_decision)" },
    },
    required: ["node_id", "decision"],
  },
};

export function decisionTool(input: unknown) {
  const { node_id, decision, type } = z.object({
    node_id: z.string(),
    decision: z.string(),
    type: z.enum(["ai_decision", "gotcha", "why", "todo_debt", "failed_approach"]).optional().default("ai_decision"),
  }).parse(input);

  const node = getNode(node_id);
  if (!node) return { success: false, error: `Node not found: ${node_id}` };

  addMeta({ node_id, key: type, value: decision, created: Math.floor(Date.now() / 1000) });
  return { success: true, node_id, key: type };
}

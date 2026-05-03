import { getProject } from "../../store/meta.ts";
import { getDB } from "../../store/db.ts";

export const conventionsToolDef = {
  name: "nodex_get_conventions",
  description: "Get project conventions, naming patterns, and recorded AI decisions",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export function conventionsTool(_input: unknown) {
  const db = getDB();
  const decisions = db.query(
    "SELECT m.value, n.file FROM meta m JOIN nodes n ON m.node_id = n.id WHERE m.key = 'ai_decision' ORDER BY m.created DESC LIMIT 20"
  ).all() as Array<{ value: string; file: string }>;

  const gotchas = db.query(
    "SELECT m.value, n.file FROM meta m JOIN nodes n ON m.node_id = n.id WHERE m.key = 'gotcha' ORDER BY m.created DESC LIMIT 10"
  ).all() as Array<{ value: string; file: string }>;

  return {
    root_path: getProject("root_path") ?? "",
    ai_decisions: decisions,
    gotchas,
  };
}

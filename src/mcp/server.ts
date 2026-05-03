import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { initDB } from "../store/db.ts";
import { searchToolDef, searchTool } from "./tools/search.ts";
import { contextToolDef, contextTool } from "./tools/context.ts";
import { impactToolDef, impactTool } from "./tools/impact.ts";
import { conventionsToolDef, conventionsTool } from "./tools/conventions.ts";
import { updateToolDef, updateTool } from "./tools/update.ts";
import { decisionToolDef, decisionTool } from "./tools/decision.ts";

const TOOLS = [
  searchToolDef,
  contextToolDef,
  impactToolDef,
  conventionsToolDef,
  updateToolDef,
  decisionToolDef,
];

async function main() {
  const projectRoot = process.env.CODEX_PROJECT ?? process.cwd();
  initDB(projectRoot);

  const server = new Server(
    { name: "codex", version: "0.3.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;
      switch (name) {
        case "codex_search":      result = searchTool(args); break;
        case "codex_get_context": result = contextTool(args); break;
        case "codex_impact_map":  result = impactTool(args); break;
        case "codex_get_conventions": result = conventionsTool(args); break;
        case "codex_update_file": result = await updateTool(args); break;
        case "codex_add_decision": result = decisionTool(args); break;
        default: throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[codex-mcp] Server running. Project:", projectRoot);
}

main().catch(err => {
  console.error("[codex-mcp] Fatal:", err);
  process.exit(1);
});

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
  const projectRoot = process.env.NODEX_PROJECT ?? process.cwd();
  initDB(projectRoot);

  const server = new Server(
    { name: "nodex", version: "0.3.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  const envDisabled = process.env.NODEX_DISABLED === "1";

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Read bench mode from DB (set by `nodex bench on/off`)
    const { getProject } = await import("../store/meta.ts");
    const benchSession = getProject("bench_session") ?? null;
    const benchMode = getProject("bench_mode") ?? null; // "on" | "off" | null

    const isDisabled = envDisabled || benchMode === "off";

    const t0 = Date.now();
    let result: unknown;

    if (isDisabled) {
      result = {
        bench_mode: "off",
        disabled: true,
        message: "Nodex in baseline mode — no index data returned. Claude must use native file reads.",
      };
    } else {
      try {
        switch (name) {
          case "nodex_search":          result = searchTool(args); break;
          case "nodex_get_context":     result = await contextTool(args); break;
          case "nodex_impact_map":      result = impactTool(args); break;
          case "nodex_get_conventions": result = conventionsTool(args); break;
          case "nodex_update_file":     result = await updateTool(args); break;
          case "nodex_add_decision":    result = decisionTool(args); break;
          default: throw new Error(`Unknown tool: ${name}`);
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    }

    const latencyMs = Date.now() - t0;
    const file = (args as Record<string, unknown>)?.file as string | undefined;
    const autoReindexed = (result as Record<string, unknown>)?.auto_reindexed ? 1 : 0;
    try {
      const { getDB } = await import("../store/db.ts");
      getDB().run(
        "INSERT INTO query_log (ts, tool, file, latency_ms, auto_reindexed, bench_session, bench_mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [Math.floor(Date.now() / 1000), name, file ?? null, latencyMs, autoReindexed, benchSession, benchMode ?? "on"]
      );
    } catch { /* logging must never break tool calls */ }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[nodex-mcp] Server running. Project:", projectRoot);
}

main().catch(err => {
  console.error("[nodex-mcp] Fatal:", err);
  process.exit(1);
});

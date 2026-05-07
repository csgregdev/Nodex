#!/usr/bin/env bun
import { argv } from "process";

const command = argv[2];
const args = argv.slice(3);

switch (command) {
  case "init": {
    const { runInit } = await import("./init.ts");
    await runInit(args);
    break;
  }
  case "reindex": {
    const { runReindex } = await import("./reindex.ts");
    await runReindex(args);
    break;
  }
  case "search": {
    const { runSearch } = await import("./search.ts");
    await runSearch(args);
    break;
  }
  case "summarize": {
    const { runSummarize } = await import("./summarize.ts");
    await runSummarize(args);
    break;
  }
  case "watch": {
    const { runWatch } = await import("./watch.ts");
    await runWatch(args);
    break;
  }
  case "sync": {
    const { runSync } = await import("./sync.ts");
    await runSync(args);
    break;
  }
  case "status": {
    const { runStatus } = await import("./status.ts");
    await runStatus(args);
    break;
  }
  case "focus": {
    const { runFocus } = await import("./focus.ts");
    await runFocus(args);
    break;
  }
  case "decision": {
    const { runDecision } = await import("./decision.ts");
    await runDecision(args);
    break;
  }
  case "tokens": {
    const { runTokens } = await import("./tokens.ts");
    await runTokens(args);
    break;
  }
  case "mcp": {
    await import("../mcp/server.ts");
    break;
  }
  case "ui": {
    const { runUI } = await import("./ui.ts");
    await runUI(args);
    break;
  }
  default:
    console.log(`Nodex - Live codebase knowledge graph

Usage:
  nodex init [--enrich]   Index current project (--enrich adds AI summaries)
  nodex reindex           Full reindex
  nodex search <query>    Search the index
  nodex summarize         AI summaries for all modules
  nodex watch             Auto-update on file changes
  nodex sync [--enrich]   Git diff based incremental update
  nodex status            Show AI knowledge freshness (stale/fresh/unknown)
  nodex focus <path|query> Priority AI enrichment for a path or intent
  nodex decision          Manage architectural decisions
  nodex tokens            Token usage + cost report
  nodex mcp               Start MCP server (for Claude Code / AI tools)
  nodex ui                Visual graph UI (http://localhost:3456)

Supported languages:
  TypeScript, JavaScript (Next.js, React, Vue, Astro)
  Python (Django, FastAPI, Flask)
  Go
  Dart (Flutter)
  Astro
  Rust, Java, Kotlin, Swift, Ruby, PHP
`);
}

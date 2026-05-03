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
  nodex init              Index current project
  nodex reindex           Full reindex
  nodex search <query>    Search the index
  nodex summarize          AI summaries for all modules
  nodex watch             Auto-update on file changes
  nodex sync              Git diff based incremental update
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

# Nodex

Live, graph-based codebase knowledge base for CLI developers and AI tools.

Reads your project → builds a node/edge graph → saves to SQLite → accessible via MCP server and visual UI.

## What it does

- Indexes your codebase and builds a live knowledge graph
- Tracks what each module does, who calls it, what depends on it, and why it was written that way
- Exposes context to AI tools (Claude Code, any MCP-compatible client)
- Visualizes the project graph in a web UI
- Auto-updates when code changes

## Setup

```bash
bun install
```

Set your Anthropic API key (used for AI summaries):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
# Index a project
bun src/cli/main.ts init /path/to/your/project

# Start the visual UI
bun src/cli/main.ts ui

# Search symbols in terminal
bun src/cli/main.ts search <query>

# Watch for file changes and auto-reindex
bun src/cli/main.ts watch

# Sync changes from git diff
bun src/cli/main.ts sync

# Run AI summarization batch
bun src/cli/main.ts summarize

# Full reindex (drop + rebuild)
bun src/cli/main.ts reindex
```

The UI runs on `http://localhost:3456` by default.

## MCP Server (Claude Code integration)

Add to your Claude Code MCP config:

```json
{
  "mcpServers": {
    "nodex": {
      "command": "bun",
      "args": ["run", "/path/to/nodex/src/mcp/server.ts"],
      "env": {
        "NODEX_PROJECT": "/path/to/your/project"
      }
    }
  }
}
```

### Available MCP tools

| Tool | Description |
|------|-------------|
| `nodex_search(query)` | Symbol search |
| `nodex_get_context(file)` | All nodes/edges/meta for a file |
| `nodex_impact_map(node_id)` | What breaks if this changes |
| `nodex_get_conventions()` | AI decisions and gotchas |
| `nodex_update_file(file)` | Reindex a file after edits |
| `nodex_add_decision(node_id, decision)` | Record an architectural decision |

## Architecture

```
src/
├── indexer/        # file traversal + AST parsing + graph building
│   ├── walker.ts       # gitignore-aware async fs walker
│   ├── parser.ts       # tree-sitter (TS/JS/Python/Go) + regex fallback
│   ├── graph.ts        # parsed file → SQLite nodes/edges
│   ├── differ.ts       # SHA-256 hash-based change detection
│   └── languages/      # 13 language configs + framework hint detection
├── store/          # SQLite CRUD (bun:sqlite)
├── summarizer/     # Claude AI layer (Haiku, 3 concurrent, hash-cached)
├── watcher/        # chokidar + 500ms debounce + auto-reindex
├── mcp/            # MCP stdio server + 6 tools
├── api/            # Hono HTTP API (5 endpoints) + Bun.serve() SPA
└── cli/            # CLI dispatcher + subcommands

ui/
└── src/
    ├── App.tsx
    ├── components/
    │   ├── Graph.tsx       # @xyflow/react graph, file-based layout
    │   ├── NodePanel.tsx   # right panel: token, summary, gotchas, impact
    │   ├── SearchBar.tsx   # debounced FTS search
    │   └── StatsBar.tsx    # file/symbol/edge stats
    └── styles/globals.css
```

## Supported languages

TypeScript, JavaScript, Python, Go, Dart/Flutter, Astro, Rust, Java, Kotlin, Ruby, PHP

Framework detection: Next.js, Flutter, Rails, Spring, Android

## Data model

- **nodes** — `id = "file::symbolName"`, type, name, file, line, language, token, summary, complexity, hash
- **edges** — from_id, to_id, relationship (`calls | imports | extends | implements`)
- **meta** — node_id, key (`gotcha | ai_decision | why | todo_debt`), value
- **project** — key/value store (root_path, last_sync)

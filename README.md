# Nodex

Live, graph-based codebase knowledge store for CLI developers and AI tools.

Reads your project → builds a node/edge graph → stores in SQLite → queryable via MCP server, CLI, and a visual graph UI.

---

## What it does

Nodex indexes your codebase into a structured graph where every file, function, class, and interface is a **node**, and every import, call, inheritance, and co-change relationship is an **edge**. On top of the structural graph, it layers AI-generated summaries, gotchas, and architectural decisions — and tracks whether that AI knowledge is still fresh or has gone stale as your code evolves.

The result: your AI assistant (Claude Code, Cursor, etc.) gets a compact, accurate picture of your codebase instead of reading raw source files. You get a visual map of where complexity lives, which files change together, and what architectural decisions were made.

---

## Features

### Structural indexing
- Parses 13 languages using tree-sitter (TypeScript, JavaScript, Python, Go) and regex (Dart, Rust, Java, Kotlin, Ruby, PHP, Astro)
- Extracts functions, classes, interfaces, and module-level exports
- Detects framework context: Next.js, Flutter, Django, FastAPI, Spring, Rails, Angular
- Respects `.gitignore` — won't index `node_modules`, `dist`, etc.
- SHA-256 hash-based change detection — skips unchanged files on re-index

### AI enrichment (optional, async)
- Per-file AI summaries via Claude Haiku — one API call per file, not per function (10× cheaper)
- Rate-limited queue (configurable req/min, default 10)
- Priority queue: complex files enriched first
- Three-state freshness tracking per file: `fresh` / `stale` / `unknown`
- Stale detection: structural hash tracked separately from AI-seen hash — watcher marks files stale on change without calling AI

### Git intelligence (no AI required)
- **Co-change analysis**: finds files that regularly change together in the same commit but have no import relationship — hidden coupling your AST can't see
- **Hotspot score**: `churn × complexity` per file, normalized 0–1 — shows where bugs live
- **Decision mining**: scans inline `WHY:` / `DECISION:` / `TRADEOFF:` / `FAILED:` markers + git commit messages for architectural decisions

### MCP server
6 tools for AI assistants:
- `nodex_search(query)` — full-text search across all symbols
- `nodex_get_context(file)` — all nodes, edges, meta, co-changes, hotspot score for a file; triggers lazy AI enrichment if summary is missing
- `nodex_impact_map(node_id)` — what breaks if you change this node (direct + indirect dependents, risk level)
- `nodex_get_conventions()` — project-wide AI decisions and gotchas
- `nodex_update_file(file)` — re-index a file after modification
- `nodex_add_decision(node_id, decision)` — record an architectural decision

### Token usage tracking
- Logs input/output tokens per operation (enrich, focus, mcp_lazy) to SQLite
- Cost estimation using Anthropic pricing
- `nodex tokens` CLI report: total, by operation, by file

### Visual graph UI
- React + React Flow graph at `http://localhost:3456`
- Symbol-level and file-tree views
- Node color/border reflects AI status: grey = unknown, orange border = stale, red = hotspot
- Co-change edges rendered as dashed orange lines with co-commit count
- Hotspot score shown as 🔥 badge and border thickness
- Right-click context menu: Enrich now / Enrich module / Mark stale
- NodePanel: AI knowledge status, "Enrich now" button, hidden coupling section, decision history with staleness warning
- Impact map overlay, neighborhood view, dagre layout (LR/TB)

---

## Installation

**Requirements:** [Bun](https://bun.sh) ≥ 1.1, Git

```bash
git clone https://github.com/your-org/nodex
cd nodex
bun install
```

Make the CLI available globally:

```bash
# Option A: bun link
bun link

# Option B: direct path alias
alias nodex="bun /path/to/nodex/src/cli/main.ts"
```

---

## Quick start

```bash
cd your-project

# 1. Structural index (fast, no API key needed)
nodex init

# 2. Open the visual graph
nodex ui

# 3. Check what needs AI enrichment
nodex status

# 4. Enrich a specific area (needs ANTHROPIC_API_KEY)
nodex focus src/auth/

# 5. Full enrichment in background
nodex sync --enrich
```

---

## CLI reference

### `nodex init [--enrich]`

Index the current directory. Builds the full graph, computes hotspot scores, runs co-change analysis, and scans inline decision markers.

`--enrich` — after structural indexing, run AI enrichment on all files (rate-limited, blocks until done).

```bash
nodex init
nodex init --enrich
```

### `nodex status`

Shows AI knowledge freshness across the project:

```
🔴 STALE - AI hasn't seen these changes:
   src/auth/auth.service.ts          → changed 3 days ago
   src/payment/stripe.ts             → changed 1 week ago

🟡 OLD knowledge (>30 days):
   src/user/user.repo.ts             → indexed 45 days ago

🟢 FRESH: 47 files

🔥 Top hotspot files:
   src/payment/stripe.ts             score: 82%  commits: 23

→ 3 files need enrichment. Run: nodex sync --enrich
```

### `nodex focus <target>`

Priority AI enrichment — runs immediately, not through the background queue.

```bash
# By path (directory or file)
nodex focus src/auth/
nodex focus src/auth/auth.service.ts

# By symbol
nodex focus src/auth/auth.service.ts::login

# By intent (FTS search → finds relevant modules → enriches stale ones)
nodex focus "auth login flow"
nodex focus "how does payment work"
```

Shows per-file progress with gotcha counts and a token/cost summary at the end.

### `nodex sync [--enrich]`

Re-indexes files changed since the last git commit. `--enrich` also enriches all stale and unknown files.

```bash
nodex sync
nodex sync --enrich
```

### `nodex watch`

Starts a file watcher (chokidar, 500ms debounce). On file change: re-runs tree-sitter, updates `current_hash`, marks file stale. Does **not** call AI automatically.

```bash
nodex watch
```

### `nodex search <query>`

Full-text search across all indexed symbols.

```bash
nodex search "handleLogin"
nodex search "stripe webhook"
```

### `nodex decision`

Manage architectural decisions.

```bash
nodex decision list                        # all decisions
nodex decision list --file src/auth/...    # decisions for a file
nodex decision add --file src/auth/auth.service.ts --key decision "Chose JWT over sessions — stateless required for k8s"
nodex decision health                      # stale decisions (file changed since decision was recorded)
nodex decision mine                        # extract decisions from git commit history
nodex decision mine 500                    # last 500 commits
```

Inline decision markers are picked up automatically during `nodex init`:

```typescript
// WHY: Using JWT — stateless auth required for horizontal scaling
// DECISION: All external calls wrapped in CircuitBreaker after Q3 outages
// TRADEOFF: Accepted eventual consistency in prefs for write throughput
// FAILED: Tried Redis pub/sub first, dropped due to ordering guarantees
```

### `nodex tokens`

Token usage and cost report.

```bash
nodex tokens                      # total usage, all time
nodex tokens --by-file            # top 20 most expensive files
nodex tokens --since=7d           # last 7 days (supports h/d/w)
nodex tokens --by-file --since=1w
```

Example output:

```
Nodex Token Usage (last 7d)
────────────────────────────────────────────────────
  Total calls:   42
  Input tokens:  128.3k
  Output tokens: 21.7k
  Total tokens:  150.0k
  Estimated cost: $0.189

  By operation:
    enrich               98.4k tokens  $0.146  (35 calls)
    focus                31.2k tokens  $0.039   (6 calls)
    mcp_lazy              4.1k tokens  $0.005   (1 call)
```

### `nodex reindex`

Drops and rebuilds the entire index from scratch.

### `nodex mcp`

Starts the MCP stdio server. Used by Claude Code and other MCP-compatible tools.

### `nodex ui`

Opens the visual graph UI at `http://localhost:3456`.

---

## MCP setup (Claude Code)

Add to your Claude Code MCP config (`.claude/mcp.json` or settings):

```json
{
  "mcpServers": {
    "nodex": {
      "command": "bun",
      "args": ["run", "/path/to/nodex/src/mcp/server.ts"],
      "env": {
        "NODEX_PROJECT": "/path/to/your/project",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Then in your project's `CLAUDE.md`:

```markdown
## Nodex Index
This project is indexed by Nodex. After every file modification, call:
nodex_update_file({ file: "path/to/modified/file.ts" })

Key tools:
- nodex_search(query) — find functions, modules, classes
- nodex_get_context(file) — full context for a file (triggers lazy AI enrichment if needed)
- nodex_impact_map(node_id) — what breaks if you change this
- nodex_add_decision(node_id, decision) — record architectural decisions
```

---

## Data model

### `nodes` table

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT | `"file::symbolName"` (e.g. `src/auth/auth.service.ts::login`) |
| `type` | TEXT | `fn`, `class`, `interface`, `module`, `widget` |
| `name` | TEXT | Symbol name (`__module__` for file-level node) |
| `file` | TEXT | Relative file path |
| `line` | INTEGER | Line number |
| `language` | TEXT | Detected language |
| `token` | TEXT | Caveman format — mechanically derived from AST |
| `summary` | TEXT | AI-generated summary (NULL = never enriched) |
| `complexity` | INTEGER | Cyclomatic complexity |
| `hash` | TEXT | File hash when AI last ran — staleness baseline |
| `current_hash` | TEXT | File hash after last tree-sitter parse — always current |
| `last_parsed` | INTEGER | Unix timestamp of last tree-sitter parse |
| `last_ai` | INTEGER | Unix timestamp of last AI enrichment |
| `hotspot_score` | REAL | 0.0–1.0 churn × complexity (module nodes only) |
| `commit_count` | INTEGER | Git commits in last 90 days |

**AI freshness states:**

| State | Condition |
|-------|-----------|
| `fresh` | `hash == current_hash` AND `last_ai NOT NULL` |
| `stale` | `hash != current_hash` AND `last_ai NOT NULL` |
| `unknown` | `last_ai IS NULL` |

### `edges` table

| Field | Type | Description |
|-------|------|-------------|
| `from_id` | TEXT | Source node ID |
| `to_id` | TEXT | Target node ID |
| `relationship` | TEXT | `calls`, `imports`, `extends`, `implements`, `co_changes` |
| `weight` | INTEGER | Co-commit count (co_changes edges only) |

### `meta` table

Key/value store attached to nodes. Keys: `gotcha`, `ai_decision`, `why`, `decision`, `tradeoff`, `failed_approach`, `git_decision`.

### `token_usage` table

| Field | Type | Description |
|-------|------|-------------|
| `operation` | TEXT | `enrich`, `focus`, `mcp_lazy` |
| `file` | TEXT | Which file was processed |
| `input_tokens` | INTEGER | API input tokens |
| `output_tokens` | INTEGER | API output tokens |
| `model` | TEXT | Model ID used |
| `created` | INTEGER | Unix timestamp |

---

## Token format (caveman)

The `token` field is a compact, AI-free representation of each symbol, derived mechanically from AST data:

```
fn:        name(param,param)→returnType
class:     ClassName|extends:Base|impl:IFace
interface: IName
module:    [file.ts]|fw:nextjs|exports:A,B,C
```

This format is designed to pack maximum structural information into minimum tokens when passed to an LLM.

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Required for AI enrichment (`nodex init --enrich`, `nodex focus`, `nodex sync --enrich`) |
| `NODEX_PROJECT` | Project root for MCP server (defaults to `cwd`) |
| `PORT` | UI server port (default `3456`) |

---

## Architecture

```
src/
├── indexer/
│   ├── walker.ts         gitignore-aware async file traversal
│   ├── parser.ts         tree-sitter (TS/JS/Python/Go) + regex (others)
│   ├── graph.ts          parsed file → SQLite nodes/edges
│   ├── differ.ts         SHA-256 hash-based change detection
│   ├── git.ts            co-change analysis, hotspot scores, ownership
│   ├── decisions.ts      inline marker scan, git commit mining, staleness
│   └── languages/        13 language configs + framework hint detection
├── store/
│   ├── db.ts             DB init, schema, WAL mode, migrations
│   ├── nodes.ts          node CRUD + status helpers (fresh/stale/unknown)
│   ├── edges.ts          edge CRUD
│   ├── meta.ts           meta k/v + project settings
│   └── token_usage.ts    token logging + cost calculation
├── summarizer/
│   ├── ai.ts             Claude Haiku API, returns usage counts
│   ├── cache.ts          hash-based skip logic
│   ├── queue.ts          rate-limited enrichment queue, priority by complexity
│   └── formatter.ts      local caveman token formatter
├── watcher/
│   └── fswatch.ts        chokidar + 500ms debounce, updates current_hash only
├── mcp/
│   ├── server.ts         MCP stdio server
│   └── tools/            search, context (lazy AI), impact, conventions, update, decision
├── api/
│   └── server.ts         Hono HTTP API (12 endpoints) + Bun.serve() SPA
└── cli/
    ├── main.ts            CLI dispatcher
    ├── init.ts            full index + git analysis + decision scan
    ├── reindex.ts         drop + rebuild
    ├── watch.ts           background file watcher
    ├── sync.ts            git diff incremental update + --enrich
    ├── status.ts          AI freshness report + hotspot summary
    ├── focus.ts           priority enrichment (path/symbol/intent)
    ├── decision.ts        decision add/list/health/mine
    ├── tokens.ts          token usage + cost report
    ├── search.ts          terminal search
    └── ui.ts              visual UI launcher

ui/
├── index.html
└── src/
    ├── App.tsx
    └── components/
        ├── Graph.tsx       React Flow graph, AI status colors, co-change edges, context menu
        ├── NodePanel.tsx   AI status section, enrich button, co-change coupling, decisions
        ├── SearchBar.tsx   debounced FTS search
        └── StatsBar.tsx    file/symbol/edge stats
```

---

## Supported languages

| Language | Parser | Frameworks detected |
|----------|--------|---------------------|
| TypeScript | tree-sitter | Next.js, Angular |
| JavaScript | tree-sitter | Next.js |
| Python | tree-sitter | Django, FastAPI, Flask |
| Go | tree-sitter | — |
| Dart | regex | Flutter |
| Astro | regex | Astro |
| Rust | regex | — |
| Java | regex | Spring |
| Kotlin | regex | Android |
| Swift | regex | — |
| Ruby | regex | Rails |
| PHP | regex | — |

---

## License

MIT

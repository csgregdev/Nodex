<p align="center">
  <img src="https://raw.githubusercontent.com/csgregdev/Nodex/main/assets/logo.png" alt="Nodex logo" width="180" />
</p>

<h1 align="center">Nodex</h1>

<p align="center">
  Live, graph-based codebase knowledge store for CLI developers and AI tools.
</p>

<p align="center">
  Index files, symbols, relationships, git history, and AI summaries into a queryable SQLite graph.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@csgregdev/nodex">
    <img src="https://img.shields.io/npm/v/%40csgreg.dev%2Fnodex?color=0f766e&label=npm" alt="npm version" />
  </a>
  <a href="https://bun.sh">
    <img src="https://img.shields.io/badge/runtime-Bun-f7df1e?labelColor=111827&color=f7df1e" alt="Bun runtime" />
  </a>
  <a href="https://github.com/csgregdev/Nodex/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/csgregdev/Nodex?color=1f2937" alt="MIT license" />
  </a>
  <img src="https://img.shields.io/badge/MCP-ready-0ea5e9" alt="MCP ready" />
  <img src="https://img.shields.io/badge/storage-SQLite-2563eb" alt="SQLite storage" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@csgregdev/nodex">npm</a>
  ·
  <a href="https://github.com/csgregdev/Nodex">GitHub</a>
  ·
  <a href="https://github.com/csgregdev/Nodex/issues">Issues</a>
</p>

> **Early-stage:** Fast-moving. Expect rough edges, breaking changes, and incomplete docs. Treat outputs as assistive, not authoritative.

---

## The story

As a developer who works across large, evolving codebases, I kept running into the same wall: AI assistants — no matter how capable — would lose context, misread structure, or confidently suggest changes that broke things elsewhere. Not because the models were bad, but because they had no real map of the codebase. They were navigating blind.

I looked for a tool that could give an AI assistant a live, structural understanding of a project — something that tracked not just files and symbols, but relationships, git history, architectural decisions, and whether its own knowledge was still fresh. I couldn't find one that worked the way I needed.

So I started building Nodex with AI assistance, as a tool to help my own work. It indexes a codebase into a graph, stores it in SQLite, and makes it queryable by both humans (via a visual UI) and AI tools (via MCP). It's what I wished existed when I started.

---

## What it does

```
your project
  └─▶ symbols + imports + calls (tree-sitter)
  └─▶ git churn + co-change signals
  └─▶ AI summaries + decisions (optional)
        └─▶ SQLite knowledge graph
              ├─▶ Visual graph UI   (nodex ui)
              ├─▶ MCP server        (nodex mcp)
              └─▶ CLI tools         (nodex search, focus, status...)
```

Every file, function, class, and interface becomes a **node**. Every import, call, inheritance, and co-change relationship becomes an **edge**. On top of the structural graph, Nodex layers AI summaries and architectural decisions — and tracks whether that knowledge is still fresh or has gone stale as your code evolves.

**Result:** your AI assistant gets a compact, accurate picture of your codebase instead of reading raw source files. You get a visual map of where complexity lives, which files change together, and what decisions were made and why.

---

## Quick start

### 1. Install

```bash
git clone https://github.com/csgregdev/Nodex
cd nodex
bun install
bun link          # makes `nodex` available globally
```

### 2. Index your project

```bash
cd your-project
nodex init
```

This parses all source files, builds the graph, runs git co-change analysis, and stores everything in `.nodex/db.sqlite`. No API key needed.

### 3. Explore the graph

```bash
nodex ui
# → opens http://localhost:3456
```

The visual graph shows every symbol as a node, color-coded by type, with edges for calls, imports, and hidden coupling. You can:

- **Search** for any symbol or file — graph filters to matching nodes instantly
- **Filter by type** — toggle `fn` / `class` / `interface` / `module` / `widget` chips
- **Filter by edge type** — show only `calls`, `imports`, `extends`, etc.
- **Scope to a folder** — type `src/auth/` to see only that subtree
- **Double-click** a node to enter neighborhood view (node + direct connections)
- **Click** a node to open its detail panel: AI summary, decisions, hidden coupling, impact map

### 4. Add AI knowledge (optional)

```bash
export ANTHROPIC_API_KEY=sk-ant-...

nodex focus src/auth/       # enrich a folder
nodex focus "login flow"    # enrich by intent
nodex init --enrich         # enrich everything
```

### 5. Connect to your AI assistant

```bash
nodex mcp
# → starts MCP stdio server, expose it in your AI tool config
```

See [MCP setup](#using-with-ai-tools-mcp) below.

---

## Using with AI tools (MCP)

This is where Nodex really shines. Once connected, your AI assistant can query the knowledge graph directly — searching symbols, checking what breaks if something changes, reading architectural decisions, and keeping the index fresh as files are modified.

### Setup: Claude Code

Add to `.claude/mcp.json` (or Claude Code settings → MCP):

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

### Tell Claude how to use it

Add to your project's `CLAUDE.md`:

```markdown
## Nodex

This project is indexed by Nodex. Use these tools to understand the codebase:

- `nodex_search(query)` — find functions, classes, modules by name or description
- `nodex_get_context(file)` — full structural context for a file: all symbols, edges, decisions, hotspot score
- `nodex_impact_map(node_id)` — what breaks if you change this node (direct + indirect dependents)
- `nodex_get_conventions()` — project-wide architectural decisions and gotchas
- `nodex_add_decision(node_id, decision)` — record an architectural decision after making a significant change
- `nodex_update_file(file)` — re-index a file after modifying it

After every file you modify, call: nodex_update_file({ file: "relative/path/to/file.ts" })
```

### What Claude can now do

| Question | Tool used |
|----------|-----------|
| "What does `AuthService` do?" | `nodex_search("AuthService")` → `nodex_get_context` |
| "What breaks if I change `login()`?" | `nodex_impact_map("src/auth/auth.service.ts::login")` |
| "Are there any gotchas in payments?" | `nodex_get_context("src/payment/stripe.ts")` |
| "What architectural decisions were made?" | `nodex_get_conventions()` |
| "Keep the index updated" | `nodex_update_file(file)` after each edit |

### Setup: Cursor / other MCP clients

Any MCP-compatible client works. Point it at:
```
command: bun run /path/to/nodex/src/mcp/server.ts
env: NODEX_PROJECT=/path/to/your/project
```

---

## Benchmark

Does Nodex actually save tokens? Measured on a real Flutter project (~250 files, ~4k symbols).

**Method:** same 3 questions asked twice — once with Nodex active (`nodex bench on`), once with Nodex returning empty responses so Claude had to read files directly (`nodex bench off`).

```
Questions asked:
  1. "Show me context for EventWidget"
  2. "What breaks if I change UserRepository?"
  3. "Search for auth flow"
```

**Results:**

| | With Nodex | Without Nodex |
|--|--|--|
| Tool calls | 4 (search + context) | 2 (empty — fell back to file reads) |
| Files read by Claude | 0 | 2 (`event_widget.dart` 776 lines, `auth.dart` ~700 lines) |
| Avg tool latency | 3ms | 0ms (MCP overhead only) |
| Est. tokens saved | ~4,400 | — |
| Cache hit (Claude) | 93% | 91% |

**Without Nodex**, Claude read ~1,500 lines of raw source ≈ **~5,000+ tokens of file content** for 2 questions. Nodex returned the same structural information as compact JSON — symbols, imports, co-changes, edges — in a fraction of the context.

> Session time is hard to measure from Nodex's side (it only tracks its own call durations). For precise token counts, run `/cost` in Claude Code after each session and compare.

**Run your own benchmark:**

```bash
nodex bench on    # Nodex active — ask Claude something
nodex bench off   # baseline — same questions
nodex bench report
```

---

## Visual graph UI

Open with `nodex ui` → `http://localhost:3456`

### Node colors

| Type | Color | Icon |
|------|-------|------|
| `fn` — function / method | Cyan | `⌥` |
| `class` — class | Purple | `□` |
| `interface` — interface | Green | `{}` |
| `module` — file-level | Yellow | `⊞` |
| `widget` — Flutter/React component | Orange | `⊡` |
| `type` — type alias | Gray | `#` |

### AI status indicators

| Border | Meaning |
|--------|---------|
| Normal | `fresh` — AI knowledge up to date |
| Orange border | `stale` — file changed since AI last saw it |
| Dimmed | `unknown` — never enriched |
| Cyan pulse | Processing |
| 🔥 badge | Hotspot — high churn + complexity |

### Filters (filter bar below the header)

| Control | What it does |
|---------|-------------|
| Type chips `[fn] [class] ...` | Show/hide nodes by type — click to toggle |
| Edge chips `[calls] [imports] ...` | Show/hide edges by relationship type |
| `scope: src/auth/` input | Limit graph to a folder subtree |
| Reset button | Clear all active filters |

Filters are **hard filters** — matching nodes disappear and the graph re-layouts. A counter shows `142 / 1203 nodes` when active.

### Interactions

| Action | Result |
|--------|--------|
| Click node | Open detail panel (summary, decisions, impact) |
| Double-click node | Neighborhood view — node + direct connections only |
| Right-click node | Context menu: Enrich now / Enrich module / Mark stale |
| Search bar | Filter graph to matching symbols/files |
| `← full graph` button | Exit neighborhood view |

### Views

- **Symbol graph** (default) — every function, class, interface as a node
- **File tree** — one node per file, edges = cross-file relationships

---

## CLI reference

### `nodex init [--enrich]`

Index the current directory. Parses all source files, builds graph, runs git co-change analysis, scans inline decision markers.

`--enrich` — also run AI enrichment on all files after indexing.

```bash
nodex init
nodex init --enrich
```

### `nodex status`

AI knowledge freshness report:

```
🔴 STALE — AI hasn't seen these changes:
   src/auth/auth.service.ts     changed 3 days ago
   src/payment/stripe.ts        changed 1 week ago

🟡 OLD knowledge (>30 days):
   src/user/user.repo.ts        indexed 45 days ago

🟢 FRESH: 47 files

🔥 Top hotspots:
   src/payment/stripe.ts        score: 82%  commits: 23

→ 3 files need enrichment. Run: nodex sync --enrich
```

### `nodex focus <target>`

Priority AI enrichment — runs immediately.

```bash
nodex focus src/auth/                      # folder
nodex focus src/auth/auth.service.ts       # file
nodex focus src/auth/auth.service.ts::login  # symbol
nodex focus "auth login flow"              # intent search
```

### `nodex sync [--enrich]`

Re-indexes files changed since last git commit. `--enrich` also enriches stale files.

### `nodex watch`

File watcher (chokidar, 500ms debounce). Updates structural index on change, marks files stale. Does not call AI automatically.

### `nodex search <query>`

Full-text search across all symbols.

```bash
nodex search "handleLogin"
nodex search "stripe webhook"
```

### `nodex decision`

```bash
nodex decision list                             # all decisions
nodex decision list --file src/auth/...         # by file
nodex decision add --file src/auth/auth.service.ts \
  --key decision "Chose JWT — stateless for k8s"
nodex decision health                           # stale decisions
nodex decision mine                             # extract from git history
```

Inline markers picked up automatically during `nodex init`:

```typescript
// WHY: JWT — stateless auth required for horizontal scaling
// DECISION: All external calls wrapped in CircuitBreaker after Q3 outage
// TRADEOFF: Eventual consistency in prefs for write throughput
// FAILED: Tried Redis pub/sub first — ordering guarantees were a problem
```

### `nodex tokens`

Token usage report.

```bash
nodex tokens
nodex tokens --by-file
nodex tokens --since=7d
```

### `nodex stats`

MCP session summary — tool calls, latency, estimated token savings.

```bash
nodex stats               # last 2 hours
nodex stats --hours=8     # last 8 hours
nodex stats --all         # all time
```

### `nodex bench on|off|report|run`

Measure Claude's speed and token usage with vs without Nodex.

```bash
# Manual A/B test (interactive)
nodex bench on      # start WITH-Nodex session — Nodex active, logging
nodex bench off     # start baseline session — Nodex returns empty, Claude reads files
nodex bench report  # compare last on vs off session
nodex bench reset   # clear bench mode

# Automated A/B test (non-interactive)
nodex bench run                    # run predefined test cases
nodex bench run my_cases.json      # run custom test cases
```

`nodex bench run` uses `claude -p --output-format json` to run each test case twice — once with Nodex active, once with Nodex disabled — and captures exact token counts, costs, and timings from Claude's JSON output. Results saved to `.nodex/bench_report.json`.

Custom test cases format:

```json
[
  { "id": "context_widget", "question": "Show me context for EventWidget", "category": "context" },
  { "id": "impact_auth", "question": "What breaks if I refactor AuthRepository?", "category": "impact" }
]
```

### `nodex reindex`

Drop and rebuild the entire index from scratch.

### `nodex ui`

Open visual graph at `http://localhost:3456`.

### `nodex mcp`

Start MCP stdio server (used by Claude Code and other MCP clients).

---

## Features

### Structural indexing
- 13 languages: tree-sitter (TypeScript, JavaScript, Python, Go) + regex (Dart, Rust, Java, Kotlin, Ruby, PHP, Astro, Swift)
- Extracts functions, classes, interfaces, module-level exports
- Framework detection: Next.js, Flutter, Django, FastAPI, Spring, Rails, Angular
- Respects `.gitignore`
- SHA-256 hash-based change detection — skips unchanged files

### AI enrichment (optional)
- Per-file summaries via Claude Haiku — one API call per file, not per function
- Rate-limited queue (configurable req/min)
- Priority: complex files enriched first
- Three-state freshness: `fresh` / `stale` / `unknown`

### Git intelligence (no AI needed)
- **Co-change analysis** — files that change together in commits but have no import relationship (hidden coupling)
- **Hotspot score** — churn × complexity, normalized 0–1
- **Decision mining** — inline markers + git commit message scanning

### MCP server (6 tools)
- `nodex_search` — full-text symbol search; results include `dependent_count`, `hotspot_score`, and `warnings`
- `nodex_get_context` — returns an enrich-free **digest** (purpose, exported API, used_by, warnings, change_risk, read_these_too) plus all nodes, edges, meta. Auto-reindexes stale files. Lazy AI enrichment if API key is set.
- `nodex_impact_map` — direct + indirect dependents, risk level
- `nodex_get_conventions` — project-wide decisions and gotchas
- `nodex_update_file` — re-index a file after modification
- `nodex_add_decision` — record an architectural decision

---

## Data model

### nodes

| Field | Description |
|-------|-------------|
| `id` | `"file::symbolName"` |
| `type` | `fn`, `class`, `interface`, `module`, `widget`, `type` |
| `token` | Compact caveman format (AI-free, AST-derived) |
| `summary` | AI summary (NULL = never enriched) |
| `hash` | File hash when AI last ran |
| `current_hash` | File hash after last parse |
| `hotspot_score` | 0–1 churn × complexity |

### edges

| relationship | Meaning |
|-------------|---------|
| `calls` | Function/method calls |
| `imports` | Module imports |
| `extends` | Class inheritance |
| `implements` | Interface implementation |
| `co_changes` | Files that change together in git |

### Token format (caveman)

Compact representation packed into minimum tokens for LLM context:

```
fn:        name(param,param)→returnType
class:     ClassName|extends:Base|impl:IFace
interface: IName
module:    [file.ts]|fw:nextjs|exports:A,B,C
```

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Required for AI enrichment |
| `NODEX_PROJECT` | Project root for MCP server (defaults to cwd) |
| `PORT` | UI server port (default `3456`) |
| `NODEX_DISABLED` | Set to `1` to disable all MCP tool responses (baseline benchmarking) |

---

## Supported languages

| Language | Parser | Frameworks |
|----------|--------|------------|
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

## Architecture

```
src/
├── indexer/
│   ├── walker.ts         gitignore-aware file traversal
│   ├── parser.ts         tree-sitter + regex parsers
│   ├── graph.ts          parsed file → SQLite nodes/edges
│   ├── differ.ts         SHA-256 change detection
│   ├── git.ts            co-change analysis, hotspot scores
│   ├── decisions.ts      inline marker scan + git commit mining
│   └── languages/        13 language configs
├── store/
│   ├── db.ts             SQLite init, schema, WAL mode
│   ├── nodes.ts          node CRUD + freshness helpers
│   ├── edges.ts          edge CRUD
│   ├── meta.ts           meta k/v + project settings
│   └── token_usage.ts    token logging + cost calculation
├── summarizer/
│   ├── ai.ts             Claude Haiku API
│   ├── cache.ts          hash-based skip logic
│   ├── queue.ts          rate-limited enrichment queue
│   └── formatter.ts      caveman token formatter
├── watcher/
│   └── fswatch.ts        chokidar + 500ms debounce
├── mcp/
│   ├── server.ts         MCP stdio server
│   └── tools/            6 tools
├── api/
│   └── server.ts         Hono HTTP API + Bun.serve() SPA
└── cli/
    ├── main.ts            dispatcher
    ├── init.ts            full index + git + decisions
    ├── sync.ts            git diff incremental update
    ├── status.ts          freshness report
    ├── focus.ts           priority enrichment
    ├── decision.ts        decision management
    ├── tokens.ts          token usage report
    └── ui.ts              UI launcher

ui/
└── src/
    ├── App.tsx             filter state, layout
    └── components/
        ├── Graph.tsx       React Flow graph + physics layout + filter engine
        ├── FilterBar.tsx   type/edge/scope filter chips
        ├── NodePanel.tsx   AI status, decisions, coupling, impact
        ├── SearchBar.tsx   debounced FTS search
        └── StatsBar.tsx    file/symbol/edge counts
```

---

## License

MIT. See [LICENSE](LICENSE).

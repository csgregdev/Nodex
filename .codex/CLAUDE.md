## Codex Index
This project uses Codex for live codebase indexing.

After every file modification, call:
```
codex_update_file({ file: "path/to/modified/file.ts" })
```

Available MCP tools:
- `codex_search(query)` — find functions, modules, classes
- `codex_get_context(file)` — full context for a file
- `codex_impact_map(node_id)` — what breaks if you change this
- `codex_add_decision(node_id, decision)` — record architectural decisions
- `codex_get_conventions()` — project conventions and AI decisions

Current project summary: .codex/context.md

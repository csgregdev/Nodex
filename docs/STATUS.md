# Nodex — Fejlesztési Státusz

Utoljára frissítve: 2026-05-03

---

## Verzió Áttekintés

| Verzió | Státusz | Mit tartalmaz |
|--------|---------|---------------|
| v0.1 | ✅ KÉSZ | Core index: walker, parser, SQLite, CLI init/reindex/search |
| v0.2 | ✅ KÉSZ | AI réteg: Claude Haiku summaries, caveman token, cache |
| v0.3 | ✅ KÉSZ | Live watch + MCP server (6 tool) |
| v0.4 | ✅ KÉSZ | Vizuális UI: react-flow gráf, NodePanel, search, shadcn |
| v0.5 | ✅ KÉSZ | Extended parser: Python/Go tree-sitter, Rust/Java/Kotlin/Ruby/PHP |
| v1.0 | 🔲 TODO | Polish: share, VS Code ext, dead code, TODO debt map |

---

## v0.1 — Core Index ✅

- [x] Bun + TypeScript projekt setup
- [x] `src/indexer/walker.ts` — async fs bejáró, gitignore tisztelet, 13+ nyelv detekció
- [x] `src/indexer/parser.ts` — multi-language parser
- [x] `src/indexer/graph.ts` — ParsedFile → SQLite nodes/edges
- [x] `src/indexer/differ.ts` — SHA-256 file hash
- [x] `src/store/db.ts` — SQLite séma (nodes, edges, meta, project), WAL mode
- [x] `src/store/nodes.ts` — CRUD + LIKE alapú FTS search
- [x] `src/store/edges.ts` — CRUD
- [x] `src/store/meta.ts` — CRUD + project k/v
- [x] `src/cli/main.ts` — CLI dispatcher
- [x] `nodex init` — teljes indexelés, context.md generálás
- [x] `nodex reindex` — DB törlés + újraindexelés
- [x] `nodex search <query>` — terminál keresés

**Eredmény:** `nodex init` indexel ~36 fájlt, ~113 szimbólumot (saját magán tesztelve)

---

## v0.2 — AI Réteg ✅

- [x] `src/summarizer/ai.ts` — Claude Haiku (claude-haiku-4-5-20251001), batch 3 concurrent, 500ms delay
- [x] `src/summarizer/cache.ts` — hash alapú skip (last_ai + hash összehasonlítás)
- [x] `src/summarizer/formatter.ts` — local token formázó (calls/usedBy edge info)
- [x] `src/cli/summarize.ts` — `nodex summarize` parancs
- [x] context.md frissítés AI adatokkal (summary + gotchák)
- [x] meta táblába gotchák + ai_decisions mentése

**Használat:**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
bun src/cli/main.ts summarize
```

---

## v0.3 — Live Watch + MCP ✅

- [x] `src/watcher/fswatch.ts` — chokidar v5, 500ms debounce, hash check, optional AI re-summarize
- [x] `src/cli/watch.ts` — `nodex watch`
- [x] `src/cli/sync.ts` — `nodex sync` (git diff --name-only alapú)
- [x] `src/mcp/server.ts` — MCP stdio server (@modelcontextprotocol/sdk v1.29)
- [x] `nodex_search` — szimbólum keresés
- [x] `nodex_get_context` — fájl összes node/edge/meta
- [x] `nodex_impact_map` — direkt + indirekt hatás, risk: low/medium/high
- [x] `nodex_get_conventions` — AI döntések + gotchák listája
- [x] `nodex_update_file` — fájl újraindexelése (AI hívja módosítás után)
- [x] `nodex_add_decision` — döntés/gotcha rögzítése
- [x] `.nodex/CLAUDE.md` — MCP tool usage sablon generálás (nodex init futtatásakor)

---

## v0.4 — Vizuális UI ✅

- [x] `src/api/server.ts` — Hono HTTP API + Bun.serve() SPA
  - `GET /api/graph` — teljes gráf react-flow formátumban
  - `GET /api/node/:id` — node + meta + edges
  - `GET /api/search?q=` — FTS keresés
  - `GET /api/impact/:id` — impact map
  - `GET /api/stats` — statisztikák
- [x] `src/cli/ui.ts` — `nodex ui` (port 3456, auto browser open)
- [x] `ui/` — React SPA (Bun HTML imports, automatikus bundling)
- [x] `Graph.tsx` — @xyflow/react, file-alapú auto layout, impact highlight
- [x] `NodePanel.tsx` — token (copy), summary, gotchák, edges, impact gomb
- [x] `SearchBar.tsx` — debounced FTS, gráf dimming
- [x] `StatsBar.tsx` — live stats
- [x] **shadcn/ui integráció** — Button, Badge, Input, ScrollArea, Separator, Tooltip, Card, Sheet
- [x] Tailwind CSS dark téma (CSS változók: `--primary`=cyan, `--background`=dark)
- [x] Terminal blueprint esztétika: dot grid bg, JetBrains Mono, node type glow colors

---

## v0.5 — Extended Parsers ✅

### Tree-sitter AST (pontos, gyors)
- [x] TypeScript / TSX — tree-sitter-typescript
- [x] JavaScript / JSX — tree-sitter-javascript
- [x] Python — tree-sitter-python (+ regex fallback)
- [x] Go — tree-sitter-go (+ regex fallback, method receiver kezelés)

### Regex alapú (production-ready)
- [x] Dart / Flutter — widget detekció (StatefulWidget/StatelessWidget/HookWidget/ConsumerWidget), class methods
- [x] Astro — frontmatter script extraction → TS parse
- [x] Rust — fn, struct, enum, trait, impl block kezelés
- [x] Java — class, interface, record, method, import
- [x] Kotlin — data/sealed/abstract class, suspend fun, Android/Spring detekció
- [x] Ruby — class/module/def, Rails detekció
- [x] PHP — class/interface/trait, use imports

### Framework detekció (token-be kerül: `fw:nextjs`)
- [x] Next.js — `"use client"/"use server"`, page/layout/route/api fájlok
- [x] Flutter — widget class, lib/ könyvtár
- [x] Rails — app/controllers, app/models, ApplicationRecord
- [x] Android — Activity, Fragment, android. import
- [x] Spring — @Controller, @Service, @Repository

---

## v1.0 — Polish 🔲

- [ ] `nodex share` — statikus HTML export, megosztható link
- [ ] VS Code extension — státuszsor badge + search panel
- [ ] Git history integráció — miért változott egy modul (`git log --follow`)
- [ ] Dead code detektálás — node-ok amikre 0 incoming edge van
- [ ] TODO/FIXME debt map — kód kommentekből összegyűjtve
- [ ] Full-text search javítás — jelenleg LIKE, kellene SQLite FTS5
- [ ] Gráf layout javítás — jelenleg egyszerű file-csoportos grid, kellene dagre/ELK
- [ ] `nodex ui --port <n>` — konfiguráció
- [ ] Több projekt egyidejű kezelése

---

## Ismert Limitációk

| Probléma | Hatás | Megoldás (v1.0) |
|----------|-------|-----------------|
| Gráf layout: egyszerű grid | Nagy projekten zsúfolt | dagre / ELK layout |
| FTS: LIKE alapú | Lassú nagy DB-n | SQLite FTS5 virtual table |
| Import resolution: csak relative | Külső lib edge-ek hiányoznak | tsconfig paths + npm resolution |
| Dart parser: regex | Kisebb pontatlanság | tree-sitter-dart |
| AI összefoglaló: modul szintű | Egyedi fn-ek nem kapnak AI summary | Fn szintű opcionális summary |

---

## Gyors Teszt

```bash
cd /path/to/your-project

# Indexelés
bun /path/to/nodex/src/cli/main.ts init

# Vizuális UI
bun /path/to/nodex/src/cli/main.ts ui
# → http://localhost:3456

# Live watch
bun /path/to/nodex/src/cli/main.ts watch

# AI összefoglalók
export ANTHROPIC_API_KEY=sk-ant-...
bun /path/to/nodex/src/cli/main.ts summarize

# MCP (Claude Code-ban)
# → lásd CLAUDE.md MCP konfig szekció
```

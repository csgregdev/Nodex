
# Nodex

Élő, gráf-alapú kódbázis tudástár CLI fejlesztőknek és AI tooloknak.

Beolvassa a projektet → felépít egy node/edge gráfot → SQLite-ba menti → MCP server-en és vizuális UI-n keresztül elérhető.

## Architektúra

```
src/
├── indexer/        # fájl bejárás + AST parse + gráf építés
│   ├── walker.ts       # gitignore-t tisztelő async fs bejáró
│   ├── parser.ts       # tree-sitter (TS/JS/Python/Go) + regex (Dart/Rust/Java/Kotlin/Ruby/PHP)
│   ├── graph.ts        # parsed file → SQLite nodes/edges
│   ├── differ.ts       # SHA-256 hash alapú változás detektálás
│   └── languages/      # 13 nyelv config + framework hint detekció
├── store/          # SQLite CRUD (bun:sqlite)
│   ├── db.ts           # DB init, séma, WAL mode
│   ├── nodes.ts        # node upsert/get/search
│   ├── edges.ts        # edge insert/delete/query
│   └── meta.ts         # meta (gotcha/ai_decision/why) + project k/v
├── summarizer/     # Claude AI réteg
│   ├── ai.ts           # Claude Haiku API, batch 3 concurrent
│   ├── cache.ts        # hash alapú skip (ne hívja újra ha nem változott)
│   └── formatter.ts    # local caveman token formázó
├── watcher/
│   └── fswatch.ts      # chokidar + 500ms debounce + auto reindex
├── mcp/
│   ├── server.ts       # MCP stdio server
│   └── tools/          # 6 tool: search, context, impact, conventions, update, decision
├── api/
│   └── server.ts       # Hono HTTP API (5 endpoint) + Bun.serve() SPA
└── cli/
    ├── main.ts         # CLI dispatcher
    ├── init.ts         # teljes indexelés + context.md + CLAUDE.md generálás
    ├── reindex.ts      # DB törlés + újraindexelés
    ├── watch.ts        # háttér file watcher
    ├── sync.ts         # git diff alapú inkrementális frissítés
    ├── summarize.ts    # AI összefoglalók batch futtatása
    ├── search.ts       # terminál keresés
    └── ui.ts           # vizuális UI indítás

ui/
├── index.html          # Bun HTML entry
└── src/
    ├── App.tsx
    ├── components/
    │   ├── Graph.tsx       # @xyflow/react gráf, file-alapú layout
    │   ├── NodePanel.tsx   # jobb panel: token, summary, gotchák, impact
    │   ├── SearchBar.tsx   # debounced FTS keresés
    │   ├── StatsBar.tsx    # fájl/szimbólum/edge stat
    │   └── ui/             # shadcn/ui komponensek
    ├── lib/utils.ts        # cn() helper
    └── styles/globals.css  # Tailwind + dark téma CSS változók
```

## Adatmodell

- **nodes**: id=`"file::symbolName"`, type, name, file, line, language, token (caveman), summary (AI), complexity, hash
- **edges**: from_id, to_id, relationship (`calls|imports|extends|implements`)
- **meta**: node_id, key (`gotcha|ai_decision|why|todo_debt`), value
- **project**: key/value store (root_path, last_sync)

## Token formátum (caveman)

```
fn:        name(param,param)→returnType
class:     ClassName|extends:Base|impl:IFace
interface: IName
module:    [file.ts]|fw:nextjs|exports:A,B,C
```

## Támogatott nyelvek

TS/JS (tree-sitter), Python (tree-sitter), Go (tree-sitter), Dart/Flutter, Astro, Rust, Java, Kotlin/Android, Ruby/Rails, PHP

Framework detekció: Next.js (`"use client"`, page/layout/route fájlok), Flutter (widget class), Rails, Spring, Android

## MCP tools

- `nodex_search(query)` — szimbólum keresés
- `nodex_get_context(file)` — fájl összes node/edge/meta
- `nodex_impact_map(node_id)` — mi törik el ha változtatunk
- `nodex_get_conventions()` — AI döntések, gotchák
- `nodex_update_file(file)` — fájl újraindexelése módosítás után
- `nodex_add_decision(node_id, decision)` — döntés rögzítése

## MCP konfig (Claude Code)

```json
{
  "mcpServers": {
    "nodex": {
      "command": "bun",
      "args": ["run", "/path/to/nodex/src/mcp/server.ts"],
      "env": { "NODEX_PROJECT": "/path/to/your/project" }
    }
  }
}
```

---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

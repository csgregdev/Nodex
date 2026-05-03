# CODEX – Teljes Projekt Terv

> Élő, gráf-alapú kódbázis tudástár CLI fejlesztőknek.  
> MCP server + vizuális UI + token-optimalizált AI kontextus.

---

## 1. Mi ez pontosan

A Codex egy háttérben futó eszköz ami:
- Beolvassa a projektedet és felépít egy élő tudástárat
- Minden modulról tudja: mit csinál, ki hívja, mi függ tőle, miért van így megírva
- Az AI (Claude Code, Aider, bármely MCP-kompatibilis tool) ebből kérdez kontextust
- Vizuális webes felületen megjeleníti a projekt gráfját
- Automatikusan frissül ha változik a kód

---

## 2. Magas szintű architektúra

```
┌─────────────────────────────────────────────────────┐
│                    CODEX DAEMON                      │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │  Walker  │→ │ Parser   │→ │   Graph Builder    │ │
│  │ (chokidar│  │(tree-    │  │  nodes + edges     │ │
│  │  + fs)   │  │ sitter)  │  │  SQLite tárolás    │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
│                                        ↓             │
│                              ┌────────────────────┐  │
│                              │  AI Summarizer     │  │
│                              │  (Claude API)      │  │
│                              │  summary + token   │  │
│                              └────────────────────┘  │
└─────────────────────────────────────────────────────┘
         ↓                          ↓
┌────────────────┐        ┌─────────────────────┐
│  MCP Server    │        │   HTTP API          │
│  (AI toolok    │        │   (Hono)            │
│  kérdeznek)    │        │   vizuális UI-nak   │
└────────────────┘        └─────────────────────┘
                                    ↓
                          ┌─────────────────────┐
                          │   React Frontend    │
                          │   react-flow gráf   │
                          │   + keresés + docs  │
                          └─────────────────────┘
```

---

## 3. Tech Stack

| Réteg | Technológia | Miért |
|---|---|---|
| Runtime | Bun | 3-4x gyorsabb fájlművelet, beépített SQLite, natív TS |
| Nyelv | TypeScript | Típusbiztonság, modern, kiváló DX |
| Parser | tree-sitter | Ipari szabvány AST parser, 40+ nyelv |
| Adatbázis | bun:sqlite | Beépített, natív, nulla overhead |
| File watch | chokidar | Legjobb cross-platform fs watcher |
| HTTP API | Hono | Bun-natív, Express-szerű, villámgyors |
| MCP | @modelcontextprotocol/sdk | Hivatalos MCP SDK |
| Frontend | React + react-flow | Gráf vizualizációra tervezett |
| Validáció | Zod | Runtime type safety MCP inputokra |
| AI | Anthropic SDK | Claude API hívások |

---

## 3a. Supported Languages

All languages are detected by file extension. Framework detection uses file path patterns.

| Language | Extensions | Parser Strategy | Frameworks Detected |
|---|---|---|---|
| TypeScript | `.ts`, `.tsx` | tree-sitter (AST) with regex fallback | Next.js (`app/`, `pages/`), Angular (`.component.tsx`) |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` | tree-sitter (AST) with regex fallback | React, Node.js |
| Python | `.py` | Regex (top-level `def`/`class`) | Django (`settings.py`), FastAPI (`main.py`) |
| Go | `.go` | Regex (`func`, `type struct/interface`) | — |
| Dart | `.dart` | Regex (`class`, `func`) | Flutter (detects `StatefulWidget`/`StatelessWidget`) |
| Astro | `.astro` | Frontmatter extraction + TS regex | Astro framework |
| Rust | `.rs` | Generic (module node only in v0.1) | — |
| Java | `.java` | Generic (module node only in v0.1) | Spring (`Application.java`) |
| Kotlin | `.kt`, `.kts` | Generic (module node only in v0.1) | Spring, Android |
| Swift | `.swift` | Generic (module node only in v0.1) | — |
| Ruby | `.rb` | Generic (module node only in v0.1) | Rails (`app/controllers/`, `app/models/`) |
| PHP | `.php` | Generic (module node only in v0.1) | — |
| CSS/SCSS | `.css`, `.scss`, `.sass` | Generic (module node only in v0.1) | — |

### Detection Strategy

**Extension-based language detection** (`src/indexer/languages/index.ts`):
- `detectLanguage(filePath)` — matches file extension against `LANGUAGES` registry
- `detectFramework(filePath, lang)` — matches path patterns against `frameworkHints`

**Parser selection** (`src/indexer/parser.ts`):
1. TypeScript/JavaScript: tries tree-sitter native bindings, falls back to regex on error
2. Python/Go/Dart/Astro: pure regex parsers (reliable, no native deps)
3. All others: generic parser — creates module node only, no symbol extraction

**Symbols extracted** (where implemented):
- `fn` — functions, methods, arrow functions, async generators
- `class` — classes (incl. abstract)
- `interface` — TypeScript interfaces, Go interface types
- `type` — TypeScript type aliases
- `widget` — Dart Flutter widgets (StatefulWidget / StatelessWidget subclasses)
- `const` — exported top-level constants
- `module` — one per file, synthetic root node

---

## 4. Mappastruktúra

```
codex/
├── src/
│   ├── indexer/
│   │   ├── walker.ts           # fájlrendszer bejárás, gitignore tisztelet
│   │   ├── parser.ts           # tree-sitter alapú AST elemzés
│   │   ├── graph.ts            # node/edge modell építés
│   │   ├── differ.ts           # git diff alapú változásdetektálás
│   │   └── languages/
│   │       ├── typescript.ts   # TS/JS specifikus parse szabályok
│   │       ├── python.ts
│   │       └── go.ts
│   ├── summarizer/
│   │   ├── ai.ts               # Claude API hívások
│   │   ├── formatter.ts        # caveman token formátum generálás
│   │   └── cache.ts            # ne hívjuk újra ha nem változott
│   ├── store/
│   │   ├── db.ts               # SQLite kapcsolat, migrációk
│   │   ├── nodes.ts            # node CRUD műveletek
│   │   ├── edges.ts            # edge CRUD műveletek
│   │   └── meta.ts             # metadata CRUD (gotchák, ai_decisions)
│   ├── watcher/
│   │   └── fswatch.ts          # chokidar wrapper, debounce logika
│   ├── mcp/
│   │   ├── server.ts           # MCP server belépési pont
│   │   └── tools/
│   │       ├── search.ts       # codex_search tool
│   │       ├── context.ts      # codex_get_context tool
│   │       ├── impact.ts       # codex_impact_map tool
│   │       └── update.ts       # codex_update_file tool (AI írja)
│   ├── api/
│   │   ├── server.ts           # Hono HTTP server
│   │   └── routes/
│   │       ├── graph.ts        # GET /graph
│   │       ├── search.ts       # GET /search
│   │       └── node.ts         # GET /node/:id
│   └── cli/
│       ├── main.ts             # belépési pont
│       ├── init.ts             # codex init parancs
│       ├── watch.ts            # codex watch parancs
│       ├── sync.ts             # codex sync parancs
│       └── reindex.ts          # codex reindex parancs
├── ui/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Graph.tsx       # react-flow gráf
│   │   │   ├── NodePanel.tsx   # jobb oldali részletek panel
│   │   │   ├── SearchBar.tsx
│   │   │   └── ImpactOverlay.tsx
│   │   └── hooks/
│   │       ├── useGraph.ts
│   │       └── useSearch.ts
│   └── package.json
├── .codex/                     # projekt-specifikus (gitignore-ba)
│   ├── index.db                # SQLite adatbázis
│   └── context.md              # generált AI kontextus fájl
├── package.json
└── bunfig.toml
```

---

## 5. Adatmodell – SQLite sémák

### nodes tábla
```sql
CREATE TABLE nodes (
  id          TEXT PRIMARY KEY,  -- "src/auth/auth.service.ts::login"
  type        TEXT NOT NULL,     -- "fn" | "class" | "module" | "interface" | "type"
  name        TEXT NOT NULL,     -- "login"
  file        TEXT NOT NULL,     -- "src/auth/auth.service.ts"
  line        INTEGER,           -- 23
  language    TEXT,              -- "typescript"
  
  -- AI-nak: tömör caveman formátum
  token       TEXT,              -- "login(email,pass)→JWT|throws:AuthEx"
  
  -- UI-nak: olvasható összefoglaló  
  summary     TEXT,              -- "Authenticates user using bcrypt..."
  
  -- Metaadatok
  complexity  INTEGER DEFAULT 0, -- ciklomatikus komplexitás
  last_parsed INTEGER,           -- unix timestamp
  last_ai     INTEGER,           -- mikor volt utoljára AI összefoglaló
  hash        TEXT               -- fájl hash, változásdetektáláshoz
);
```

### edges tábla
```sql
CREATE TABLE edges (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id      TEXT NOT NULL,    -- "src/auth/auth.service.ts::login"
  to_id        TEXT NOT NULL,    -- "src/user/user.repo.ts::findByEmail"
  relationship TEXT NOT NULL,    -- "calls"|"imports"|"extends"|"implements"|"uses_type"
  
  FOREIGN KEY (from_id) REFERENCES nodes(id),
  FOREIGN KEY (to_id)   REFERENCES nodes(id)
);

CREATE INDEX idx_edges_from ON edges(from_id);
CREATE INDEX idx_edges_to   ON edges(to_id);
```

### meta tábla
```sql
CREATE TABLE meta (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id   TEXT NOT NULL,
  key       TEXT NOT NULL,   -- "gotcha"|"why"|"ai_decision"|"failed_approach"|"todo_debt"
  value     TEXT NOT NULL,
  created   INTEGER,         -- unix timestamp
  
  FOREIGN KEY (node_id) REFERENCES nodes(id)
);
```

### project tábla
```sql
CREATE TABLE project (
  key   TEXT PRIMARY KEY,   -- "last_sync", "root_path", "conventions", stb.
  value TEXT NOT NULL
);
```

---

## 6. A Token Formátum – Caveman Szabályok

Minden node-nak van `token` mezője. Ez megy az AI-nak, nem a `summary`.

### Formátum szabályok:
```
függvény:   name(params)→return|uses:X,Y|throws:Z|calls:A,B
osztály:    ClassName|extends:Base|impl:IFace|deps:X,Y
modul:      [ModuleName]|exports:A,B,C|deps:X,Y
interface:  IName{field:type,...}
```

### Példák:
```
login(email:str,pass:str)→JWT|uses:bcrypt,UserRepo|throws:AuthEx|calls:findByEmail,generateToken
UserService|deps:UserRepo,AuthService|exports:getUser,updateUser,deleteUser
[AuthModule]|exports:AuthService,AuthGuard|deps:UserModule,JwtModule
IUser{id:str,email:str,role:Role,createdAt:Date}
```

### Amit sosem tartalmaz:
- Fölösleges szavak: "this function", "returns a", "this class"
- Whitespace ahol nem kell
- Ismétlés (ha a névből egyértelmű)

---

## 7. MCP Server – Tools

### Olvasó tools (AI kérdez)

**codex_search**
```typescript
// Input
{ query: string, limit?: number }

// Output
[{
  id: string,
  token: string,      // tömör formátum
  file: string,
  line: number,
  relevance: number
}]

// Példa
query: "authentication login"
→ auth.service.ts::login | login(email,pass)→JWT | src/auth/auth.service.ts:23
```

**codex_get_context**
```typescript
// Input
{ file: string }

// Output - az egész fájl node/edge összefoglalója
{
  nodes: Node[],
  edges: Edge[],
  meta: Meta[],
  token_summary: string  // az egész fájl caveman formátumban
}
```

**codex_impact_map**
```typescript
// Input
{ node_id: string }

// Output - mi törik el ha ezt változtatjuk
{
  direct:   Node[],   // közvetlenül hívja/importálja
  indirect: Node[],   // közvetetten érintett
  risk:     "low" | "medium" | "high"
}
```

**codex_get_conventions**
```typescript
// Input - nincs

// Output - projekt konvenciók
{
  naming: string,
  patterns: string,
  ai_decisions: Meta[]
}
```

### Író tools (AI frissít)

**codex_update_file**
```typescript
// Input
{ file: string }

// Hatás: újra parse-olja a fájlt, frissíti az indexet
// Az AI ezt hívja minden fájlmódosítás után
```

**codex_add_decision**
```typescript
// Input
{ node_id: string, decision: string }

// Hatás: elmenti hogy mit döntöttetek
// Pl: "A UserService nem lehet singleton mert a tesztek interferálnak"
```

---

## 8. Indexelési Pipeline

### Init folyamat
```
codex init
    │
    ├─ 1. Config létrehozás (.codex/config.json)
    │
    ├─ 2. Fájl discovery (walker.ts)
    │      - gitignore tisztelet
    │      - node_modules, .git kizárás
    │      - language detektálás kiterjesztésből
    │
    ├─ 3. Natív parse (parser.ts + tree-sitter)
    │      PÁRHUZAMOSAN minden fájlra:
    │      - függvények, osztályok, interfészek kinyerése
    │      - import/export map
    │      - call graph (ki hívja ki)
    │      - fájl hash számítás
    │      → SQLite-ba írás
    │      IDŐ: ~2-10 mp (projekt mérettől függően)
    │
    ├─ 4. AI összefoglalók (ai.ts) - HÁTTÉRBEN
    │      Modul szinten (nem fájlonként):
    │      - összefoglalja mi a modul célja
    │      - azonosít gotchákat, anomáliákat
    │      - generál token formátumot
    │      → SQLite-ba írás
    │      IDŐ: ~1-5 perc (API hívások miatt)
    │
    └─ 5. context.md generálás
           Token-optimalizált összefoglaló
           → .codex/context.md
```

### Watch folyamat
```
Fájl változás (chokidar)
    │
    ├─ Debounce: 500ms (ne spammelje az API-t)
    │
    ├─ Hash check: valóban változott?
    │      Ha nem → skip
    │
    ├─ Natív re-parse: csak ez a fájl
    │
    ├─ Edge frissítés: régi edge-ek törlése, újak írása
    │
    ├─ AI összefoglaló: csak ha a modul érdemi tartalma változott
    │      (nem csak komment vagy whitespace)
    │
    └─ context.md inkrementális frissítés
```

### Sync folyamat (git alapú)
```
codex sync
    │
    ├─ git diff --name-only HEAD~1  (vagy utolsó codex run óta)
    │
    ├─ Csak a változott fájlok re-indexelése
    │
    └─ context.md frissítés
```

---

## 9. HTTP API (Hono) – Vizuális UI-nak

```
GET  /api/graph              → teljes projekt gráf (nodes + edges)
GET  /api/graph?module=auth  → szűrt gráf egy modulra
GET  /api/node/:id           → egy node teljes adatai + meta
GET  /api/search?q=login     → FTS keresés
GET  /api/impact/:id         → impact map egy node-ra
GET  /api/stats              → projekt statisztikák
```

### /api/graph válasz formátum (react-flow kompatibilis)
```json
{
  "nodes": [
    {
      "id": "src/auth/auth.service.ts::login",
      "type": "fn",
      "data": {
        "label": "login",
        "summary": "Authenticates user...",
        "token": "login(email,pass)→JWT",
        "file": "src/auth/auth.service.ts",
        "line": 23,
        "complexity": 4
      },
      "position": { "x": 0, "y": 0 }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "src/auth/auth.service.ts::login",
      "target": "src/user/user.repo.ts::findByEmail",
      "label": "calls"
    }
  ]
}
```

---

## 10. Vizuális UI – Komponensek

### Graph nézet (főnézet)
```
- react-flow alapú interaktív gráf
- Modulok = nagy csomópontok (kinyithatók)
- Függvények = kis csomópontok modulon belül
- Élek színezése: calls=kék, imports=szürke, extends=zöld
- Csomópont mérete = komplexitás
- Csomópont színe = kockázat (zöld→sárga→piros)
- Hover: megjelenik a token összefoglaló
- Kattintás: jobb oldali panel kinyílik
```

### Jobb oldali panel (NodePanel)
```
- Neve, típusa, fájl + sor
- AI summary (olvasható)
- Token formátum (másolható)
- Bejövő + kimenő kapcsolatok listája
- Meta: gotchák, ai_decisions, history
- Impact map gomb → animált kiemelés a gráfon
```

### Keresés
```
- Begépelés → azonnal szűri a gráfot
- FTS az összes mezőn
- Eredmény: kiemeli az érintett node-okat
- Szűrők: type, file, complexity
```

### Impact Overlay
```
- Kattintás "Impact" gombra egy node-on
- Animálva megjelenik: direkt hatás (piros), közvetett (narancs)
- Lista: pontosan mely fájlok érintettek
```

---

## 11. CLI Parancsok

```bash
codex init                    # első indexelés
codex watch                   # háttérben futó auto-frissítés
codex sync                    # git diff alapú frissítés
codex reindex                 # teljes újraindexelés
codex search "auth login"     # keresés a terminálból
codex impact src/auth/auth.service.ts::login  # impact map
codex ui                      # elindítja a vizuális UI-t
codex share                   # (v1.0) megosztható link generálás
```

---

## 12. Claude Code / Aider Integráció

### CLAUDE.md-be kerül:
```markdown
## Codex Index
Ez a projekt Codex indexelést használ. Minden fájlmódosítás után
hívd meg: codex_update_file({ file: "módosított/fájl.ts" })

A kontextushoz használd:
- codex_search(query) - függvények, modulok keresése
- codex_get_context(file) - egy fájl teljes kontextusa
- codex_impact_map(node_id) - mi törik el ha változtatok valamit
- codex_add_decision(node_id, decision) - döntés rögzítése

Aktuális projekt összefoglaló: .codex/context.md
```

### MCP config (claude_desktop_config.json):
```json
{
  "mcpServers": {
    "codex": {
      "command": "bun",
      "args": ["run", "/path/to/codex/src/mcp/server.ts"],
      "env": {
        "CODEX_PROJECT": "/path/to/your/project"
      }
    }
  }
}
```

---

## 13. Fejlesztési Fázisok

### v0.1 – Core Index (2-3 hét)
```
✅ Bun + TS projekt setup
✅ tree-sitter parser: TypeScript/JavaScript
✅ SQLite séma (nodes, edges, meta)
✅ Walker + fájl discovery
✅ Alap call graph építés
✅ context.md generálás (AI nélkül, csak struktúra)
✅ codex init + codex reindex CLI parancsok
```

### v0.2 – AI Réteg (1-2 hét)
```
✅ Claude API integráció
✅ Token formátum generálás (caveman)
✅ AI summaryк modul szinten
✅ Gotchák, anomáliák detektálása
✅ Cache: ne hívja újra ha nem változott
✅ context.md frissítés AI adatokkal
```

### v0.3 – Live Watch + MCP (2 hét)
```
✅ chokidar file watcher
✅ Inkrementális frissítés
✅ MCP server: search, context, impact, update tools
✅ codex watch parancs
✅ CLAUDE.md sablon generálás
```

### v0.4 – Vizuális UI (2-3 hét)
```
✅ Hono HTTP API
✅ React + react-flow alapú gráf
✅ NodePanel, SearchBar, ImpactOverlay
✅ codex ui parancs (elindítja a szervert + megnyitja a böngészőt)
```

### v0.5 – Python + Go parser (1 hét)
```
✅ tree-sitter Python support
✅ tree-sitter Go support
✅ Language-agnosztikus node/edge formátum
```

### v1.0 – Polish
```
✅ codex share (megosztható statikus export)
✅ VS Code extension (státuszsor + search panel)
✅ Git history integráció (miért változott egy modul)
✅ Dead code detektálás
✅ TODO/FIXME debt map
```

---

## 14. Első Lépések – Így Kezdj Hozzá

```bash
# 1. Projekt létrehozás
mkdir codex && cd codex
bun init -y

# 2. Függőségek
bun add tree-sitter tree-sitter-typescript tree-sitter-javascript
bun add chokidar @anthropic-ai/sdk @modelcontextprotocol/sdk
bun add hono zod

# 3. Dev függőségek
bun add -d @types/bun typescript

# 4. Első fájl: src/store/db.ts
# → SQLite séma létrehozás

# 5. Második fájl: src/indexer/parser.ts
# → tree-sitter alapú TypeScript parse

# 6. Harmadik fájl: src/cli/main.ts
# → codex init parancs

# Ezzel az alappal már van egy működő v0.1 ami
# beolvassa a projektet és feltölti az adatbázist
```

---

## 15. Kritikus Döntések Összefoglalva

| Döntés | Választás | Miért |
|---|---|---|
| Runtime | Bun | Sebesség, beépített SQLite, natív TS |
| Parser | tree-sitter (natív) | Pontos, gyors, ingyenes, offline |
| AI használat | Csak szemantikára | Skálázható, olcsó |
| Adatmodell | node/edge gráf | UI + MCP + query egyszerre működik |
| Token formátum | Caveman mini-nyelv | Max 15 token/függvény |
| MCP vs context.md | Mindkettő | context.md gyors start, MCP skálázható |
| Frontend | react-flow | Gráfra tervezett, production-ready |

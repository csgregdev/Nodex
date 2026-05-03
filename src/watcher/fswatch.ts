import chokidar from "chokidar";
import { relative } from "node:path";
import { detectLanguage } from "../indexer/languages/index.ts";
import { parseFile } from "../indexer/parser.ts";
import { indexFile } from "../indexer/graph.ts";
import { fileHash } from "../indexer/differ.ts";
import { getNodesByFile } from "../store/nodes.ts";
import { deleteNodesByFile } from "../store/nodes.ts";
import { deleteEdgesByFile } from "../store/edges.ts";

const DEFAULT_IGNORE = [
  "**/node_modules/**", "**/.git/**", "**/.codex/**",
  "**/dist/**", "**/build/**", "**/.next/**",
  "**/__pycache__/**", "**/*.pyc",
  "**/.dart_tool/**", "**/vendor/**",
];

export function startWatcher(root: string): void {
  const watcher = chokidar.watch(root, {
    ignored: DEFAULT_IGNORE,
    ignoreInitial: true,
    persistent: true,
  });

  // Debounce map: file → timer
  const debounceMap = new Map<string, Timer>();

  function scheduleReindex(absolutePath: string) {
    const existing = debounceMap.get(absolutePath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      debounceMap.delete(absolutePath);
      reindexFile(root, absolutePath).catch(err =>
        console.error(`[codex] Error reindexing ${absolutePath}:`, err)
      );
    }, 500);
    debounceMap.set(absolutePath, timer);
  }

  watcher
    .on("change", (path) => scheduleReindex(path))
    .on("add", (path) => scheduleReindex(path))
    .on("unlink", (path) => {
      const rel = relative(root, path);
      deleteNodesByFile(rel);
      deleteEdgesByFile(rel);
      console.log(`[codex] Removed: ${rel}`);
    });

  console.log(`[codex] Watching ${root} for changes...`);
}

async function reindexFile(root: string, absolutePath: string): Promise<void> {
  const relativePath = relative(root, absolutePath);
  const lang = detectLanguage(absolutePath);
  if (!lang) return;

  const newHash = await fileHash(absolutePath);

  // Check if hash changed (compare with stored hash)
  const existingNodes = getNodesByFile(relativePath);
  const moduleNode = existingNodes.find(n => n.name === "__module__");
  if (moduleNode?.hash === newHash) return; // no change

  try {
    const parsed = await parseFile(absolutePath, relativePath, lang.name);
    indexFile(parsed, newHash);
    console.log(`[codex] Updated: ${relativePath} (${parsed.symbols.length} symbols)`);

    // Re-summarize if API key available
    if (process.env.ANTHROPIC_API_KEY) {
      const { summarizeModule } = await import("../summarizer/ai.ts");
      const { upsertNode, getNodesByFile: getNodes } = await import("../store/nodes.ts");
      const { addMeta } = await import("../store/meta.ts");
      const { markAISummarized } = await import("../summarizer/cache.ts");

      const nodes = getNodes(relativePath);
      const sourceSnippet = (await Bun.file(absolutePath).text()).split("\n").slice(0, 100).join("\n");
      const result = await summarizeModule(relativePath, lang.name, nodes, sourceSnippet);

      const modNode = nodes.find(n => n.name === "__module__");
      if (modNode) {
        upsertNode({ ...modNode, summary: result.summary, token: result.token || modNode.token });
        markAISummarized(modNode.id, newHash);
        for (const g of result.gotchas) addMeta({ node_id: modNode.id, key: "gotcha", value: g, created: Math.floor(Date.now() / 1000) });
      }
    }
  } catch (err) {
    console.error(`[codex] Parse error ${relativePath}:`, err);
  }
}

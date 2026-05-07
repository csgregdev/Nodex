import chokidar from "chokidar";
import { relative } from "node:path";
import { detectLanguage } from "../indexer/languages/index.ts";
import { parseFile } from "../indexer/parser.ts";
import { indexFile } from "../indexer/graph.ts";
import { fileHash } from "../indexer/differ.ts";
import { getNodesByFile, deleteNodesByFile, updateCurrentHash } from "../store/nodes.ts";
import { deleteEdgesByFile } from "../store/edges.ts";

const DEFAULT_IGNORE = [
  "**/node_modules/**", "**/.git/**", "**/.nodex/**",
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
        console.error(`[nodex] Error reindexing ${absolutePath}:`, err)
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
      console.log(`[nodex] Removed: ${rel}`);
    });

  console.log(`[nodex] Watching ${root} for changes...`);
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
    // Update current_hash — marks nodes as stale if AI hash differs, no AI call
    updateCurrentHash(relativePath, newHash);
    console.log(`[nodex] Updated: ${relativePath} (${parsed.symbols.length} symbols) [stale — run nodex sync --enrich]`);
  } catch (err) {
    console.error(`[nodex] Parse error ${relativePath}:`, err);
  }
}

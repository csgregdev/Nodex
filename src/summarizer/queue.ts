import { join } from "node:path";
import { getNodesByFile, upsertNode, markAIEnriched } from "../store/nodes.ts";
import { addMeta, deleteMetaByNode } from "../store/meta.ts";
import { logTokenUsage } from "../store/token_usage.ts";
import { fileHash } from "../indexer/differ.ts";
import { detectLanguage } from "../indexer/languages/index.ts";
import { summarizeModule } from "./ai.ts";

/** Default: 10 requests per minute */
const DEFAULT_RPM = 10;

export interface EnrichOptions {
  rpm?: number;
  operation?: string;
  onProgress?: (file: string, done: number, total: number) => void;
  onError?: (file: string, err: unknown) => void;
}

export interface EnrichResult {
  file: string;
  cached: boolean;
  gotchas: number;
  functions: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Enrich a list of files with AI summaries.
 * Rate-limited: rpm (requests per minute), default 10.
 * Sorted by complexity desc — complex files first.
 */
export async function enrichFiles(
  root: string,
  files: string[],
  opts: EnrichOptions = {}
): Promise<EnrichResult[]> {
  const rpm = opts.rpm ?? DEFAULT_RPM;
  const operation = opts.operation ?? "enrich";
  const delayMs = Math.ceil(60_000 / rpm);
  const results: EnrichResult[] = [];
  let done = 0;

  // Sort by complexity: load all module nodes, sort by avg complexity
  const fileInfos = await Promise.all(
    files.map(async (file) => {
      const absPath = join(root, file);
      const nodes = getNodesByFile(file);
      const avgComplexity =
        nodes.length > 0
          ? nodes.reduce((s, n) => s + (n.complexity ?? 0), 0) / nodes.length
          : 0;
      return { file, absPath, nodes, avgComplexity };
    })
  );
  fileInfos.sort((a, b) => b.avgComplexity - a.avgComplexity);

  for (const info of fileInfos) {
    const { file, absPath, nodes } = info;
    done++;
    opts.onProgress?.(file, done, fileInfos.length);

    const lang = detectLanguage(absPath);
    if (!lang) {
      results.push({ file, cached: false, gotchas: 0, functions: 0, inputTokens: 0, outputTokens: 0 });
      continue;
    }

    try {
      const bunFile = Bun.file(absPath);
      if (!(await bunFile.exists())) continue;

      const hash = await fileHash(absPath);
      const sourceSnippet = (await bunFile.text()).split("\n").slice(0, 100).join("\n");

      const result = await summarizeModule(file, lang.name, nodes, sourceSnippet);

      // Log token usage
      logTokenUsage({
        node_id: nodes.find(n => n.name === "__module__")?.id ?? null,
        file,
        operation,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        model: result.model,
      });

      const moduleNode = nodes.find((n) => n.name === "__module__");
      if (moduleNode) {
        upsertNode({ ...moduleNode, summary: result.summary, token: result.token || moduleNode.token });
        markAIEnriched(moduleNode.id, hash, result.summary);

        // Replace gotchas and AI decisions
        deleteMetaByNode(moduleNode.id);
        for (const g of result.gotchas) {
          addMeta({ node_id: moduleNode.id, key: "gotcha", value: g, created: Math.floor(Date.now() / 1000) });
        }
        for (const d of result.aiDecisions) {
          addMeta({ node_id: moduleNode.id, key: "ai_decision", value: d, created: Math.floor(Date.now() / 1000) });
        }
      }

      results.push({
        file,
        cached: false,
        gotchas: result.gotchas.length,
        functions: nodes.filter((n) => n.type === "function").length,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (err) {
      opts.onError?.(file, err);
      results.push({ file, cached: false, gotchas: 0, functions: 0, inputTokens: 0, outputTokens: 0 });
    }

    // Rate limiting between requests
    if (done < fileInfos.length) {
      await Bun.sleep(delayMs);
    }
  }

  return results;
}

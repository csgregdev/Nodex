import { z } from "zod";
import { parseFile } from "../../indexer/parser.ts";
import { indexFile } from "../../indexer/graph.ts";
import { fileHash } from "../../indexer/differ.ts";
import { detectLanguage } from "../../indexer/languages/index.ts";
import { getProject } from "../../store/meta.ts";
import { join } from "node:path";

export const updateToolDef = {
  name: "codex_update_file",
  description: "Re-index a file after it was modified. Call this after every file edit.",
  inputSchema: {
    type: "object" as const,
    properties: {
      file: { type: "string", description: "File path relative to project root" },
    },
    required: ["file"],
  },
};

export async function updateTool(input: unknown) {
  const { file } = z.object({ file: z.string() }).parse(input);

  const root = getProject("root_path") ?? process.cwd();
  const absolutePath = join(root, file);

  const lang = detectLanguage(file);
  if (!lang) return { success: false, error: `Unsupported language for file: ${file}` };

  const bunFile = Bun.file(absolutePath);
  if (!(await bunFile.exists())) return { success: false, error: `File not found: ${file}` };

  const hash = await fileHash(absolutePath);
  const parsed = await parseFile(absolutePath, file, lang.name);
  indexFile(parsed, hash);

  return {
    success: true,
    file,
    symbols: parsed.symbols.length,
    imports: parsed.imports.length,
  };
}

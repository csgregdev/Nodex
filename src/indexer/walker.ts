import { readdirSync } from "node:fs";
import ignore from "ignore";
import { join, relative } from "node:path";
import { detectLanguage, detectFramework } from "./languages/index.ts";

const DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  ".codex",
  "dist",
  "build",
  ".next",
  "__pycache__",
  "*.pyc",
  ".dart_tool",
  ".pub-cache",
  "vendor",
  ".gradle",
  "*.class",
  "target",
  "*.lock",
  "bun.lock",
];

export interface WalkedFile {
  absolutePath: string;
  relativePath: string;
  language: string;
  framework?: string;
}

export async function* walkProject(root: string): AsyncGenerator<WalkedFile> {
  const ig = ignore().add(DEFAULT_IGNORE);
  const gitignorePath = join(root, ".gitignore");
  const gitignoreFile = Bun.file(gitignorePath);
  if (await gitignoreFile.exists()) {
    const content = await gitignoreFile.text();
    ig.add(content);
  }

  yield* walkDir(root, root, ig);
}

async function* walkDir(
  root: string,
  dir: string,
  ig: ReturnType<typeof ignore>
): AsyncGenerator<WalkedFile> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    const relativePath = relative(root, absolutePath);

    // ignore() requires forward slashes and no leading slash
    const normalizedRelative = relativePath.replace(/\\/g, "/");
    try {
      if (ig.ignores(normalizedRelative)) continue;
    } catch {
      continue;
    }

    if (entry.isDirectory()) {
      yield* walkDir(root, absolutePath, ig);
    } else if (entry.isFile()) {
      const lang = detectLanguage(entry.name);
      if (lang) {
        const framework = detectFramework(relativePath, lang) ?? undefined;
        yield {
          absolutePath,
          relativePath,
          language: lang.name,
          framework,
        };
      }
    }
  }
}

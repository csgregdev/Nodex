import { upsertNode, deleteNodesByFile } from "../store/nodes.ts";
import { insertEdge, deleteEdgesByFile } from "../store/edges.ts";
import type { ParsedFile, ParsedSymbol } from "./parser.ts";

export function indexFile(parsed: ParsedFile, fileHash: string): void {
  deleteNodesByFile(parsed.file);
  deleteEdgesByFile(parsed.file);

  const now = Math.floor(Date.now() / 1000);

  // Insert symbol nodes
  for (const sym of parsed.symbols) {
    const nodeId = `${parsed.file}::${sym.name}`;
    const token = generateToken(sym);

    upsertNode({
      id: nodeId,
      type: sym.type,
      name: sym.name,
      file: parsed.file,
      line: sym.line,
      language: parsed.language,
      token,
      complexity: sym.complexity ?? 0,
      last_parsed: now,
      hash: fileHash,
    });
  }

  // Insert module-level node for the file
  const moduleId = `${parsed.file}::__module__`;
  upsertNode({
    id: moduleId,
    type: "module",
    name: parsed.file.split("/").pop() ?? parsed.file,
    file: parsed.file,
    line: 1,
    language: parsed.language,
    token: `[${parsed.file}]${parsed.framework ? `|fw:${parsed.framework}` : ""}|exports:${parsed.exports.join(",")}`,
    complexity: 0,
    last_parsed: now,
    hash: fileHash,
  });

  // Insert import edges
  for (const imp of parsed.imports) {
    if (imp.isRelative) {
      const fromDir = parsed.file.split("/").slice(0, -1).join("/");
      const resolved = resolveRelativePath(fromDir, imp.from);
      const toModuleId = `${resolved}::__module__`;
      insertEdge({ from_id: moduleId, to_id: toModuleId, relationship: "imports" });
    }
  }
}

function generateToken(sym: ParsedSymbol): string {
  switch (sym.type) {
    case "fn":
    case "widget": {
      const params = sym.params?.join(",") ?? "";
      const ret = sym.returnType ? `→${sym.returnType}` : "";
      return `${sym.name}(${params})${ret}`;
    }
    case "class":
      return [
        sym.name,
        sym.extends ? `extends:${sym.extends}` : null,
        sym.implements?.length ? `impl:${sym.implements.join(",")}` : null,
      ]
        .filter(Boolean)
        .join("|");
    case "interface":
      return `I${sym.name}`;
    case "type":
      return `T:${sym.name}`;
    case "module":
      return `[${sym.name}]`;
    case "const":
      return `const:${sym.name}`;
    default:
      return sym.name;
  }
}

function resolveRelativePath(fromDir: string, importPath: string): string {
  const parts = fromDir ? fromDir.split("/") : [];
  const segments = importPath.replace(/^\.\//, "").split("/");
  for (const seg of segments) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  const path = parts.join("/");
  // If no extension, assume .ts
  if (!path.match(/\.\w+$/)) return path + ".ts";
  return path;
}

export interface ParsedSymbol {
  type: "fn" | "class" | "interface" | "type" | "module" | "const" | "widget";
  name: string;
  line: number;
  endLine?: number;
  params?: string[];
  returnType?: string;
  extends?: string;
  implements?: string[];
  isExported?: boolean;
  complexity?: number;
}

export interface ParsedImport {
  from: string;
  names: string[];
  isRelative: boolean;
}

export interface ParsedFile {
  file: string;
  language: string;
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  exports: string[];
  framework?: string;
}

export async function parseFile(
  absolutePath: string,
  relativePath: string,
  language: string
): Promise<ParsedFile> {
  const content = await Bun.file(absolutePath).text();

  switch (language) {
    case "typescript":
    case "javascript":
      return parseTypeScript(content, relativePath, language);
    case "python":
      return parsePython(content, relativePath);
    case "go":
      return parseGo(content, relativePath);
    case "dart":
      return parseDart(content, relativePath);
    case "astro":
      return parseAstro(content, relativePath);
    case "rust":
      return parseRust(content, relativePath);
    case "java":
      return parseJava(content, relativePath);
    case "kotlin":
      return parseKotlin(content, relativePath);
    case "ruby":
      return parseRuby(content, relativePath);
    case "php":
      return parsePHP(content, relativePath);
    default:
      return parseGeneric(content, relativePath, language);
  }
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript
// ---------------------------------------------------------------------------

async function parseTypeScript(
  content: string,
  file: string,
  language: string
): Promise<ParsedFile> {
  // Try tree-sitter first; fall back to regex on any error
  try {
    const Parser = (await import("tree-sitter")).default;
    let LangModule: any;
    if (language === "typescript" || file.endsWith(".ts") || file.endsWith(".tsx")) {
      LangModule = (await import("tree-sitter-typescript")).default;
    } else {
      LangModule = (await import("tree-sitter-javascript")).default;
    }

    const parser = new Parser();
    const isTsx = file.endsWith(".tsx");
    const lang = isTsx ? LangModule.tsx : (LangModule.typescript ?? LangModule);
    parser.setLanguage(lang);

    const tree = parser.parse(content);
    return parseTypeScriptAST(tree, content, file, language);
  } catch {
    // Fall back to regex
  }

  return parseTypeScriptRegex(content, file, language);
}

function detectFrameworkMetadata(content: string, file: string): string[] {
  const tags: string[] = [];

  // Next.js directives
  if (content.startsWith('"use client"') || content.startsWith("'use client'")) tags.push("next:client");
  if (content.startsWith('"use server"') || content.startsWith("'use server'")) tags.push("next:server");

  // Next.js file conventions
  if (file.match(/app\/.+\/page\.(tsx?|jsx?)$/)) tags.push("next:page");
  if (file.match(/app\/.+\/layout\.(tsx?|jsx?)$/)) tags.push("next:layout");
  if (file.match(/app\/.+\/route\.(tsx?|jsx?)$/)) tags.push("next:route");
  if (file.match(/pages\/api\/.+/)) tags.push("next:api");
  if (
    content.includes("export default function") &&
    (file.includes("/pages/") || file.match(/app\/.*page/))
  )
    tags.push("next:component");

  // React hooks/context
  if (content.includes("useState") || content.includes("useEffect")) tags.push("react:hooks");
  if (content.includes("createContext")) tags.push("react:context");

  // Astro
  if (file.endsWith(".astro")) tags.push("astro:component");

  return tags;
}

function parseTypeScriptAST(tree: any, content: string, file: string, language: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");
  const frameworkTags = detectFrameworkMetadata(content, file);

  function visit(node: any) {
    const type = node.type;

    if (type === "import_statement") {
      const fromNode = node.childForFieldName("source");
      const from = fromNode?.text?.replace(/['"]/g, "") ?? "";
      const names: string[] = [];
      const namedImports = node.descendantsOfType("import_specifier");
      for (const imp of namedImports) {
        const nameNode = imp.childForFieldName("name");
        if (nameNode) names.push(nameNode.text);
      }
      const defaultImport = node.descendantsOfType("identifier")[0];
      if (defaultImport && namedImports.length === 0) names.push(defaultImport.text);
      imports.push({ from, names, isRelative: from.startsWith(".") });
      return;
    }

    // All function-like nodes: don't recurse into their bodies
    const isFunctionLike =
      type === "function_declaration" ||
      type === "function" ||
      type === "generator_function_declaration" ||
      type === "generator_function" ||
      type === "method_definition";

    if (isFunctionLike) {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) return; // anonymous
      const name = nameNode.text;
      const line = node.startPosition.row + 1;
      const params = extractParams(node);
      const retNode = node.childForFieldName("return_type");
      const returnType = retNode?.text?.replace(/^:\s*/, "");
      const isExported = isNodeExported(node);
      if (isExported) exports.push(name);
      symbols.push({
        type: "fn",
        name,
        line,
        params,
        returnType,
        isExported,
        complexity: estimateComplexityLines(lines, node.startPosition.row, node.endPosition.row),
      });
      return; // don't recurse into function body
    }

    if (type === "arrow_function") {
      // Handled by lexical_declaration parent — don't recurse
      return;
    }

    if (type === "lexical_declaration" || type === "variable_declaration") {
      // Only process top-level declarations (direct children of program or export_statement)
      const parentType = node.parent?.type;
      if (parentType !== "program" && parentType !== "export_statement") {
        // Inside a function body — skip
        return;
      }
      const declarators = node.descendantsOfType("variable_declarator");
      for (const decl of declarators) {
        const nameNode = decl.childForFieldName("name");
        const valueNode = decl.childForFieldName("value");
        if (!nameNode) continue;
        const name = nameNode.text;
        const line = decl.startPosition.row + 1;
        const isExported = isNodeExported(node);
        if (valueNode && (valueNode.type === "arrow_function" || valueNode.type === "function")) {
          const params = extractParams(valueNode);
          const retNode = valueNode.childForFieldName("return_type");
          const returnType = retNode?.text?.replace(/^:\s*/, "");
          if (isExported) exports.push(name);
          symbols.push({
            type: "fn",
            name,
            line,
            params,
            returnType,
            isExported,
            complexity: estimateComplexityLines(lines, decl.startPosition.row, decl.endPosition.row),
          });
        } else {
          if (isExported) {
            exports.push(name);
            symbols.push({ type: "const", name, line, isExported, complexity: 0 });
          }
        }
      }
      return;
    }

    if (type === "class_declaration" || type === "abstract_class_declaration") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) { visitChildren(node); return; }
      const name = nameNode.text;
      const line = node.startPosition.row + 1;
      const extNode = node.childForFieldName("superclass");
      const ext = extNode?.text;
      const implNode = node.childForFieldName("implements");
      const impls = implNode
        ? implNode.descendantsOfType("type_identifier").map((n: any) => n.text)
        : [];
      const isExported = isNodeExported(node);
      if (isExported) exports.push(name);
      symbols.push({ type: "class", name, line, extends: ext, implements: impls, isExported, complexity: 1 });
      return;
    }

    if (type === "interface_declaration") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) { visitChildren(node); return; }
      const name = nameNode.text;
      const line = node.startPosition.row + 1;
      const isExported = isNodeExported(node);
      if (isExported) exports.push(name);
      symbols.push({ type: "interface", name, line, isExported, complexity: 0 });
      return;
    }

    if (type === "type_alias_declaration") {
      const nameNode = node.childForFieldName("name");
      if (!nameNode) { visitChildren(node); return; }
      const name = nameNode.text;
      const line = node.startPosition.row + 1;
      const isExported = isNodeExported(node);
      if (isExported) exports.push(name);
      symbols.push({ type: "type", name, line, isExported, complexity: 0 });
      return;
    }

    visitChildren(node);
  }

  function visitChildren(node: any) {
    for (let i = 0; i < node.childCount; i++) {
      visit(node.child(i));
    }
  }

  function isNodeExported(node: any): boolean {
    const parent = node.parent;
    if (!parent) return false;
    if (parent.type === "export_statement") return true;
    if (parent.type === "program") return false;
    return isNodeExported(parent);
  }

  function extractParams(node: any): string[] {
    const paramsNode = node.childForFieldName("parameters");
    if (!paramsNode) return [];
    const params: string[] = [];
    for (let i = 0; i < paramsNode.childCount; i++) {
      const child = paramsNode.child(i);
      if (child.type === "required_parameter" || child.type === "optional_parameter") {
        const nameNode = child.childForFieldName("pattern") ?? child.childForFieldName("name");
        if (nameNode) params.push(nameNode.text);
      } else if (child.type === "identifier") {
        params.push(child.text);
      }
    }
    return params;
  }

  visitChildren(tree.rootNode);

  // Determine framework from tags
  let framework: string | undefined;
  if (frameworkTags.some((t) => t.startsWith("next:"))) framework = "nextjs";
  else if (frameworkTags.some((t) => t.startsWith("react:"))) framework = "react";
  else if (frameworkTags.some((t) => t.startsWith("astro:"))) framework = "astro";

  return { file, language, symbols, imports, exports, framework };
}

function parseTypeScriptRegex(content: string, file: string, language: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");
  const frameworkTags = detectFrameworkMetadata(content, file);

  const fnRegex =
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\s{;]+))?/;
  const arrowRegex =
    /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\(([^)]*)\)|(\w+))\s*(?::\s*([^\s=]+))?\s*=>/;
  const classRegex =
    /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+([\w.<>,\s]+?))?(?:\s+implements\s+([^{]+))?(?:\s*\{|$)/;
  const interfaceRegex = /^(?:export\s+)?interface\s+(\w+)/;
  const typeRegex = /^(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/;
  const importRegex =
    /^import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+)|\*\s+as\s+(\w+))(?:\s*,\s*(?:\{([^}]+)\}|(\w+)))?\s+from\s+['"]([^'"]+)['"]/;
  const importDefaultRegex = /^import\s+(?:type\s+)?(\w+)\s+from\s+['"]([^'"]+)['"]/;
  const sideEffectImportRegex = /^import\s+['"]([^'"]+)['"]/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const lineNum = i + 1;

    if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;

    // Parse imports
    const importMatch = line.match(importRegex);
    if (importMatch) {
      const named1 = importMatch[1] ?? "";
      const named2 = importMatch[4] ?? "";
      const namedStr = [named1, named2].filter(Boolean).join(",");
      const names = namedStr
        ? namedStr
            .split(",")
            .map((s) => s.trim().split(/\s+as\s+/)[0]!.trim())
            .filter(Boolean)
        : [];
      const from = importMatch[6]!;
      imports.push({ from, names, isRelative: from.startsWith(".") });
      continue;
    }

    const importDefaultMatch = line.match(importDefaultRegex);
    if (importDefaultMatch) {
      imports.push({
        from: importDefaultMatch[2]!,
        names: [importDefaultMatch[1]!],
        isRelative: importDefaultMatch[2]!.startsWith("."),
      });
      continue;
    }

    const sideEffectMatch = line.match(sideEffectImportRegex);
    if (sideEffectMatch) {
      imports.push({ from: sideEffectMatch[1]!, names: [], isRelative: sideEffectMatch[1]!.startsWith(".") });
      continue;
    }

    // Regular function
    const fnMatch = line.match(fnRegex);
    if (fnMatch) {
      const name = fnMatch[1]!;
      const params = parseParams(fnMatch[2] ?? "");
      const returnType = fnMatch[3]?.trim();
      const isExported = line.includes("export");
      if (isExported) exports.push(name);
      symbols.push({
        type: "fn",
        name,
        line: lineNum,
        params,
        returnType,
        isExported,
        complexity: estimateComplexity(lines, i),
      });
      continue;
    }

    // Arrow function
    const arrowMatch = line.match(arrowRegex);
    if (arrowMatch) {
      const name = arrowMatch[1]!;
      const params = parseParams(arrowMatch[2] ?? arrowMatch[3] ?? "");
      const returnType = arrowMatch[4]?.trim();
      const isExported = line.includes("export");
      if (isExported) exports.push(name);
      symbols.push({
        type: "fn",
        name,
        line: lineNum,
        params,
        returnType,
        isExported,
        complexity: 1,
      });
      continue;
    }

    // Class
    const classMatch = line.match(classRegex);
    if (classMatch) {
      const name = classMatch[1]!;
      const ext = classMatch[2]?.trim();
      const impls = classMatch[3]
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const isExported = line.includes("export");
      if (isExported) exports.push(name);
      symbols.push({
        type: "class",
        name,
        line: lineNum,
        extends: ext,
        implements: impls,
        isExported,
        complexity: 1,
      });
      continue;
    }

    // Interface
    const ifaceMatch = line.match(interfaceRegex);
    if (ifaceMatch) {
      const name = ifaceMatch[1]!;
      const isExported = line.includes("export");
      if (isExported) exports.push(name);
      symbols.push({ type: "interface", name, line: lineNum, isExported, complexity: 0 });
      continue;
    }

    // Type alias
    const typeMatch = line.match(typeRegex);
    if (typeMatch) {
      const name = typeMatch[1]!;
      const isExported = line.includes("export");
      if (isExported) exports.push(name);
      symbols.push({ type: "type", name, line: lineNum, isExported, complexity: 0 });
      continue;
    }
  }

  // Determine framework from tags
  let framework: string | undefined;
  if (frameworkTags.some((t) => t.startsWith("next:"))) framework = "nextjs";
  else if (frameworkTags.some((t) => t.startsWith("react:"))) framework = "react";
  else if (frameworkTags.some((t) => t.startsWith("astro:"))) framework = "astro";

  return { file, language, symbols, imports, exports, framework };
}

function parseParams(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((p) => {
      const cleaned = p.trim().replace(/^\.\.\.|^{.*}$/, "").trim();
      return cleaned.split(":")[0]?.split("=")[0]?.trim() ?? "";
    })
    .filter(Boolean);
}

function estimateComplexity(lines: string[], startLine: number): number {
  let complexity = 1;
  const end = Math.min(startLine + 50, lines.length);
  for (let i = startLine; i < end; i++) {
    const line = lines[i] ?? "";
    const matches = line.match(/\b(if|else|for|while|switch|case|\?\?|&&|\|\|)\b|\?(?![:?])/g);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

function estimateComplexityLines(lines: string[], startRow: number, endRow: number): number {
  let complexity = 1;
  for (let i = startRow; i <= Math.min(endRow, startRow + 100); i++) {
    const line = lines[i] ?? "";
    const matches = line.match(/\b(if|else|for|while|switch|case|\?\?|&&|\|\|)\b|\?(?![:?])/g);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

// ---------------------------------------------------------------------------
// Python (tree-sitter with regex fallback)
// ---------------------------------------------------------------------------

async function parsePython(content: string, file: string): Promise<ParsedFile> {
  try {
    const Parser = (await import("tree-sitter")).default;
    const Python = (await import("tree-sitter-python")).default;
    const parser = new Parser();
    parser.setLanguage(Python);
    const tree = parser.parse(content);
    return parsePythonAST(tree, content, file);
  } catch {
    // fall back to regex
  }
  return parsePythonRegex(content, file);
}

function parsePythonAST(tree: any, content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  function visit(node: any, depth = 0) {
    switch (node.type) {
      case "import_statement": {
        const names: string[] = [];
        for (const child of node.children) {
          if (child.type === "dotted_name" || child.type === "identifier") names.push(child.text);
        }
        imports.push({ from: names.join("."), names: [], isRelative: false });
        break;
      }
      case "import_from_statement": {
        const moduleNode = node.children.find(
          (c: any) => c.type === "dotted_name" || c.type === "relative_import"
        );
        const from = moduleNode?.text ?? "";
        const importedNames: string[] = [];
        for (const child of node.children) {
          if (child.type === "import_prefix") continue;
          if (child.type === "dotted_name" && child !== moduleNode) importedNames.push(child.text);
          if (child.type === "aliased_import") {
            const name = child.childForFieldName("name");
            if (name) importedNames.push(name.text);
          }
          if (child.type === "wildcard_import") importedNames.push("*");
        }
        imports.push({ from, names: importedNames, isRelative: from.startsWith(".") });
        break;
      }
      case "function_definition": {
        if (depth > 1) break; // skip nested functions (only top-level + class methods)
        const nameNode = node.childForFieldName("name");
        if (!nameNode) break;
        const name = nameNode.text;
        const line = node.startPosition.row + 1;
        const paramsNode = node.childForFieldName("parameters");
        const params = paramsNode ? extractPythonParams(paramsNode) : [];
        const retNode = node.childForFieldName("return_type");
        const returnType = retNode?.text?.replace(/^->\s*/, "");
        const complexity = estimateComplexityLines(lines, node.startPosition.row, node.endPosition.row);
        if (!name.startsWith("_")) exports.push(name);
        symbols.push({ type: "fn", name, line, params, returnType, complexity });
        break; // don't recurse into function body
      }
      case "class_definition": {
        const nameNode = node.childForFieldName("name");
        if (!nameNode) break;
        const name = nameNode.text;
        const line = node.startPosition.row + 1;
        const argsNode = node.childForFieldName("argument_list");
        const bases = argsNode
          ? argsNode.children
              .filter((c: any) => c.type !== "," && c.type !== "(" && c.type !== ")")
              .map((c: any) => c.text)
          : [];
        exports.push(name);
        symbols.push({
          type: "class",
          name,
          line,
          extends: bases[0],
          implements: bases.slice(1),
          complexity: 1,
        });
        // Visit class body (methods) at depth+1
        for (const child of node.children) visit(child, depth + 1);
        return;
      }
    }
    if (depth === 0) {
      for (const child of node.children) visit(child, depth);
    }
  }

  visit(tree.rootNode, 0);
  return { file, language: "python", symbols, imports, exports };
}

function extractPythonParams(paramsNode: any): string[] {
  const params: string[] = [];
  for (const child of paramsNode.children) {
    if (child.type === "identifier") {
      if (child.text !== "self" && child.text !== "cls") params.push(child.text);
    } else if (child.type === "typed_parameter" || child.type === "typed_default_parameter") {
      const nameNode = child.childForFieldName("name") ?? child.children[0];
      if (nameNode && nameNode.text !== "self" && nameNode.text !== "cls") params.push(nameNode.text);
    } else if (child.type === "default_parameter") {
      const nameNode = child.childForFieldName("name");
      if (nameNode && nameNode.text !== "self") params.push(nameNode.text);
    }
  }
  return params.filter(Boolean);
}

function parsePythonRegex(content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  const fnRegex = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^\s:]+))?/;
  const classRegex = /^class\s+(\w+)(?:\s*\(([^)]+)\))?/;
  const importFromRegex = /^from\s+(\S+)\s+import\s+(.+)/;
  const importRegex = /^import\s+(\S+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const lineNum = i + 1;

    if (!trimmed || trimmed.startsWith("#")) continue;

    const importFromMatch = trimmed.match(importFromRegex);
    if (importFromMatch) {
      const from = importFromMatch[1]!;
      const namesRaw = importFromMatch[2]!.replace(/^\(|\)$/g, "");
      const names = namesRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "*");
      imports.push({ from, names, isRelative: from.startsWith(".") });
      continue;
    }

    const importMatch = trimmed.match(importRegex);
    if (importMatch) {
      imports.push({ from: importMatch[1]!, names: [], isRelative: false });
      continue;
    }

    const fnMatch = line.match(fnRegex);
    if (fnMatch) {
      const indentation = fnMatch[1]!.length;
      if (indentation > 0) continue; // skip methods
      const name = fnMatch[2]!;
      const params = parsePythonParamsRegex(fnMatch[3] ?? "");
      const returnType = fnMatch[4]?.trim();
      if (!name.startsWith("_")) exports.push(name);
      symbols.push({
        type: "fn",
        name,
        line: lineNum,
        params,
        returnType,
        complexity: estimateComplexity(lines, i),
      });
      continue;
    }

    const classMatch = trimmed.match(classRegex);
    if (classMatch) {
      const name = classMatch[1]!;
      const bases = classMatch[2]
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
      symbols.push({
        type: "class",
        name,
        line: lineNum,
        extends: bases[0],
        implements: bases.slice(1),
        complexity: 1,
      });
      continue;
    }
  }

  return { file, language: "python", symbols, imports, exports };
}

function parsePythonParamsRegex(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((p) => p.trim().split(":")[0]!.split("=")[0]!.trim())
    .filter((p) => p && p !== "self" && p !== "cls" && !p.startsWith("*"));
}

// ---------------------------------------------------------------------------
// Go (tree-sitter with regex fallback)
// ---------------------------------------------------------------------------

async function parseGo(content: string, file: string): Promise<ParsedFile> {
  try {
    const Parser = (await import("tree-sitter")).default;
    const Go = (await import("tree-sitter-go")).default;
    const parser = new Parser();
    parser.setLanguage(Go);
    const tree = parser.parse(content);
    return parseGoAST(tree, content, file);
  } catch {
    // fall back to regex
  }
  return parseGoRegex(content, file);
}

function parseGoAST(tree: any, content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  function visit(node: any) {
    switch (node.type) {
      case "import_declaration":
      case "import_spec": {
        const pathNode =
          node.childForFieldName("path") ??
          node.descendantsOfType("interpreted_string_literal")[0];
        if (pathNode) {
          const from = pathNode.text.replace(/['"]/g, "");
          imports.push({ from, names: [], isRelative: from.startsWith(".") });
        }
        break;
      }
      case "import_spec_list": {
        for (const child of node.children) visit(child);
        break;
      }
      case "function_declaration": {
        const nameNode = node.childForFieldName("name");
        if (!nameNode) break;
        const name = nameNode.text;
        const line = node.startPosition.row + 1;
        const paramsNode = node.childForFieldName("parameters");
        const params = paramsNode ? extractGoParams(paramsNode) : [];
        const resultNode = node.childForFieldName("result");
        const returnType = resultNode?.text;
        const complexity = estimateComplexityLines(lines, node.startPosition.row, node.endPosition.row);
        if (name[0] === name[0]?.toUpperCase()) exports.push(name);
        symbols.push({
          type: "fn",
          name,
          line,
          params,
          returnType,
          complexity,
          isExported: name[0] === name[0]?.toUpperCase(),
        });
        return; // don't recurse into function body
      }
      case "method_declaration": {
        const nameNode = node.childForFieldName("name");
        if (!nameNode) break;
        const name = nameNode.text;
        const line = node.startPosition.row + 1;
        const paramsNode = node.childForFieldName("parameters");
        const params = paramsNode ? extractGoParams(paramsNode) : [];
        const receiverNode = node.childForFieldName("receiver");
        const receiverType =
          receiverNode?.text?.replace(/[()]/g, "").trim().split(" ").pop() ?? "";
        symbols.push({ type: "fn", name: `${receiverType}.${name}`, line, params, complexity: 1 });
        return;
      }
      case "type_declaration": {
        for (const child of node.children) {
          if (child.type === "type_spec") {
            const nameNode = child.childForFieldName("name");
            const typeNode = child.childForFieldName("type");
            if (nameNode) {
              const name = nameNode.text;
              const kind =
                typeNode?.type === "interface_type"
                  ? "interface"
                  : typeNode?.type === "struct_type"
                  ? "class"
                  : "type";
              if (name[0] === name[0]?.toUpperCase()) exports.push(name);
              symbols.push({
                type: kind as any,
                name,
                line: child.startPosition.row + 1,
                complexity: 0,
              });
            }
          }
        }
        break;
      }
    }
    for (const child of node.children) visit(child);
  }

  visit(tree.rootNode);
  return { file, language: "go", symbols, imports, exports };
}

function extractGoParams(paramsNode: any): string[] {
  const params: string[] = [];
  for (const child of paramsNode.children) {
    if (child.type === "parameter_declaration") {
      const names = child.descendantsOfType("identifier");
      if (names.length > 0) params.push(names[0].text);
    }
  }
  return params;
}

function parseGoRegex(content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  const fnRegex =
    /^func\s+(?:\(\w+\s+\*?(\w+)\)\s+)?(\w+)\s*\(([^)]*)\)(?:\s+([^{]+))?/;
  const typeRegex = /^type\s+(\w+)\s+(struct|interface)/;
  const importRegex = /^\s*"([^"]+)"/;
  const singleImport = /^import\s+"([^"]+)"/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const lineNum = i + 1;

    const fnMatch = line.match(fnRegex);
    if (fnMatch) {
      const name = fnMatch[2]!;
      const paramsRaw = fnMatch[3] ?? "";
      const params = paramsRaw
        ? paramsRaw.split(",").map((p) => p.trim().split(" ")[0] ?? "").filter(Boolean)
        : [];
      const returnType = fnMatch[4]?.trim();
      if (name[0] === name[0]?.toUpperCase() && name[0] !== name[0]?.toLowerCase()) {
        exports.push(name);
      }
      symbols.push({
        type: "fn",
        name,
        line: lineNum,
        params,
        returnType,
        complexity: estimateComplexity(lines, i),
      });
      continue;
    }

    const typeMatch = line.match(typeRegex);
    if (typeMatch) {
      const name = typeMatch[1]!;
      const kind = typeMatch[2] === "interface" ? "interface" : "class";
      if (name[0] === name[0]?.toUpperCase() && name[0] !== name[0]?.toLowerCase()) {
        exports.push(name);
      }
      symbols.push({ type: kind as "class" | "interface", name, line: lineNum, complexity: 0 });
      continue;
    }

    const singleImp = line.match(singleImport);
    if (singleImp) {
      imports.push({ from: singleImp[1]!, names: [], isRelative: false });
      continue;
    }

    const importMatch = line.match(importRegex);
    if (importMatch) {
      imports.push({ from: importMatch[1]!, names: [], isRelative: false });
      continue;
    }
  }

  return { file, language: "go", symbols, imports, exports };
}

// ---------------------------------------------------------------------------
// Dart / Flutter
// ---------------------------------------------------------------------------

function parseDart(content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  const FLUTTER_BASE_CLASSES = new Set([
    "StatefulWidget",
    "StatelessWidget",
    "Widget",
    "HookWidget",
    "ConsumerWidget",
    "HookConsumerWidget",
    "StatefulHookConsumerWidget",
    "State",
    "ChangeNotifier",
    "ValueNotifier",
  ]);

  const classRegex =
    /^(?:abstract\s+)?class\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+(\w+))?(?:\s+(?:implements|with)\s+([^{]+))?/;
  const methodRegex =
    /^\s{2,}(?:@override\s+)?(?:(?:Future|Stream|void|bool|int|double|String|dynamic|[A-Z]\w*)\??\s+)+(\w+)\s*\(([^)]*)\)/;
  const topFnRegex =
    /^(?:(?:Future|Stream|void|bool|int|double|String|dynamic|[A-Z]\w*)\??\s+)?(\w+)\s*\(([^)]*)\)\s*(?:async\s*)?[{;]/;
  const importRegex = /^import\s+'([^']+)'(?:\s+as\s+\w+)?(?:\s+show\s+.+)?(?:\s+hide\s+.+)?;/;

  let currentClass: string | null = null;
  let currentClassIsWidget = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const lineNum = i + 1;

    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

    const importMatch = trimmed.match(importRegex);
    if (importMatch) {
      const from = importMatch[1]!;
      const isRelative = !from.startsWith("package:") && !from.startsWith("dart:");
      imports.push({ from, names: [], isRelative });
      continue;
    }

    const classMatch = trimmed.match(classRegex);
    if (classMatch) {
      currentClass = classMatch[1]!;
      const ext = classMatch[2];
      currentClassIsWidget = !!(ext && FLUTTER_BASE_CLASSES.has(ext));
      const impls =
        classMatch[3]
          ?.split(",")
          .map((s) => s.trim().split(" ").pop()!)
          .filter(Boolean) ?? [];
      exports.push(currentClass);
      symbols.push({
        type: currentClassIsWidget ? "widget" : "class",
        name: currentClass,
        line: lineNum,
        extends: ext,
        implements: impls,
        complexity: 1,
      });
      continue;
    }

    // Class method (indented 2+)
    if (currentClass && line.match(/^\s{2,}/)) {
      const methodMatch = line.match(methodRegex);
      if (methodMatch) {
        const name = methodMatch[1]!;
        if (["if", "for", "while", "return", "var", "final", "const"].includes(name)) continue;
        const params = methodMatch[2]
          ? methodMatch[2]
              .split(",")
              .map((p) => {
                const parts = p.trim().split(/\s+/);
                return parts[parts.length - 1]?.replace(/[{}]/, "") ?? "";
              })
              .filter((p) => p && !p.startsWith("@"))
          : [];
        symbols.push({
          type: "fn",
          name: `${currentClass}.${name}`,
          line: lineNum,
          params,
          complexity: 1,
        });
      }
      continue;
    }

    // Top-level function
    if (!line.startsWith(" ")) {
      const fnMatch = trimmed.match(topFnRegex);
      if (fnMatch) {
        const name = fnMatch[1]!;
        if (
          [
            "if", "for", "while", "switch", "return", "class", "import",
            "export", "abstract", "library",
          ].includes(name)
        )
          continue;
        if (name === currentClass) continue; // constructor handled via class
        const params = fnMatch[2]
          ? fnMatch[2]
              .split(",")
              .map((p) => {
                const parts = p.trim().split(/\s+/);
                return parts[parts.length - 1] ?? "";
              })
              .filter(Boolean)
          : [];
        symbols.push({ type: "fn", name, line: lineNum, params, complexity: 1 });
      }
    }
  }

  const isFlutter = file.includes("/lib/") || symbols.some((s) => s.type === "widget");

  return {
    file,
    language: "dart",
    symbols,
    imports,
    exports,
    framework: isFlutter ? "flutter" : undefined,
  };
}

// ---------------------------------------------------------------------------
// Astro
// ---------------------------------------------------------------------------

function parseAstro(content: string, file: string): ParsedFile {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const componentName =
    file.split("/").pop()?.replace(".astro", "") ?? "Component";

  if (fmMatch) {
    const scriptContent = fmMatch[1]!;
    const tsResult = parseTypeScriptRegex(scriptContent, file, "astro");
    tsResult.symbols.unshift({
      type: "class",
      name: componentName,
      line: 1,
      complexity: 1,
    });
    tsResult.framework = "astro";
    return tsResult;
  }

  return {
    file,
    language: "astro",
    symbols: [{ type: "class", name: componentName, line: 1, complexity: 1 }],
    imports: [],
    exports: [componentName],
    framework: "astro",
  };
}

// ---------------------------------------------------------------------------
// Rust
// ---------------------------------------------------------------------------

function parseRust(content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  const fnRegex =
    /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*->\s*([^\s{]+))?/;
  const structRegex = /^(?:pub\s+)?struct\s+(\w+)/;
  const enumRegex = /^(?:pub\s+)?enum\s+(\w+)/;
  const traitRegex = /^(?:pub\s+)?trait\s+(\w+)/;
  const implRegex = /^impl(?:<[^>]+>)?\s+(\w+)/;
  const useRegex = /^use\s+([\w:]+)/;

  let currentImpl: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const lineNum = i + 1;

    if (line.startsWith("//")) continue;

    const useMatch = line.match(useRegex);
    if (useMatch) {
      const from = useMatch[1]!.split("::")[0]!;
      imports.push({ from, names: [], isRelative: false });
      continue;
    }

    const implMatch = line.match(implRegex);
    if (implMatch) {
      currentImpl = implMatch[1]!;
      continue;
    }

    const fnMatch = line.match(fnRegex);
    if (fnMatch) {
      const name = currentImpl ? `${currentImpl}::${fnMatch[1]}` : fnMatch[1]!;
      const params = fnMatch[2]
        ? fnMatch[2]
            .split(",")
            .map((p) => p.trim().split(":")[0]?.trim() ?? "")
            .filter(
              (p) => p && p !== "self" && p !== "&self" && p !== "&mut self"
            )
        : [];
      const returnType = fnMatch[3]?.trim();
      const isExported = lines[i]!.startsWith("pub ");
      if (isExported && !currentImpl) exports.push(fnMatch[1]!);
      symbols.push({
        type: "fn",
        name,
        line: lineNum,
        params,
        returnType,
        isExported,
        complexity: estimateComplexityLines(
          lines,
          i,
          Math.min(i + 50, lines.length - 1)
        ),
      });
      continue;
    }

    const structMatch = line.match(structRegex);
    if (structMatch) {
      const name = structMatch[1]!;
      const isExported = lines[i]!.startsWith("pub ");
      if (isExported) exports.push(name);
      symbols.push({ type: "class", name, line: lineNum, isExported, complexity: 0 });
      continue;
    }

    const enumMatch = line.match(enumRegex);
    if (enumMatch) {
      const name = enumMatch[1]!;
      if (lines[i]!.startsWith("pub ")) exports.push(name);
      symbols.push({ type: "type", name, line: lineNum, complexity: 0 });
      continue;
    }

    const traitMatch = line.match(traitRegex);
    if (traitMatch) {
      const name = traitMatch[1]!;
      if (lines[i]!.startsWith("pub ")) exports.push(name);
      symbols.push({ type: "interface", name, line: lineNum, complexity: 0 });
      continue;
    }
  }

  return { file, language: "rust", symbols, imports, exports };
}

// ---------------------------------------------------------------------------
// Java
// ---------------------------------------------------------------------------

function parseJava(content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  const classRegex =
    /^(?:public\s+)?(?:abstract\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/;
  const methodRegex =
    /^\s+(?:(?:public|private|protected|static|final|abstract|synchronized|default)\s+)*(?!if|for|while|switch|return|new)(\w+(?:<[^>]+>)?)\s+(\w+)\s*\(([^)]*)\)/;
  const importRegex = /^import\s+(?:static\s+)?([\w.]+);/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const lineNum = i + 1;

    if (line.startsWith("//") || line.startsWith("*")) continue;

    const importMatch = line.match(importRegex);
    if (importMatch) {
      const parts = importMatch[1]!.split(".");
      const from = parts.slice(0, -1).join(".");
      const name = parts[parts.length - 1]!;
      imports.push({ from, names: [name], isRelative: false });
      continue;
    }

    const classMatch = line.match(classRegex);
    if (classMatch) {
      const name = classMatch[1]!;
      const ext = classMatch[2];
      const impls =
        classMatch[3]
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      exports.push(name);
      symbols.push({
        type: "class",
        name,
        line: lineNum,
        extends: ext,
        implements: impls,
        complexity: 1,
      });
      continue;
    }

    const methodMatch = line.match(methodRegex);
    if (methodMatch) {
      const name = methodMatch[2]!;
      if (["if", "for", "while", "switch", "return", "catch", "else", "try"].includes(name))
        continue;
      const params = methodMatch[3]
        ? methodMatch[3]
            .split(",")
            .map((p) => {
              const parts = p.trim().split(/\s+/);
              return parts[parts.length - 1] ?? "";
            })
            .filter(Boolean)
        : [];
      const returnType = methodMatch[1];
      symbols.push({ type: "fn", name, line: lineNum, params, returnType, complexity: 1 });
      continue;
    }
  }

  return { file, language: "java", symbols, imports, exports };
}

// ---------------------------------------------------------------------------
// Kotlin
// ---------------------------------------------------------------------------

function parseKotlin(content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  const classRegex =
    /^(?:data\s+|sealed\s+|abstract\s+|open\s+)?(?:class|interface|object|enum class)\s+(\w+)(?:\s*:\s*(\w+))?/;
  const fnRegex =
    /^(?:\s+)?(?:override\s+)?(?:suspend\s+)?fun\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*:\s*([^\s{=]+))?/;
  const importRegex = /^import\s+([\w.]+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const lineNum = i + 1;

    if (trimmed.startsWith("//")) continue;

    const importMatch = trimmed.match(importRegex);
    if (importMatch) {
      const parts = importMatch[1]!.split(".");
      imports.push({
        from: parts.slice(0, -1).join("."),
        names: [parts[parts.length - 1]!],
        isRelative: false,
      });
      continue;
    }

    const classMatch = trimmed.match(classRegex);
    if (classMatch) {
      const name = classMatch[1]!;
      exports.push(name);
      symbols.push({
        type: "class",
        name,
        line: lineNum,
        extends: classMatch[2],
        complexity: 1,
      });
      continue;
    }

    const fnMatch = trimmed.match(fnRegex);
    if (fnMatch) {
      const name = fnMatch[1]!;
      if (["if", "for", "while", "when", "return"].includes(name)) continue;
      const params = fnMatch[2]
        ? fnMatch[2]
            .split(",")
            .map((p) => p.trim().split(":")[0]?.trim() ?? "")
            .filter(Boolean)
        : [];
      const returnType = fnMatch[3]?.trim();
      symbols.push({ type: "fn", name, line: lineNum, params, returnType, complexity: 1 });
      continue;
    }
  }

  const isAndroid =
    content.includes("android.") ||
    content.includes("Activity") ||
    content.includes("Fragment");
  const isSpring =
    content.includes("@Controller") ||
    content.includes("@Service") ||
    content.includes("@Repository");

  return {
    file,
    language: "kotlin",
    symbols,
    imports,
    exports,
    framework: isAndroid ? "android" : isSpring ? "spring" : undefined,
  };
}

// ---------------------------------------------------------------------------
// Ruby
// ---------------------------------------------------------------------------

function parseRuby(content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const lineNum = i + 1;

    if (line.startsWith("#")) continue;

    const reqMatch = line.match(/^require(?:_relative)?\s+['"]([^'"]+)['"]/);
    if (reqMatch) {
      imports.push({
        from: reqMatch[1]!,
        names: [],
        isRelative: line.includes("require_relative"),
      });
      continue;
    }

    const classMatch = line.match(/^(?:class|module)\s+(\w+)(?:\s*<\s*(\w+))?/);
    if (classMatch) {
      exports.push(classMatch[1]!);
      symbols.push({
        type: "class",
        name: classMatch[1]!,
        line: lineNum,
        extends: classMatch[2],
        complexity: 1,
      });
      continue;
    }

    const fnMatch = line.match(/^(?:\s+)?def\s+(self\.)?(\w+[?!]?)\s*(?:\(([^)]*)\))?/);
    if (fnMatch) {
      const name = fnMatch[2]!;
      const params = fnMatch[3]
        ? fnMatch[3]
            .split(",")
            .map((p) => p.trim().split(":")[0]!.split("=")[0]!.trim())
            .filter(Boolean)
        : [];
      symbols.push({ type: "fn", name, line: lineNum, params, complexity: 1 });
    }
  }

  const isRails =
    file.includes("app/controllers") ||
    file.includes("app/models") ||
    content.includes("ApplicationRecord") ||
    content.includes("ActionController");

  return {
    file,
    language: "ruby",
    symbols,
    imports,
    exports,
    framework: isRails ? "rails" : undefined,
  };
}

// ---------------------------------------------------------------------------
// PHP
// ---------------------------------------------------------------------------

function parsePHP(content: string, file: string): ParsedFile {
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const lineNum = i + 1;

    if (line.startsWith("//") || line.startsWith("#")) continue;

    const useMatch = line.match(/^use\s+([\w\\]+)(?:\s+as\s+\w+)?;/);
    if (useMatch) {
      const parts = useMatch[1]!.split("\\");
      imports.push({
        from: parts.join("/"),
        names: [parts[parts.length - 1]!],
        isRelative: false,
      });
      continue;
    }

    const classMatch = line.match(
      /^(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/
    );
    if (classMatch) {
      const name = classMatch[1]!;
      const impls =
        classMatch[3]
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      exports.push(name);
      symbols.push({
        type: "class",
        name,
        line: lineNum,
        extends: classMatch[2],
        implements: impls,
        complexity: 1,
      });
      continue;
    }

    const fnMatch = line.match(
      /^(?:public|private|protected|static|\s)+function\s+(\w+)\s*\(([^)]*)\)/
    );
    if (fnMatch) {
      const name = fnMatch[1]!;
      const params = fnMatch[2]
        ? fnMatch[2]
            .split(",")
            .map((p) => {
              const m = p.trim().match(/\$(\w+)/);
              return m ? m[1]! : "";
            })
            .filter(Boolean)
        : [];
      symbols.push({ type: "fn", name, line: lineNum, params, complexity: 1 });
    }
  }

  return { file, language: "php", symbols, imports, exports };
}

// ---------------------------------------------------------------------------
// Generic (unsupported languages)
// ---------------------------------------------------------------------------

function parseGeneric(content: string, file: string, language: string): ParsedFile {
  return { file, language, symbols: [], imports: [], exports: [] };
}

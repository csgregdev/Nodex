import type { ParsedFile, ParsedSymbol } from "./parser.ts";

/**
 * Semantic roles for code symbols.
 * Inferred from file path, naming conventions, framework hints, and symbol type.
 */
export type Role =
  | "screen"      // page/screen (Next.js page, Flutter screen)
  | "component"   // UI component (React component, Flutter widget)
  | "hook"        // React hook (use* prefix)
  | "service"     // service/API client
  | "model"       // data model/entity/DTO
  | "controller"  // request handler/controller
  | "middleware"   // middleware
  | "route"       // API route/endpoint
  | "store"       // state management (Redux, Zustand, Context)
  | "util"        // utility/helper function
  | "test"        // test code
  | "config"      // configuration
  | "layout"      // layout component
  | "module";     // file-level module (default)

/**
 * Infer the semantic role of a symbol based on context.
 */
export function inferRole(
  sym: ParsedSymbol,
  file: string,
  framework?: string,
  fileContent?: string,
): Role {
  const name = sym.name;
  const fileLower = file.toLowerCase();
  const fileName = fileLower.split("/").pop() ?? "";

  // ── Test files ────────────────────────────────────────────────────────
  if (
    fileLower.includes(".test.") ||
    fileLower.includes(".spec.") ||
    fileLower.includes("__tests__/") ||
    fileLower.includes("/test/") ||
    fileLower.includes("/tests/")
  ) {
    return "test";
  }

  // ── Config files ──────────────────────────────────────────────────────
  if (
    fileName.includes(".config.") ||
    fileName.includes("config.") ||
    fileName === "tsconfig.json" ||
    fileLower.includes("/config/") ||
    fileLower.endsWith(".env.ts") ||
    name.toLowerCase().includes("config")
  ) {
    return "config";
  }

  // ── Middleware ─────────────────────────────────────────────────────────
  if (
    fileName.includes("middleware") ||
    name.toLowerCase().includes("middleware")
  ) {
    return "middleware";
  }

  // ── Next.js file conventions ──────────────────────────────────────────
  if (framework === "nextjs" || framework === "react") {
    if (fileLower.match(/app\/.+\/page\.(tsx?|jsx?)$/) || fileLower.match(/pages\/(?!api\/).*\.(tsx?|jsx?)$/)) {
      if (sym.type === "fn" || sym.type === "class") return "screen";
    }
    if (fileLower.match(/app\/.+\/layout\.(tsx?|jsx?)$/)) {
      if (sym.type === "fn" || sym.type === "class") return "layout";
    }
    if (fileLower.match(/app\/.+\/route\.(tsx?|jsx?)$/) || fileLower.includes("pages/api/")) {
      return "route";
    }
  }

  // ── React hooks ───────────────────────────────────────────────────────
  if (sym.type === "fn" && name.match(/^use[A-Z]/)) {
    return "hook";
  }

  // ── State management ──────────────────────────────────────────────────
  if (
    name.match(/Store$|Slice$|Reducer$/) ||
    name.match(/^create(Store|Slice|Context)$/) ||
    fileLower.includes("/store/") ||
    fileLower.includes("/stores/") ||
    fileLower.includes("/slices/") ||
    name.match(/Provider$/) && sym.type === "fn"
  ) {
    return "store";
  }

  // ── Controllers ───────────────────────────────────────────────────────
  if (
    name.match(/Controller$/) ||
    fileLower.includes("/controllers/") ||
    fileLower.includes("/handlers/")
  ) {
    return "controller";
  }

  // ── Routes ────────────────────────────────────────────────────────────
  if (
    fileLower.includes("/routes/") ||
    fileLower.includes("/api/") ||
    name.match(/Router$|Route$/)
  ) {
    return "route";
  }

  // ── Services ──────────────────────────────────────────────────────────
  if (
    name.match(/Service$|Client$|Api$|API$/) ||
    fileLower.includes("/services/") ||
    fileLower.includes("/clients/")
  ) {
    return "service";
  }

  // ── Models / DTOs ─────────────────────────────────────────────────────
  if (
    fileLower.includes("/models/") ||
    fileLower.includes("/entities/") ||
    fileLower.includes("/dto/") ||
    fileLower.includes("/schemas/") ||
    name.match(/Model$|Entity$|DTO$|Schema$/) ||
    (sym.type === "interface" && fileLower.includes("/types/")) ||
    sym.extends === "ApplicationRecord" ||
    sym.extends === "BaseEntity"
  ) {
    return "model";
  }

  // ── React/UI components ───────────────────────────────────────────────
  if (sym.type === "widget") return "component";
  if (
    sym.type === "fn" &&
    name[0] === name[0]?.toUpperCase() &&
    name[0] !== name[0]?.toLowerCase() && // PascalCase
    sym.isExported &&
    (
      fileLower.includes("/components/") ||
      fileLower.includes("/views/") ||
      fileLower.includes("/ui/") ||
      fileLower.endsWith(".tsx") ||
      fileLower.endsWith(".jsx")
    )
  ) {
    return "component";
  }

  // ── Utility / helpers ─────────────────────────────────────────────────
  if (
    fileLower.includes("/utils/") ||
    fileLower.includes("/helpers/") ||
    fileLower.includes("/lib/") ||
    fileLower.includes("/common/")
  ) {
    return "util";
  }

  // ── Module-level node → module ────────────────────────────────────────
  if (sym.type === "module") return "module";

  // Default: no specific role — stays as module-level
  return "module";
}

/**
 * Infer roles for all symbols in a parsed file.
 * Returns a map of symbol name → role.
 */
export function inferRoles(parsed: ParsedFile, fileContent?: string): Map<string, Role> {
  const roles = new Map<string, Role>();
  for (const sym of parsed.symbols) {
    roles.set(sym.name, inferRole(sym, parsed.file, parsed.framework, fileContent));
  }
  return roles;
}

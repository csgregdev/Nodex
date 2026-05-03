import type { Node } from "../store/nodes.ts";

// Token format rules:
// fn:        name(param:type,...)→returnType|throws:X|uses:Y
// class:     ClassName|extends:Base|impl:IFace,IFace2
// interface: IName{field:type}
// type:      T:Name
// module:    [ModuleName]|exports:A,B,C
// widget:    WidgetName|extends:StatelessWidget

export function formatToken(node: Node, callers?: string[], callees?: string[]): string {
  const base = node.token ?? node.name;
  const parts: string[] = [base];

  if (callees?.length) {
    parts.push(`calls:${callees.slice(0, 3).join(",")}`);
  }
  if (callers?.length) {
    parts.push(`usedBy:${callers.slice(0, 3).join(",")}`);
  }

  return parts.join("|");
}

export function formatModuleSummary(file: string, nodes: Node[], exports: string[]): string {
  const types = nodes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const typeStr = Object.entries(types).map(([t, c]) => `${c}${t}`).join(",");
  const exportStr = exports.slice(0, 5).join(",");

  return `[${file}]|${typeStr}|exports:${exportStr}`;
}

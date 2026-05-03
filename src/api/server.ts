import { Hono } from "hono";
import { cors } from "hono/cors";
import { initDB } from "../store/db.ts";
import { getAllNodes, getNode, searchNodes } from "../store/nodes.ts";
import { getAllEdges, getEdgesFrom, getEdgesTo } from "../store/edges.ts";
import { getMetaByNode } from "../store/meta.ts";
import index from "../../ui/index.html";

export function startAPIServer(root: string, port = 3456) {
  initDB(root);

  const app = new Hono();
  app.use("*", cors());

  // GET /api/graph
  app.get("/api/graph", (c) => {
    const module = c.req.query("module");
    let nodes = getAllNodes().filter(n => n.name !== "__module__");
    if (module) nodes = nodes.filter(n => n.file.includes(module));

    const edges = getAllEdges();

    // react-flow format
    const rfNodes = nodes.map(n => ({
      id: n.id,
      type: "codexNode",
      data: {
        label: n.name,
        summary: n.summary,
        token: n.token ?? n.name,
        file: n.file,
        line: n.line,
        nodeType: n.type,
        language: n.language,
        complexity: n.complexity ?? 0,
      },
      position: { x: 0, y: 0 }, // layout handled client-side
    }));

    const rfEdges = edges.map((e, i) => ({
      id: `e${e.id ?? i}`,
      source: e.from_id,
      target: e.to_id,
      label: e.relationship,
      type: e.relationship,
    }));

    return c.json({ nodes: rfNodes, edges: rfEdges });
  });

  // GET /api/node/:id — URL-encoded id
  app.get("/api/node/:id", (c) => {
    const id = decodeURIComponent(c.req.param("id"));
    const node = getNode(id);
    if (!node) return c.json({ error: "Not found" }, 404);

    const meta = getMetaByNode(id);
    const outEdges = getEdgesFrom(id);
    const inEdges = getEdgesTo(id);

    return c.json({ node, meta, outEdges, inEdges });
  });

  // GET /api/search?q=
  app.get("/api/search", (c) => {
    const q = c.req.query("q") ?? "";
    const limit = parseInt(c.req.query("limit") ?? "20");
    const results = searchNodes(q, limit);
    return c.json(results);
  });

  // GET /api/impact/:id
  app.get("/api/impact/:id", (c) => {
    const id = decodeURIComponent(c.req.param("id"));
    const node = getNode(id);
    if (!node) return c.json({ error: "Not found" }, 404);

    const directEdges = getEdgesTo(id);
    const directIds = new Set(directEdges.map(e => e.from_id));

    const allEdges = getAllEdges();
    const indirectIds = new Set<string>();
    for (const did of directIds) {
      allEdges
        .filter(e => e.to_id === did && !directIds.has(e.from_id) && e.from_id !== id)
        .forEach(e => indirectIds.add(e.from_id));
    }

    const allNodes = getAllNodes();
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));

    return c.json({
      direct: [...directIds].map(id => nodeMap.get(id)).filter(Boolean),
      indirect: [...indirectIds].map(id => nodeMap.get(id)).filter(Boolean),
      risk: directIds.size > 5 ? "high" : directIds.size > 2 ? "medium" : "low",
    });
  });

  // GET /api/stats
  app.get("/api/stats", (c) => {
    const nodes = getAllNodes();
    const edges = getAllEdges();
    const files = new Set(nodes.map(n => n.file)).size;
    const languages = [...new Set(nodes.map(n => n.language).filter(Boolean))] as string[];
    const byType = nodes.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return c.json({ nodes: nodes.length, edges: edges.length, files, languages, byType });
  });

  // SPA catch-all — serve ui/index.html for all other routes
  return Bun.serve({
    port,
    routes: {
      "/api/*": app.fetch,
      "/*": index,
    },
    development: process.env.NODE_ENV !== "production",
  });
}

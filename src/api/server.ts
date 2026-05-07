import { Hono } from "hono";
import { cors } from "hono/cors";
import { initDB } from "../store/db.ts";
import {
  getAllNodes, getNode, searchNodes,
  getNodesPaginated, getNodeCount, getNodesByIds, getNodeStatus,
} from "../store/nodes.ts";
import {
  getAllEdges, getEdgesFrom, getEdgesTo,
  getEdgesByNodeIds, getEdgeCount,
} from "../store/edges.ts";
import { getMetaByNode } from "../store/meta.ts";
import index from "../../ui/index.html";

export function startAPIServer(root: string, port = 3456) {
  initDB(root);

  const app = new Hono();
  app.use("*", cors());

  // GET /api/graph?module=<filter>&page=<n>&pageSize=<n>
  // Returns full graph or paginated slice. For large projects use page param.
  app.get("/api/graph", (c) => {
    const module = c.req.query("module");
    const page = parseInt(c.req.query("page") ?? "0");
    const pageSize = parseInt(c.req.query("pageSize") ?? "0");

    let nodes = getAllNodes().filter(n => n.name !== "__module__");
    if (module) nodes = nodes.filter(n => n.file.includes(module));

    // Paginate if requested
    if (pageSize > 0) {
      nodes = nodes.slice(page * pageSize, (page + 1) * pageSize);
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    // Only return edges where both endpoints are in current node set
    const allEdges = getAllEdges();
    const edges = allEdges.filter(e => nodeIds.has(e.from_id) && nodeIds.has(e.to_id));

    const rfNodes = nodes.map(n => ({
      id: n.id,
      type: "nodexNode",
      data: {
        label: n.name,
        summary: n.summary,
        token: n.token ?? n.name,
        file: n.file,
        line: n.line,
        nodeType: n.type,
        language: n.language,
        complexity: n.complexity ?? 0,
        aiStatus: getNodeStatus(n),
        hotspotScore: n.hotspot_score ?? 0,
        lastAi: n.last_ai ?? null,
        hash: n.hash ?? null,
        currentHash: n.current_hash ?? null,
      },
      position: { x: 0, y: 0 },
    }));

    const rfEdges = edges.map((e, i) => ({
      id: `e${e.id ?? i}`,
      source: e.from_id,
      target: e.to_id,
      label: e.relationship,
      type: e.relationship === "co_changes" ? "coChangeEdge" : "nodexEdge",
      data: { weight: e.weight ?? 1 },
    }));

    return c.json({ nodes: rfNodes, edges: rfEdges, total: getNodeCount() });
  });

  // GET /api/graph/neighborhood/:id?depth=1
  // Returns a node + its immediate neighbors (depth 1 or 2)
  app.get("/api/graph/neighborhood/:id", (c) => {
    const id = decodeURIComponent(c.req.param("id"));
    const depth = Math.min(parseInt(c.req.query("depth") ?? "1"), 2);

    const center = getNode(id);
    if (!center) return c.json({ error: "Not found" }, 404);

    const collectedIds = new Set<string>([id]);

    const expand = (nodeId: string) => {
      const out = getEdgesFrom(nodeId);
      const inn = getEdgesTo(nodeId);
      for (const e of [...out, ...inn]) {
        collectedIds.add(e.from_id);
        collectedIds.add(e.to_id);
      }
    };

    expand(id);
    if (depth === 2) {
      const firstRing = [...collectedIds].filter(i => i !== id);
      for (const rid of firstRing) expand(rid);
    }

    const ids = [...collectedIds];
    const nodes = getNodesByIds(ids);
    const edges = getEdgesByNodeIds(ids).filter(
      e => collectedIds.has(e.from_id) && collectedIds.has(e.to_id)
    );

    const rfNodes = nodes.map(n => ({
      id: n.id,
      type: "nodexNode",
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
      position: { x: 0, y: 0 },
    }));

    const rfEdges = edges.map((e, i) => ({
      id: `e${e.id ?? i}`,
      source: e.from_id,
      target: e.to_id,
      label: e.relationship,
      type: "nodexEdge",
    }));

    return c.json({ nodes: rfNodes, edges: rfEdges, center: id });
  });

  // GET /api/graph/tree — file-level collapsed view
  // One node per file, edges = aggregated cross-file relationships
  app.get("/api/graph/tree", (c) => {
    const allNodes = getAllNodes();
    const allEdges = getAllEdges();

    // Map symbol id → file
    const nodeToFile = new Map<string, string>();
    for (const n of allNodes) nodeToFile.set(n.id, n.file);

    // One node per file
    const fileNodes = new Map<string, { id: string; file: string; count: number; languages: Set<string> }>();
    for (const n of allNodes) {
      if (!fileNodes.has(n.file)) {
        fileNodes.set(n.file, { id: `file::${n.file}`, file: n.file, count: 0, languages: new Set() });
      }
      const fn = fileNodes.get(n.file)!;
      fn.count++;
      if (n.language) fn.languages.add(n.language);
    }

    // Aggregate cross-file edges (deduplicate)
    const fileEdgeSet = new Set<string>();
    for (const e of allEdges) {
      const fromFile = nodeToFile.get(e.from_id);
      const toFile = nodeToFile.get(e.to_id);
      if (!fromFile || !toFile || fromFile === toFile) continue;
      const key = `${fromFile}→${toFile}→${e.relationship}`;
      fileEdgeSet.add(key);
    }

    // Build a quick module node lookup for status/hotspot
    const moduleNodeMap = new Map<string, (typeof allNodes)[0]>();
    for (const n of allNodes) {
      if (n.name === "__module__") moduleNodeMap.set(n.file, n);
    }

    const rfNodes = [...fileNodes.values()].map(fn => {
      const mod = moduleNodeMap.get(fn.file);
      return {
        id: fn.id,
        type: "nodexNode",
        data: {
          label: fn.file.split("/").slice(-1)[0],
          file: fn.file,
          nodeType: "module",
          language: [...fn.languages][0] ?? "",
          complexity: 0,
          token: `[${fn.file}] symbols:${fn.count}`,
          aiStatus: mod ? getNodeStatus(mod) : "unknown",
          hotspotScore: mod?.hotspot_score ?? 0,
          lastAi: mod?.last_ai ?? null,
        },
        position: { x: 0, y: 0 },
      };
    });

    // Include co_changes edges in tree view
    const coChangeEdges = allEdges.filter(e => e.relationship === "co_changes");

    const rfEdges = [
      ...[...fileEdgeSet].map((key, i) => {
        const [fromFile, toFile, rel] = key.split("→");
        return {
          id: `fe${i}`,
          source: `file::${fromFile}`,
          target: `file::${toFile}`,
          label: rel,
          type: "nodexEdge",
          data: { weight: 1 },
        };
      }),
      ...coChangeEdges.map((e, i) => ({
        id: `cc${e.id ?? i}`,
        source: e.from_id,
        target: e.to_id,
        label: "co_changes",
        type: "coChangeEdge",
        data: { weight: e.weight ?? 1 },
      })),
    ];

    return c.json({ nodes: rfNodes, edges: rfEdges });
  });

  // GET /api/node/:id
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

  // POST /api/enrich/:id — trigger AI enrichment for a single node's file
  app.post("/api/enrich/:id", async (c) => {
    const id = decodeURIComponent(c.req.param("id"));
    const node = getNode(id);
    if (!node) return c.json({ error: "Not found" }, 404);

    if (!process.env.ANTHROPIC_API_KEY) {
      return c.json({ error: "ANTHROPIC_API_KEY not set" }, 503);
    }

    try {
      const { enrichFiles } = await import("../summarizer/queue.ts");
      const results = await enrichFiles(root, [node.file], { rpm: 60 });
      return c.json({ ok: true, file: node.file, results });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // POST /api/enrich/module/:file — trigger AI enrichment for an entire file
  app.post("/api/enrich/module/:file", async (c) => {
    const file = decodeURIComponent(c.req.param("file"));

    if (!process.env.ANTHROPIC_API_KEY) {
      return c.json({ error: "ANTHROPIC_API_KEY not set" }, 503);
    }

    try {
      const { enrichFiles } = await import("../summarizer/queue.ts");
      const results = await enrichFiles(root, [file], { rpm: 60 });
      return c.json({ ok: true, file, results });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  // POST /api/mark-stale/:id — manually mark a node stale
  app.post("/api/mark-stale/:id", async (c) => {
    const id = decodeURIComponent(c.req.param("id"));
    const node = getNode(id);
    if (!node) return c.json({ error: "Not found" }, 404);

    const { getDB } = await import("../store/db.ts");
    const db = getDB();
    // Set current_hash to a sentinel that differs from hash
    db.run("UPDATE nodes SET current_hash = '__stale__' WHERE id = ?", [id]);
    return c.json({ ok: true });
  });

  // GET /api/stats
  app.get("/api/stats", (c) => {
    const nodeCount = getNodeCount();
    const edgeCount = getEdgeCount();
    // Only load minimal data for stats
    const nodes = getAllNodes();
    const files = new Set(nodes.map(n => n.file)).size;
    const languages = [...new Set(nodes.map(n => n.language).filter(Boolean))] as string[];
    const byType = nodes.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return c.json({ nodes: nodeCount, edges: edgeCount, files, languages, byType });
  });

  // SPA catch-all
  return Bun.serve({
    port,
    routes: {
      "/api/*": app.fetch,
      "/*": index,
    },
    development: process.env.NODE_ENV !== "production",
  });
}

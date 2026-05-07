import { initDB } from "../store/db.ts";
import { getAllNodes, getNodeStatus } from "../store/nodes.ts";
import { getProject } from "../store/meta.ts";

const STALE_THRESHOLD_DAYS = 30;
const HOTSPOT_TOP_N = 5;

export async function runStatus(_args: string[]) {
  const root = process.cwd();
  initDB(root);

  const projectRoot = getProject("root_path") ?? root;
  const nodes = getAllNodes();

  const now = Math.floor(Date.now() / 1000);
  const daysSec = 86400;

  const staleNodes: typeof nodes = [];
  const oldNodes: typeof nodes = [];
  const freshNodes: typeof nodes = [];

  for (const node of nodes) {
    if (node.name === "__module__") {
      const status = getNodeStatus(node);
      if (status === "stale") {
        staleNodes.push(node);
      } else if (status === "fresh") {
        const daysOld = node.last_ai ? (now - node.last_ai) / daysSec : Infinity;
        if (daysOld > STALE_THRESHOLD_DAYS) {
          oldNodes.push(node);
        } else {
          freshNodes.push(node);
        }
      }
      // unknown status is counted separately below
    }
  }

  const unknownModules = nodes.filter(
    n => n.name === "__module__" && getNodeStatus(n) === "unknown"
  );

  // Print stale
  if (staleNodes.length > 0) {
    console.log("\x1b[31m🔴 STALE - AI nem látta a változást:\x1b[0m");
    for (const node of staleNodes) {
      const daysAgo = node.last_ai
        ? Math.floor((now - node.last_ai) / daysSec)
        : null;
      const when = daysAgo != null ? `módosult ${daysAgo} napja` : "ismeretlen";
      console.log(`   \x1b[31m${node.file.padEnd(50)}\x1b[0m → ${when}`);
    }
  }

  // Print old knowledge
  if (oldNodes.length > 0) {
    console.log("\n\x1b[33m🟡 RÉGI tudás (>" + STALE_THRESHOLD_DAYS + " nap):\x1b[0m");
    for (const node of oldNodes) {
      const daysOld = node.last_ai
        ? Math.floor((now - node.last_ai) / daysSec)
        : 0;
      console.log(`   \x1b[33m${node.file.padEnd(50)}\x1b[0m → ${daysOld} napja indexelve`);
    }
  }

  // Print unknown
  if (unknownModules.length > 0) {
    console.log(`\n\x1b[90m⚪ ISMERETLEN (nincs AI enrichment): ${unknownModules.length} fájl\x1b[0m`);
  }

  // Print fresh
  console.log(`\n\x1b[32m🟢 FRISS: ${freshNodes.length} fájl\x1b[0m`);

  // Top hotspots
  const hotspots = nodes
    .filter(n => n.name === "__module__" && (n.hotspot_score ?? 0) > 0)
    .sort((a, b) => (b.hotspot_score ?? 0) - (a.hotspot_score ?? 0))
    .slice(0, HOTSPOT_TOP_N);

  if (hotspots.length > 0) {
    console.log("\n\x1b[35m🔥 Top hotspot fájlok:\x1b[0m");
    for (const node of hotspots) {
      const score = ((node.hotspot_score ?? 0) * 100).toFixed(0);
      console.log(`   ${node.file.padEnd(50)} score: ${score}%  commits: ${node.commit_count ?? 0}`);
    }
  }

  // Co-change pairs from DB
  try {
    const { getDB } = await import("../store/db.ts");
    const db = getDB();
    const coChangePairs = db
      .query<{ from_id: string; to_id: string; weight: number }, []>(
        `SELECT from_id, to_id, weight FROM edges WHERE relationship = 'co_changes' ORDER BY weight DESC LIMIT 5`
      )
      .all();

    if (coChangePairs.length > 0) {
      console.log("\n\x1b[36m🔗 Legerősebb rejtett coupling:\x1b[0m");
      for (const pair of coChangePairs) {
        const fromFile = pair.from_id.replace(/^file::/, "");
        const toFile = pair.to_id.replace(/^file::/, "");
        console.log(`   ${fromFile} ↔ ${toFile}  (${pair.weight}x együtt változott)`);
      }
    }
  } catch { /* co_changes not yet computed */ }

  // Summary hint
  const needEnrich = staleNodes.length + unknownModules.length;
  if (needEnrich > 0) {
    console.log(`\n→ ${needEnrich} fájl vár enrichmentre. Futtasd: \x1b[1mnodex sync --enrich\x1b[0m`);
  } else {
    console.log("\n✓ AI tudás naprakész.");
  }
  console.log();
}

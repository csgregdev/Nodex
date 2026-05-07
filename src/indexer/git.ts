import { join } from "node:path";
import { getDB } from "../store/db.ts";
import { getAllNodes, upsertNode } from "../store/nodes.ts";
import { insertEdge } from "../store/edges.ts";

/** Minimum co-commit count to create a co_changes edge */
const DEFAULT_CO_CHANGE_THRESHOLD = 5;
/** Days to look back for hotspot calculation */
const DEFAULT_HOTSPOT_WINDOW_DAYS = 90;

// ---------------------------------------------------------------------------
// Co-change analysis
// ---------------------------------------------------------------------------

interface CoChangePair {
  fileA: string;
  fileB: string;
  count: number;
}

export async function analyzeCoChanges(
  projectRoot: string,
  threshold = DEFAULT_CO_CHANGE_THRESHOLD
): Promise<void> {
  let gitLog: string;
  try {
    gitLog = await Bun.$`git -C ${projectRoot} log --name-only --pretty=format:"COMMIT"`.text();
  } catch {
    console.warn("[nodex] git log failed — skipping co-change analysis");
    return;
  }

  // Parse: split by COMMIT marker, each block = list of changed files
  const commits = gitLog
    .split("COMMIT")
    .map(block =>
      block
        .trim()
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0)
    )
    .filter(files => files.length > 1);

  // Count co-changes
  const pairCounts = new Map<string, number>();
  for (const files of commits) {
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const a = files[i]!;
        const b = files[j]!;
        const key = [a, b].sort().join("\0");
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  // Filter by threshold and insert edges
  const db = getDB();

  // Delete existing co_changes edges
  db.run("DELETE FROM edges WHERE relationship = 'co_changes'");

  let inserted = 0;
  for (const [key, count] of pairCounts) {
    if (count < threshold) continue;
    const [fileA, fileB] = key.split("\0") as [string, string];
    insertEdge({
      from_id: `file::${fileA}`,
      to_id: `file::${fileB}`,
      relationship: "co_changes",
      weight: count,
    });
    inserted++;
  }

  console.log(`[nodex] Co-change analysis: ${inserted} pairs found (threshold: ${threshold})`);
}

// ---------------------------------------------------------------------------
// Hotspot score
// ---------------------------------------------------------------------------

interface FileHotspot {
  file: string;
  commitCount: number;
  avgComplexity: number;
  hotspotScore: number;
}

export async function computeHotspots(
  projectRoot: string,
  windowDays = DEFAULT_HOTSPOT_WINDOW_DAYS
): Promise<void> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const sinceStr = since.toISOString().split("T")[0]!;

  let gitLog: string;
  try {
    gitLog = await Bun.$`git -C ${projectRoot} log --name-only --pretty=format:"COMMIT" --since=${sinceStr}`.text();
  } catch {
    console.warn("[nodex] git log failed — skipping hotspot computation");
    return;
  }

  // Count commits per file
  const commitCounts = new Map<string, number>();
  const commits = gitLog
    .split("COMMIT")
    .map(block =>
      block
        .trim()
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0)
    );

  for (const files of commits) {
    for (const file of files) {
      commitCounts.set(file, (commitCounts.get(file) ?? 0) + 1);
    }
  }

  if (commitCounts.size === 0) return;

  // Get max commit count for normalization
  const maxCommits = Math.max(...commitCounts.values());

  // Get all module nodes with their avg complexity
  const allNodes = getAllNodes();
  const fileComplexity = new Map<string, number>();
  const fileNodeMap = new Map<string, typeof allNodes>();

  for (const node of allNodes) {
    if (!fileNodeMap.has(node.file)) fileNodeMap.set(node.file, []);
    fileNodeMap.get(node.file)!.push(node);
  }

  for (const [file, nodes] of fileNodeMap) {
    const complexities = nodes.map(n => n.complexity ?? 0).filter(c => c > 0);
    fileComplexity.set(
      file,
      complexities.length > 0
        ? complexities.reduce((s, c) => s + c, 0) / complexities.length
        : 0
    );
  }

  const maxComplexity = Math.max(...fileComplexity.values(), 1);

  // Compute and store hotspot scores on module nodes
  for (const [file, commitCount] of commitCounts) {
    const moduleNode = (fileNodeMap.get(file) ?? []).find(n => n.name === "__module__");
    if (!moduleNode) continue;

    const normalizedChurn = commitCount / maxCommits;
    const normalizedComplexity = (fileComplexity.get(file) ?? 0) / maxComplexity;
    const hotspotScore = normalizedChurn * normalizedComplexity;

    upsertNode({
      ...moduleNode,
      hotspot_score: hotspotScore,
      commit_count: commitCount,
    });
  }

  console.log(`[nodex] Hotspot scores computed for ${commitCounts.size} files`);
}

// ---------------------------------------------------------------------------
// Ownership (git blame based)
// ---------------------------------------------------------------------------

export async function getOwnership(
  projectRoot: string,
  file: string
): Promise<Record<string, number>> {
  try {
    const absPath = join(projectRoot, file);
    const blame = await Bun.$`git -C ${projectRoot} blame --line-porcelain ${absPath}`.text();
    const authorCounts = new Map<string, number>();

    for (const line of blame.split("\n")) {
      if (line.startsWith("author ")) {
        const author = line.slice(7).trim();
        authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
      }
    }

    const total = [...authorCounts.values()].reduce((s, c) => s + c, 0);
    const result: Record<string, number> = {};
    for (const [author, count] of authorCounts) {
      result[author] = Math.round((count / total) * 100);
    }
    return result;
  } catch {
    return {};
  }
}

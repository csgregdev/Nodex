import { join } from "node:path";
import { getDB } from "../store/db.ts";
import { getNodesByFile } from "../store/nodes.ts";
import { addMeta } from "../store/meta.ts";

// Inline marker pattern: // WHY: ..., // DECISION: ..., etc.
// Supports: //, #, --, /* ... */ (single line)
const MARKER_REGEX =
  /(?:\/\/|#|--)\s*(WHY|DECISION|TRADEOFF|FAILED(?:_APPROACH)?)\s*:\s*(.+)/gi;

type DecisionKey = "why" | "decision" | "tradeoff" | "failed_approach";

const MARKER_KEY_MAP: Record<string, DecisionKey> = {
  WHY: "why",
  DECISION: "decision",
  TRADEOFF: "tradeoff",
  FAILED: "failed_approach",
  FAILED_APPROACH: "failed_approach",
};

export interface InlineMarker {
  key: DecisionKey;
  value: string;
  line: number;
}

export async function scanInlineMarkers(filePath: string): Promise<InlineMarker[]> {
  try {
    const text = await Bun.file(filePath).text();
    const lines = text.split("\n");
    const results: InlineMarker[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      MARKER_REGEX.lastIndex = 0;
      const match = MARKER_REGEX.exec(line);
      if (match) {
        const rawKey = match[1]!.toUpperCase();
        const value = match[2]!.trim();
        const key = MARKER_KEY_MAP[rawKey] ?? "why";
        results.push({ key, value, line: i + 1 });
      }
    }

    return results;
  } catch {
    return [];
  }
}

/** Scan file and store markers as meta entries on the module node */
export async function indexFileDecisions(
  projectRoot: string,
  relativePath: string
): Promise<number> {
  const absPath = join(projectRoot, relativePath);
  const markers = await scanInlineMarkers(absPath);
  if (markers.length === 0) return 0;

  const nodes = getNodesByFile(relativePath);
  const moduleNode = nodes.find(n => n.name === "__module__");
  if (!moduleNode) return 0;

  // Remove existing inline decision meta for this node
  const db = getDB();
  db.run(
    "DELETE FROM meta WHERE node_id = ? AND key IN ('why','decision','tradeoff','failed_approach')",
    [moduleNode.id]
  );

  for (const marker of markers) {
    addMeta({
      node_id: moduleNode.id,
      key: marker.key,
      value: `[L${marker.line}] ${marker.value}`,
      created: Math.floor(Date.now() / 1000),
    });
  }

  return markers.length;
}

// ---------------------------------------------------------------------------
// Git commit history mining
// ---------------------------------------------------------------------------

const DECISION_KEYWORDS = [
  "why", "decision", "chose", "tradeoff", "trade-off",
  "instead of", "replaced", "reverted", "approach", "strategy",
  "because", "reason", "note:", "fix:", "refactor:",
];

export interface GitDecision {
  commitHash: string;
  message: string;
  files: string[];
  timestamp: number;
}

export async function mineGitHistory(
  projectRoot: string,
  limit = 200
): Promise<GitDecision[]> {
  try {
    const output = await Bun.$`git -C ${projectRoot} log --pretty=format:"%H\t%at\t%s" -n ${limit}`.text();
    const decisions: GitDecision[] = [];

    for (const line of output.trim().split("\n")) {
      const [hash, ts, ...msgParts] = line.split("\t");
      if (!hash || !ts) continue;
      const message = msgParts.join("\t");

      // Check if commit message contains decision keywords
      const msgLower = message.toLowerCase();
      const isDecision = DECISION_KEYWORDS.some(kw => msgLower.includes(kw));
      if (!isDecision) continue;

      // Get files changed in this commit
      let files: string[] = [];
      try {
        const filesOutput = await Bun.$`git -C ${projectRoot} diff-tree --no-commit-id -r --name-only ${hash}`.text();
        files = filesOutput.trim().split("\n").filter(Boolean);
      } catch { /* skip */ }

      decisions.push({
        commitHash: hash,
        message,
        files,
        timestamp: parseInt(ts, 10),
      });
    }

    return decisions;
  } catch {
    return [];
  }
}

/** Store git decisions as meta on affected module nodes */
export async function indexGitDecisions(projectRoot: string, limit = 200): Promise<number> {
  const decisions = await mineGitHistory(projectRoot, limit);
  let stored = 0;

  for (const dec of decisions) {
    for (const file of dec.files) {
      const nodes = getNodesByFile(file);
      const moduleNode = nodes.find(n => n.name === "__module__");
      if (!moduleNode) continue;

      addMeta({
        node_id: moduleNode.id,
        key: "git_decision",
        value: `[${dec.commitHash.slice(0, 7)}] ${dec.message}`,
        created: dec.timestamp,
      });
      stored++;
    }
  }

  return stored;
}

// ---------------------------------------------------------------------------
// Staleness check
// ---------------------------------------------------------------------------

export interface StaleDecision {
  nodeId: string;
  file: string;
  key: string;
  value: string;
  createdAt: number;
  daysSinceDecision: number;
}

export function checkDecisionStaleness(): StaleDecision[] {
  const db = getDB();
  const now = Math.floor(Date.now() / 1000);

  const rows = db
    .query<
      { node_id: string; file: string; key: string; value: string; created: number; hash: string | null; current_hash: string | null },
      []
    >(
      `SELECT m.node_id, n.file, m.key, m.value, m.created, n.hash, n.current_hash
       FROM meta m
       JOIN nodes n ON m.node_id = n.id
       WHERE m.key IN ('why','decision','tradeoff','failed_approach','git_decision')
         AND n.hash IS NOT NULL
         AND n.current_hash IS NOT NULL
         AND n.hash != n.current_hash`
    )
    .all();

  return rows.map(row => ({
    nodeId: row.node_id,
    file: row.file,
    key: row.key,
    value: row.value,
    createdAt: row.created,
    daysSinceDecision: Math.floor((now - row.created) / 86400),
  }));
}

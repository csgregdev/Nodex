import { initDB } from "../store/db.ts";
import { getDB } from "../store/db.ts";
import { getProject, addMeta } from "../store/meta.ts";
import { getAllNodes } from "../store/nodes.ts";
import { checkDecisionStaleness, indexGitDecisions } from "../indexer/decisions.ts";

const DECISION_KEYS = ["why", "decision", "tradeoff", "failed_approach", "git_decision"] as const;
type DecisionKey = typeof DECISION_KEYS[number];

export async function runDecision(args: string[]) {
  const root = process.cwd();
  initDB(root);

  const subcommand = args[0] ?? "list";

  switch (subcommand) {
    case "add":
      await decisionAdd(root, args.slice(1));
      break;
    case "list":
      await decisionList(root, args.slice(1));
      break;
    case "health":
      await decisionHealth(root);
      break;
    case "mine":
      await decisionMine(root, args.slice(1));
      break;
    default:
      console.log(`Usage:
  nodex decision add              Interaktív döntésrögzítés
  nodex decision list             Összes döntés
  nodex decision list --file <f>  Fájlhoz kötött döntések
  nodex decision health           Elavult döntések
  nodex decision mine             Git history bányászat`);
  }
}

async function decisionAdd(root: string, args: string[]) {
  const fileArg = args[args.indexOf("--file") + 1] ?? args[0];

  if (!fileArg) {
    console.error("Usage: nodex decision add --file <path> [--key decision] <text>");
    process.exit(1);
  }

  const keyArg = args.includes("--key") ? args[args.indexOf("--key") + 1] : "decision";
  const key: DecisionKey = (DECISION_KEYS as readonly string[]).includes(keyArg ?? "")
    ? (keyArg as DecisionKey)
    : "decision";

  // Text is remaining args after flags
  const textArgs = args.filter((_, i) => {
    const prev = args[i - 1];
    return !["--file", "--key"].includes(args[i]!) && !["--file", "--key"].includes(prev ?? "");
  });
  const text = textArgs.join(" ").trim();

  if (!text) {
    console.error("Provide decision text after flags.");
    process.exit(1);
  }

  const nodes = getAllNodes().filter(n => n.file === fileArg && n.name === "__module__");
  if (nodes.length === 0) {
    console.error(`No module node found for: ${fileArg}`);
    process.exit(1);
  }

  const nodeId = nodes[0]!.id;
  addMeta({ node_id: nodeId, key, value: text, created: Math.floor(Date.now() / 1000) });
  console.log(`✓ Rögzítve [${key}] → ${fileArg}`);
}

async function decisionList(root: string, args: string[]) {
  const db = getDB();
  const fileFilter = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;

  let query = `SELECT m.node_id, n.file, m.key, m.value, m.created
               FROM meta m JOIN nodes n ON m.node_id = n.id
               WHERE m.key IN ('why','decision','tradeoff','failed_approach','git_decision')`;
  const params: string[] = [];

  if (fileFilter) {
    query += " AND n.file = ?";
    params.push(fileFilter);
  }

  query += " ORDER BY n.file, m.created DESC";

  const rows = db
    .query<{ node_id: string; file: string; key: string; value: string; created: number }, string[]>(query)
    .all(...params);

  if (rows.length === 0) {
    console.log("Nincs rögzített döntés.");
    return;
  }

  let currentFile = "";
  for (const row of rows) {
    if (row.file !== currentFile) {
      currentFile = row.file;
      console.log(`\n\x1b[1m${row.file}\x1b[0m`);
    }
    const date = new Date(row.created * 1000).toISOString().split("T")[0];
    const keyColor = row.key === "decision" ? "\x1b[32m" : row.key === "tradeoff" ? "\x1b[33m" : row.key === "failed_approach" ? "\x1b[31m" : "\x1b[36m";
    console.log(`  ${keyColor}[${row.key}]\x1b[0m ${row.value}  \x1b[90m(${date})\x1b[0m`);
  }
  console.log();
}

async function decisionHealth(root: string) {
  const stale = checkDecisionStaleness();

  if (stale.length === 0) {
    console.log("✓ Minden döntés naprakész.");
    return;
  }

  console.log(`\n\x1b[33m⚠ Elavult döntések (fájl változott rögzítés óta):\x1b[0m\n`);
  for (const d of stale) {
    console.log(`  \x1b[33m${d.file}\x1b[0m`);
    console.log(`    [${d.key}] ${d.value.slice(0, 80)}${d.value.length > 80 ? "..." : ""}`);
    console.log(`    \x1b[90mRögzítve: ${d.daysSinceDecision} napja — fájl azóta változott\x1b[0m`);
  }
  console.log(`\n→ ${stale.length} döntés felülvizsgálata javasolt.\n`);
}

async function decisionMine(root: string, args: string[]) {
  const limit = parseInt(args[0] ?? "200", 10);
  console.log(`\nnodex decision mine: Git history feldolgozása (${limit} commit)...`);
  const stored = await indexGitDecisions(root, limit);
  console.log(`✓ ${stored} git döntés indexelve.\n`);
}

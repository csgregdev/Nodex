import { initDB } from "../store/db.ts";
import { searchNodes } from "../store/nodes.ts";

export async function runSearch(args: string[]) {
  const query = args.join(" ");
  if (!query) {
    console.log("Usage: nodex search <query>");
    return;
  }

  const root = process.cwd();
  initDB(root);

  const results = searchNodes(query, 20);

  if (results.length === 0) {
    console.log(`No results for: ${query}`);
    return;
  }

  console.log(`Results for: ${query}\n`);
  for (const node of results) {
    console.log(`  ${node.id}`);
    console.log(`    ${node.token ?? node.name} [${node.language}]`);
    console.log(`    ${node.file}:${node.line ?? "?"}`);
    console.log();
  }
}

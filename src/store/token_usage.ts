import { getDB } from "./db.ts";

export interface TokenUsageEntry {
  id?: number;
  node_id?: string | null;
  file?: string | null;
  operation: string;
  input_tokens: number;
  output_tokens: number;
  model?: string | null;
  created: number;
}

export interface TokenUsageSummary {
  total_input: number;
  total_output: number;
  total_calls: number;
  by_operation: Record<string, { input: number; output: number; calls: number }>;
}


export function logTokenUsage(entry: Omit<TokenUsageEntry, "id" | "created">): void {
  const db = getDB();
  db.run(
    `INSERT INTO token_usage (node_id, file, operation, input_tokens, output_tokens, model, created)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.node_id ?? null,
      entry.file ?? null,
      entry.operation,
      entry.input_tokens,
      entry.output_tokens,
      entry.model ?? null,
      Math.floor(Date.now() / 1000),
    ]
  );
}

export function getTokenSummary(sinceSec?: number): TokenUsageSummary {
  const db = getDB();
  const where = sinceSec ? `WHERE created >= ${sinceSec}` : "";

  const rows = db
    .query<
      { operation: string; model: string | null; input_tokens: number; output_tokens: number },
      []
    >(`SELECT operation, model, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens
       FROM token_usage ${where}
       GROUP BY operation, model`)
    .all();

  const summary: TokenUsageSummary = {
    total_input: 0,
    total_output: 0,
    total_calls: 0,
    by_operation: {},
  };

  for (const row of rows) {
    summary.total_input += row.input_tokens;
    summary.total_output += row.output_tokens;
    const op = row.operation;
    if (!summary.by_operation[op]) {
      summary.by_operation[op] = { input: 0, output: 0, calls: 0 };
    }
    summary.by_operation[op]!.input += row.input_tokens;
    summary.by_operation[op]!.output += row.output_tokens;
    summary.by_operation[op]!.calls += 1;
  }

  // Count total calls
  const callCount = db
    .query<{ c: number }, []>(`SELECT COUNT(*) as c FROM token_usage ${where}`)
    .get();
  summary.total_calls = callCount?.c ?? 0;

  return summary;
}

export function getTokenByFile(sinceSec?: number, limit = 20): Array<{
  file: string;
  input_tokens: number;
  output_tokens: number;
  calls: number;
}> {
  const db = getDB();
  const where = sinceSec ? `WHERE file IS NOT NULL AND created >= ${sinceSec}` : "WHERE file IS NOT NULL";

  const rows = db
    .query<
      { file: string; input_tokens: number; output_tokens: number; calls: number },
      [number]
    >(
      `SELECT file,
              SUM(input_tokens) as input_tokens,
              SUM(output_tokens) as output_tokens,
              COUNT(*) as calls
       FROM token_usage ${where}
       GROUP BY file
       ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC
       LIMIT ?`
    )
    .all(limit);

  return rows;
}

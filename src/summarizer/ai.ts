import Anthropic from "@anthropic-ai/sdk";
import type { Node } from "../store/nodes.ts";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface ModuleSummaryResult {
  summary: string;        // human-readable
  token: string;          // caveman format
  gotchas: string[];      // potential issues
  aiDecisions: string[];  // design decisions noted
}

// Summarize a single module (file) based on its symbols
export async function summarizeModule(
  file: string,
  language: string,
  nodes: Node[],
  sourceSnippet: string, // first ~100 lines of the source
): Promise<ModuleSummaryResult> {
  const claude = getClient();

  const symbolList = nodes
    .filter(n => !n.id.endsWith("::__module__"))
    .map(n => `  ${n.type}: ${n.token ?? n.name} (line ${n.line})`)
    .join("\n");

  const prompt = `You are analyzing a ${language} source file for a code knowledge graph.

File: ${file}
Symbols found:
${symbolList}

Source (first 100 lines):
\`\`\`${language}
${sourceSnippet}
\`\`\`

Respond in JSON with this exact structure:
{
  "summary": "1-2 sentence description of what this module does",
  "token": "caveman token: [ModuleName]|purpose:X|exports:A,B,C",
  "gotchas": ["potential issue or footgun", "another if any"],
  "aiDecisions": ["notable design decision", "another if any"]
}

Token format rules:
- [ModuleName] = filename without extension
- purpose: very short (2-3 words max)
- exports: top 3-5 exported names only
- Max 80 chars total
- No filler words

Keep gotchas and aiDecisions arrays empty [] if none found. Max 2 items each.`;

  const response = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { summary: "", token: "", gotchas: [], aiDecisions: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ModuleSummaryResult>;
    return {
      summary: parsed.summary ?? "",
      token: parsed.token ?? "",
      gotchas: parsed.gotchas ?? [],
      aiDecisions: parsed.aiDecisions ?? [],
    };
  } catch {
    return { summary: "", token: "", gotchas: [], aiDecisions: [] };
  }
}

// Batch summarize multiple modules with rate limiting
export async function* summarizeModules(
  modules: Array<{ file: string; language: string; nodes: Node[]; sourceSnippet: string }>,
  concurrency = 3,
): AsyncGenerator<{ file: string; result: ModuleSummaryResult }> {
  // Process in batches to respect rate limits
  for (let i = 0; i < modules.length; i += concurrency) {
    const batch = modules.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(m => summarizeModule(m.file, m.language, m.nodes, m.sourceSnippet))
    );

    for (let j = 0; j < batch.length; j++) {
      const m = batch[j]!;
      const result = results[j]!;
      if (result.status === "fulfilled") {
        yield { file: m.file, result: result.value };
      } else {
        console.error(`AI summary failed for ${m.file}:`, result.reason);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + concurrency < modules.length) {
      await Bun.sleep(500);
    }
  }
}

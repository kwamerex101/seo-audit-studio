// Unified Claude client. Primary backend: claude_local_api (local FastAPI wrapping
// the Claude Code CLI — no API key required). Falls back to deterministic-only
// scoring if the local API is unreachable.
//
// Local API: /Users/rexdanquah/Projects/claude_local_api
//   POST /query/sdk  (or /query/subprocess)
//   Body: { prompt: string, system?: string, max_turns: number, stream: boolean }
//   Non-stream response: { result, session_id, usage, provider }
//   Stream response: text/plain chunks

const DEFAULT_BASE = "http://localhost:8765";
const DEFAULT_PROVIDER = "subprocess"; // subprocess | sdk

function baseUrl(): string {
  return (process.env.CLAUDE_LOCAL_API_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

function provider(): string {
  return process.env.CLAUDE_LOCAL_PROVIDER ?? DEFAULT_PROVIDER;
}

let healthCache: { at: number; healthy: boolean } | null = null;

export async function isClaudeAvailable(): Promise<boolean> {
  if (process.env.CLAUDE_LOCAL_DISABLED === "1") return false;
  const now = Date.now();
  if (healthCache && now - healthCache.at < 30_000) {
    return healthCache.healthy;
  }
  try {
    const res = await fetch(`${baseUrl()}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    const ok = res.ok;
    healthCache = { at: now, healthy: ok };
    return ok;
  } catch {
    healthCache = { at: now, healthy: false };
    return false;
  }
}

export async function claudeText(args: {
  prompt: string;
  system?: string;
  maxTurns?: number;
  timeoutMs?: number;
}): Promise<string> {
  const res = await fetch(`${baseUrl()}/query/${provider()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: args.prompt,
      system: args.system,
      max_turns: args.maxTurns ?? 1,
      stream: false,
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`claude_local_api ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { result?: string };
  return String(json.result ?? "");
}

export async function* claudeStream(args: {
  prompt: string;
  system?: string;
  maxTurns?: number;
  timeoutMs?: number;
}): AsyncIterable<string> {
  const res = await fetch(`${baseUrl()}/query/${provider()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: args.prompt,
      system: args.system,
      max_turns: args.maxTurns ?? 1,
      stream: true,
    }),
    signal: AbortSignal.timeout(args.timeoutMs ?? 180_000),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`claude_local_api ${res.status}: ${detail.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (!chunk) continue;
    // The provider streams plain text. Strip the trailing "[done:<session_id>]" marker if present.
    const cleaned = chunk.replace(/\n?\[done:[^\]]*\]\s*$/, "");
    if (cleaned) yield cleaned;
  }
}

/**
 * Extract a JSON object from a text response. The local API is a plain-text
 * channel; we ask the model to emit JSON only, but we tolerate fenced code
 * blocks and surrounding whitespace.
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  // Strip markdown fences if any
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  // Find the first { and the last } — naive but works for clean responses.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    return null;
  }
}

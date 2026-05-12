// Unified AI client with provider fallback chain.
//
// Primary:   Osaurus           — http://127.0.0.1:1337 (OpenAI-compatible, local)
//            Docs: https://docs.osaurus.ai
//
// Fallback1: claude_cli        — direct subprocess call to `claude` CLI
//            Uses Claude Code subscription. Model selectable in settings.
//
// Fallback2: claude_local_api  — http://localhost:8765 (HTTP wrapper around Claude CLI)
//            Project: /Users/rexdanquah/Projects/claude_local_api
//
// Fallback3: cursor-api        — http://localhost:7878 (OpenAI-compatible, Cursor Agent CLI)
//            Project: /Users/rexdanquah/Projects/cursor-api

import { spawn } from "node:child_process";
//
// On a provider failure (timeout, 5xx, network), we retry with exponential backoff,
// then fall through to the next provider. If all providers fail, callers get null
// and the audit completes with deterministic-only scoring + the failed URL recorded
// in `ai_failed_urls`.

const OSAURUS_DEFAULT_BASE = "http://127.0.0.1:1337";
const OSAURUS_DEFAULT_MODEL = "foundation";
const CLAUDE_DEFAULT_BASE = "http://localhost:8765";
const CLAUDE_DEFAULT_PROVIDER = "subprocess";
const CURSOR_DEFAULT_BASE = "http://localhost:7878";

function osaurusBase(): string {
  return (process.env.OSAURUS_API_URL ?? OSAURUS_DEFAULT_BASE).replace(
    /\/$/,
    "",
  );
}

function osaurusKey(): string | null {
  const k = (process.env.OSAURUS_API_KEY ?? "").trim();
  return k.length ? k : null;
}

function osaurusModel(): string {
  return process.env.OSAURUS_MODEL ?? OSAURUS_DEFAULT_MODEL;
}

function claudeBase(): string {
  return (process.env.CLAUDE_LOCAL_API_URL ?? CLAUDE_DEFAULT_BASE).replace(
    /\/$/,
    "",
  );
}

function claudeProvider(): string {
  return process.env.CLAUDE_LOCAL_PROVIDER ?? CLAUDE_DEFAULT_PROVIDER;
}

function cursorBase(): string {
  return (process.env.CURSOR_API_URL ?? CURSOR_DEFAULT_BASE).replace(/\/$/, "");
}

function cursorToken(): string | null {
  const t = (process.env.CURSOR_API_TOKEN ?? "").trim();
  return t.length ? t : null;
}

function cursorModel(): string {
  return process.env.CURSOR_API_MODEL ?? "auto";
}

type Health = { at: number; healthy: boolean };
const healthCache = new Map<string, Health>();
const HEALTH_TTL = 30_000;

async function pingHealth(url: string): Promise<boolean> {
  const cached = healthCache.get(url);
  const now = Date.now();
  if (cached && now - cached.at < HEALTH_TTL) return cached.healthy;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    const ok = res.ok;
    healthCache.set(url, { at: now, healthy: ok });
    return ok;
  } catch {
    healthCache.set(url, { at: now, healthy: false });
    return false;
  }
}

async function isOsaurusAvailable(): Promise<boolean> {
  if (process.env.OSAURUS_DISABLED === "1") return false;
  // Osaurus is OpenAI-compatible; /v1/models is the standard liveness probe.
  return pingHealth(`${osaurusBase()}/v1/models`);
}

export async function isClaudeAvailable(): Promise<boolean> {
  if (process.env.CLAUDE_LOCAL_DISABLED === "1") return false;
  return pingHealth(`${claudeBase()}/health`);
}

async function isCursorAvailable(): Promise<boolean> {
  if (process.env.CURSOR_API_DISABLED === "1") return false;
  return pingHealth(`${cursorBase()}/healthz`);
}

// --- Claude CLI (direct subprocess) ---

const CLAUDE_CLI_BIN_DEFAULT = "claude";

function claudeCliBin(): string {
  return process.env.CLAUDE_CLI_BIN ?? CLAUDE_CLI_BIN_DEFAULT;
}

async function getClaudeCliModel(): Promise<string> {
  try {
    const { getSettings } = await import("../storage/settings");
    const s = await getSettings();
    return s.claude_cli_model && s.claude_cli_model !== "default" ? s.claude_cli_model : "sonnet";
  } catch {
    return process.env.CLAUDE_CLI_MODEL ?? "sonnet";
  }
}

const claudeCliHealthCache = { at: 0, healthy: false };
async function isClaudeCliAvailable(): Promise<boolean> {
  if (process.env.CLAUDE_CLI_DISABLED === "1") return false;
  const now = Date.now();
  if (now - claudeCliHealthCache.at < HEALTH_TTL) return claudeCliHealthCache.healthy;
  const healthy = await new Promise<boolean>((resolve) => {
    try {
      const child = spawn(claudeCliBin(), ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      const t = setTimeout(() => {
        child.kill();
        resolve(false);
      }, 2000);
      child.on("close", (code) => {
        clearTimeout(t);
        resolve(code === 0);
      });
      child.on("error", () => {
        clearTimeout(t);
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
  claudeCliHealthCache.at = now;
  claudeCliHealthCache.healthy = healthy;
  return healthy;
}

function buildClaudeCliArgs(opts: { model: string; system?: string; stream: boolean }): string[] {
  // Pure text Q&A: no tool use, no hooks, no side effects.
  // We deny every agentic tool — the CLI will run as a stateless text completion.
  // (We can't use --bare since it disables OAuth; the user is signed in via Claude Code.)
  const args = [
    "-p",
    "--model",
    opts.model,
    "--disallowedTools",
    "Read Write Edit Bash Glob Grep Task WebFetch WebSearch NotebookEdit TodoWrite",
  ];
  if (opts.stream) {
    args.push("--output-format", "stream-json", "--verbose");
  } else {
    args.push("--output-format", "text");
  }
  if (opts.system?.trim()) {
    args.push("--append-system-prompt", opts.system.trim());
  }
  return args;
}

async function callClaudeCliOnce(args: {
  prompt: string;
  system?: string;
  timeoutMs: number;
}): Promise<string> {
  const model = await getClaudeCliModel();
  return new Promise<string>((resolve, reject) => {
    const child = spawn(claudeCliBin(), buildClaudeCliArgs({ model, system: args.system, stream: false }), {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLAUDE_CODE_SIMPLE: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000);
      reject(new Error(`claude_cli timeout after ${args.timeoutMs}ms`));
    }, args.timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`claude_cli spawn: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude_cli exit ${code}: ${stderr.slice(0, 300) || stdout.slice(0, 300)}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.write(args.prompt);
    child.stdin.end();
  });
}

async function* streamClaudeCli(args: {
  prompt: string;
  system?: string;
  timeoutMs: number;
}): AsyncIterable<string> {
  const model = await getClaudeCliModel();
  const child = spawn(claudeCliBin(), buildClaudeCliArgs({ model, system: args.system, stream: true }), {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, CLAUDE_CODE_SIMPLE: "1" },
  });

  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2000);
  }, args.timeoutMs);

  child.stdin.write(args.prompt);
  child.stdin.end();

  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));

  const queue: string[] = [];
  let resolveWait: (() => void) | null = null;
  let finished = false;
  let errorMsg: string | null = null;
  let emittedSoFar = "";

  function notify() {
    if (resolveWait) {
      const r = resolveWait;
      resolveWait = null;
      r();
    }
  }

  let buffer = "";
  child.stdout.on("data", (d) => {
    buffer += d.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line) as {
          type?: string;
          message?: { content?: Array<{ type?: string; text?: string }> };
        };
        if (obj.type === "assistant" && obj.message?.content) {
          // Each assistant event re-emits the full text accumulated so far.
          // Extract incremental delta.
          const full = obj.message.content
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join("");
          if (full.startsWith(emittedSoFar)) {
            const delta = full.slice(emittedSoFar.length);
            if (delta) {
              queue.push(delta);
              emittedSoFar = full;
              notify();
            }
          } else if (full && full !== emittedSoFar) {
            // Fallback: re-emit (shouldn't normally happen)
            queue.push(full);
            emittedSoFar = full;
            notify();
          }
        }
      } catch {
        // not JSON — ignore
      }
    }
  });

  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0 && !emittedSoFar) {
      errorMsg = `claude_cli exit ${code}: ${stderr.slice(0, 300)}`;
    }
    finished = true;
    notify();
  });
  child.on("error", (err) => {
    clearTimeout(timer);
    errorMsg = `claude_cli spawn: ${err.message}`;
    finished = true;
    notify();
  });

  while (true) {
    if (queue.length) {
      yield queue.shift()!;
      continue;
    }
    if (finished) {
      if (errorMsg) throw new Error(errorMsg);
      return;
    }
    await new Promise<void>((r) => (resolveWait = r));
  }
}

export async function isAnyAiAvailable(): Promise<boolean> {
  const [osaurus, claudeCli, claude, cursor] = await Promise.all([
    isOsaurusAvailable(),
    isClaudeCliAvailable(),
    isClaudeAvailable(),
    isCursorAvailable(),
  ]);
  return osaurus || claudeCli || claude || cursor;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /timeout|abort|ECONN|EPIPE|fetch failed|429|5\d\d/i.test(msg) || true
  ); // treat all errors as transient — we want the fallback chain anyway
}

function newRequestId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
    .toString()
    .replace(/-/g, "")
    .slice(0, 8);
}

type ClaudeApiError = Error & {
  requestId: string;
  status?: number;
  category?: string;
  bodyPreview?: string;
};

function makeClaudeApiError(opts: {
  requestId: string;
  status?: number;
  category?: string;
  bodyPreview?: string;
  message: string;
}): ClaudeApiError {
  const err = new Error(opts.message) as ClaudeApiError;
  err.name = "ClaudeApiError";
  err.requestId = opts.requestId;
  err.status = opts.status;
  err.category = opts.category;
  err.bodyPreview = opts.bodyPreview;
  return err;
}

async function callClaudeOnce(args: {
  prompt: string;
  system?: string;
  maxTurns: number;
  timeoutMs: number;
  requestId: string;
}): Promise<string> {
  const url = `${claudeBase()}/query/${claudeProvider()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": args.requestId,
    },
    body: JSON.stringify({
      prompt: args.prompt,
      system: args.system,
      max_turns: args.maxTurns,
      stream: false,
    }),
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    let category: string | undefined;
    let serverMessage = bodyText;
    try {
      const parsed = JSON.parse(bodyText) as {
        error?: string;
        category?: string;
        request_id?: string;
      };
      if (parsed.error) serverMessage = parsed.error;
      if (parsed.category) category = parsed.category;
    } catch {
      // not JSON — keep raw text
    }
    throw makeClaudeApiError({
      requestId: args.requestId,
      status: res.status,
      category,
      bodyPreview: bodyText.slice(0, 500),
      message: `claude_local_api ${res.status}${category ? ` [${category}]` : ""}: ${serverMessage.slice(0, 200)}`,
    });
  }
  const json = (await res.json()) as { result?: string };
  return String(json.result ?? "");
}

async function callOsaurusOnce(args: {
  prompt: string;
  system?: string;
  timeoutMs: number;
}): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const key = osaurusKey();
  if (key) headers.authorization = `Bearer ${key}`;
  const messages: Array<{ role: string; content: string }> = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  messages.push({ role: "user", content: args.prompt });

  const res = await fetch(`${osaurusBase()}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: osaurusModel(),
      messages,
      stream: false,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`osaurus ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  return String(text);
}

async function callCursorOnce(args: {
  prompt: string;
  system?: string;
  timeoutMs: number;
}): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const tok = cursorToken();
  if (tok) headers.authorization = `Bearer ${tok}`;
  const messages: Array<{ role: string; content: string }> = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  messages.push({ role: "user", content: args.prompt });

  const res = await fetch(`${cursorBase()}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cursorModel(),
      messages,
      stream: false,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`cursor-api ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  return String(text);
}

async function withRetries<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseDelayMs: number; label: string },
): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= opts.retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const last = attempt === opts.retries;
      const wait = opts.baseDelayMs * Math.pow(3, attempt); // 3s, 9s, 27s
      console.warn(
        `[ai] ${opts.label} attempt ${attempt + 1}/${opts.retries + 1} failed: ${
          err instanceof Error ? err.message : String(err)
        }${last ? "" : ` — retrying in ${wait}ms`}`,
      );
      if (last) break;
      if (!isTransientError(err)) break;
      await sleep(wait);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export type AiTextResult = {
  text: string;
  provider: "osaurus" | "claude_cli" | "claude" | "cursor";
};

type ProviderId = "osaurus" | "claude_cli" | "claude" | "cursor";

async function tryProvider(
  id: ProviderId,
  args: { prompt: string; system?: string; maxTurns: number; timeoutMs: number },
): Promise<string | null> {
  if (id === "osaurus") {
    if (!(await isOsaurusAvailable())) return null;
    try {
      return await withRetries(
        () => callOsaurusOnce({ prompt: args.prompt, system: args.system, timeoutMs: args.timeoutMs }),
        { retries: 1, baseDelayMs: 3_000, label: "osaurus" },
      );
    } catch (err) {
      console.warn(
        `[ai] osaurus exhausted: ${err instanceof Error ? err.message : String(err)}`,
      );
      healthCache.set(`${osaurusBase()}/v1/models`, { at: Date.now(), healthy: false });
      return null;
    }
  }
  if (id === "claude_cli") {
    if (!(await isClaudeCliAvailable())) return null;
    try {
      return await withRetries(
        () => callClaudeCliOnce({ prompt: args.prompt, system: args.system, timeoutMs: args.timeoutMs }),
        { retries: 1, baseDelayMs: 3_000, label: "claude_cli" },
      );
    } catch (err) {
      console.warn(
        `[ai] claude_cli exhausted: ${err instanceof Error ? err.message : String(err)}`,
      );
      claudeCliHealthCache.healthy = false;
      claudeCliHealthCache.at = Date.now();
      return null;
    }
  }
  if (id === "claude") {
    if (!(await isClaudeAvailable())) return null;
    const requestId = newRequestId();
    try {
      return await withRetries(
        () => callClaudeOnce({ ...args, requestId }),
        { retries: 1, baseDelayMs: 3_000, label: `claude rid=${requestId}` },
      );
    } catch (err) {
      console.warn(
        `[ai] claude_local_api exhausted rid=${requestId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      healthCache.set(`${claudeBase()}/health`, { at: Date.now(), healthy: false });
      return null;
    }
  }
  if (id === "cursor") {
    if (!(await isCursorAvailable())) return null;
    try {
      return await withRetries(
        () => callCursorOnce({ prompt: args.prompt, system: args.system, timeoutMs: args.timeoutMs }),
        { retries: 1, baseDelayMs: 3_000, label: "cursor" },
      );
    } catch (err) {
      console.warn(
        `[ai] cursor-api exhausted: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
  return null;
}

async function effectiveProviderOrder(): Promise<ProviderId[]> {
  // Read settings lazily so the AI client can be imported safely in any context.
  // If settings can't be loaded, fall back to the hardcoded default.
  try {
    const { getSettings } = await import("../storage/settings");
    const s = await getSettings();
    return s.ai_provider_order.filter((p) => s.ai_provider_enabled[p]) as ProviderId[];
  } catch {
    return ["osaurus", "claude_cli", "claude", "cursor"];
  }
}

/**
 * Tries each AI provider in the order configured in settings.
 * Each provider gets up to 2 retries with exponential backoff (3s, 9s) before falling through.
 */
export async function aiText(args: {
  prompt: string;
  system?: string;
  maxTurns?: number;
  /** Per-attempt timeout. Default 180s. */
  timeoutMs?: number;
}): Promise<AiTextResult | null> {
  const timeoutMs = args.timeoutMs ?? 180_000;
  const maxTurns = args.maxTurns ?? 1;
  const order = await effectiveProviderOrder();

  for (const id of order) {
    const text = await tryProvider(id, {
      prompt: args.prompt,
      system: args.system,
      maxTurns,
      timeoutMs,
    });
    if (text !== null) return { text, provider: id };
  }
  return null;
}

/** Convenience: returns text or null. Used by scoring/narrative which both need a string. */
export async function claudeText(args: {
  prompt: string;
  system?: string;
  maxTurns?: number;
  timeoutMs?: number;
}): Promise<string> {
  const result = await aiText(args);
  if (!result) {
    throw new Error("All AI providers unavailable or exhausted");
  }
  return result.text;
}

async function* streamOsaurus(args: { prompt: string; system?: string; timeoutMs: number }): AsyncIterable<string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = osaurusKey();
  if (key) headers.authorization = `Bearer ${key}`;
  const messages: Array<{ role: string; content: string }> = [];
  if (args.system) messages.push({ role: "system", content: args.system });
  messages.push({ role: "user", content: args.prompt });
  const res = await fetch(`${osaurusBase()}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: osaurusModel(),
      messages,
      stream: true,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  if (!res.ok || !res.body) {
    const bodyText = res.body ? await res.text().catch(() => "") : "";
    throw new Error(`osaurus ${res.status}: ${bodyText.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const piece = obj.choices?.[0]?.delta?.content;
        if (piece) yield piece;
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
}

async function* streamClaude(args: { prompt: string; system?: string; maxTurns: number; timeoutMs: number }): AsyncIterable<string> {
  const requestId = newRequestId();
  const res = await fetch(`${claudeBase()}/query/${claudeProvider()}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      prompt: args.prompt,
      system: args.system,
      max_turns: args.maxTurns,
      stream: true,
    }),
    signal: AbortSignal.timeout(args.timeoutMs),
  });
  if (!res.ok || !res.body) {
    const bodyText = res.body ? await res.text().catch(() => "") : "";
    throw new Error(`claude_local_api ${res.status} rid=${requestId}: ${bodyText.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (!chunk) continue;
    const cleaned = chunk.replace(/\n?\[done:[^\]]*\]\s*$/, "");
    if (cleaned) yield cleaned;
  }
}

async function* streamCursor(args: { prompt: string; system?: string; timeoutMs: number }): AsyncIterable<string> {
  // Cursor: non-streaming fallback yielded as one chunk.
  const text = await callCursorOnce({ prompt: args.prompt, system: args.system, timeoutMs: args.timeoutMs });
  if (text) yield text;
}

/**
 * Stream text from AI providers in the configured order. Yields text chunks
 * for the chat panel. Falls through providers on error/unavailable.
 */
export async function* claudeStream(args: {
  prompt: string;
  system?: string;
  maxTurns?: number;
  timeoutMs?: number;
}): AsyncIterable<string> {
  const timeoutMs = args.timeoutMs ?? 180_000;
  const maxTurns = args.maxTurns ?? 1;
  const order = await effectiveProviderOrder();

  for (const id of order) {
    try {
      if (id === "osaurus") {
        if (!(await isOsaurusAvailable())) continue;
        let yielded = false;
        for await (const chunk of streamOsaurus({ prompt: args.prompt, system: args.system, timeoutMs })) {
          yielded = true;
          yield chunk;
        }
        if (yielded) return;
      } else if (id === "claude_cli") {
        if (!(await isClaudeCliAvailable())) continue;
        let yielded = false;
        for await (const chunk of streamClaudeCli({ prompt: args.prompt, system: args.system, timeoutMs })) {
          yielded = true;
          yield chunk;
        }
        if (yielded) return;
      } else if (id === "claude") {
        if (!(await isClaudeAvailable())) continue;
        let yielded = false;
        for await (const chunk of streamClaude({ prompt: args.prompt, system: args.system, maxTurns, timeoutMs })) {
          yielded = true;
          yield chunk;
        }
        if (yielded) return;
      } else if (id === "cursor") {
        if (!(await isCursorAvailable())) continue;
        let yielded = false;
        for await (const chunk of streamCursor({ prompt: args.prompt, system: args.system, timeoutMs })) {
          yielded = true;
          yield chunk;
        }
        if (yielded) return;
      }
    } catch (err) {
      console.warn(
        `[ai] ${id} stream failed, trying next provider: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  yield "AI providers unavailable. Check Settings → AI provider order. Available providers: Osaurus :1337, claude CLI (direct), claude_local_api :8765, cursor-api :7878.";
}

/**
 * Extract a JSON object from a text response. Models sometimes wrap output in
 * code fences or add trailing commentary; this is tolerant.
 */
export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
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

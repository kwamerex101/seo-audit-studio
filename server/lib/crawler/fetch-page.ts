export type FetchResult = {
  url: string;
  finalUrl: string;
  status: number;
  body: string | null;
  contentType: string | null;
};

const USER_AGENT =
  "seo-audit-studio/0.1 (+https://github.com/rexdanquah/seo-audit-studio)";

export async function fetchUrl(
  url: string,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRetries = opts.retries ?? 2;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent": USER_AGENT,
            accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        const status = res.status;
        const contentType = res.headers.get("content-type");
        let body: string | null = null;
        if (
          status >= 200 &&
          status < 300 &&
          contentType &&
          /text\/|xml|json/i.test(contentType)
        ) {
          body = await res.text();
        } else {
          await res.arrayBuffer();
        }
        if (status >= 500 && attempt < maxRetries) {
          const wait = 500 * Math.pow(2, attempt);
          await sleep(wait);
          continue;
        }
        return {
          url,
          finalUrl: res.url || url,
          status,
          body,
          contentType,
        };
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
    }
  }
  throw new Error(
    `Failed to fetch ${url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}

export async function headStatus(url: string): Promise<number> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT },
    });
    clearTimeout(t);
    return res.status;
  } catch {
    return 0;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PoliteQueue {
  private readonly delayMs: number;
  private readonly concurrency: number;
  private readonly lastFetchByHost = new Map<string, number>();
  private inflight = 0;
  private queue: Array<() => void> = [];

  constructor(opts: { delayMs?: number; concurrency?: number } = {}) {
    this.delayMs = opts.delayMs ?? 1500;
    this.concurrency = opts.concurrency ?? 4;
  }

  async run<T>(url: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const host = safeHost(url);
      const last = this.lastFetchByHost.get(host) ?? 0;
      const wait = Math.max(0, last + this.delayMs - Date.now());
      if (wait > 0) await sleep(wait);
      this.lastFetchByHost.set(host, Date.now());
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.inflight < this.concurrency) {
      this.inflight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.inflight += 1;
        resolve();
      });
    });
  }

  private release() {
    this.inflight -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

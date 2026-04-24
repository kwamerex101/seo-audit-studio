import { parseStringPromise } from "xml2js";
import { fetchUrl } from "./fetch-page";
import type { SiteSignals } from "./types";

export async function discoverUrls(
  rootUrl: string,
  opts: { maxUrls?: number; bfsFallbackCap?: number } = {},
): Promise<{ urls: string[]; site: SiteSignals }> {
  // maxUrls <= 0 or undefined → no cap on sitemap URLs. BFS fallback has its own safety cap.
  const rawMax = opts.maxUrls;
  const sitemapCap =
    rawMax === undefined || rawMax <= 0 ? Number.POSITIVE_INFINITY : rawMax;
  const bfsCap = opts.bfsFallbackCap ?? 50;
  const origin = new URL(rootUrl).origin;
  const site: SiteSignals = {
    robots_txt: { present: false, blocks_all: false, sitemaps: [] },
    sitemap: { present: false, valid: false, urls: [] },
    llms_txt: false,
  };

  const robots = await safeFetch(`${origin}/robots.txt`);
  if (robots && robots.status >= 200 && robots.status < 300 && robots.body) {
    site.robots_txt.present = true;
    site.robots_txt.blocks_all = detectBlocksAll(robots.body);
    site.robots_txt.sitemaps = extractSitemapDirectives(robots.body);
  }

  const llms = await safeFetch(`${origin}/llms.txt`);
  if (llms && llms.status >= 200 && llms.status < 300) site.llms_txt = true;

  const candidates = site.robots_txt.sitemaps.length
    ? site.robots_txt.sitemaps
    : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

  const urls = new Set<string>();
  for (const sm of candidates) {
    if (urls.size >= sitemapCap) break;
    const budget =
      sitemapCap === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : sitemapCap - urls.size;
    const found = await fetchSitemap(sm, budget);
    if (found.valid) {
      site.sitemap.present = true;
      site.sitemap.valid = true;
    }
    for (const u of found.urls) {
      urls.add(u);
      if (urls.size >= sitemapCap) break;
    }
  }

  if (urls.size === 0) {
    const bfsUrls = await bfsCrawl(rootUrl, Math.min(bfsCap, sitemapCap));
    for (const u of bfsUrls) urls.add(u);
  }
  if (urls.size === 0) urls.add(rootUrl);

  const sameOrigin = Array.from(urls).filter((u) => {
    try {
      return new URL(u).origin === origin;
    } catch {
      return false;
    }
  });
  site.sitemap.urls = sameOrigin;

  const cap =
    sitemapCap === Number.POSITIVE_INFINITY ? sameOrigin.length : sitemapCap;
  return { urls: sameOrigin.slice(0, cap), site };
}

async function bfsCrawl(rootUrl: string, maxUrls: number): Promise<string[]> {
  const origin = new URL(rootUrl).origin;
  const found = new Set<string>();
  found.add(rootUrl);
  const res = await safeFetch(rootUrl);
  if (!res || !res.body) return Array.from(found);
  const links = extractHrefs(res.body, rootUrl);
  for (const href of links) {
    if (found.size >= maxUrls) break;
    try {
      const u = new URL(href);
      if (u.origin !== origin) continue;
      u.hash = "";
      const clean = u.toString();
      if (clean.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|webp|css|js)$/i))
        continue;
      found.add(clean);
    } catch {
      // skip malformed
    }
  }
  return Array.from(found);
}

function extractHrefs(html: string, base: string): string[] {
  const hrefs: string[] = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      hrefs.push(new URL(m[1], base).toString());
    } catch {
      // skip malformed
    }
  }
  return hrefs;
}

async function fetchSitemap(
  url: string,
  budget: number,
): Promise<{ valid: boolean; urls: string[] }> {
  const res = await safeFetch(url);
  if (!res || res.status < 200 || res.status >= 300 || !res.body) {
    return { valid: false, urls: [] };
  }
  const unlimited = !Number.isFinite(budget);
  try {
    const parsed = await parseStringPromise(res.body, { explicitArray: false });
    if (parsed.sitemapindex?.sitemap) {
      const children = asArray(parsed.sitemapindex.sitemap);
      const collected: string[] = [];
      for (const child of children) {
        if (!unlimited && collected.length >= budget) break;
        if (typeof child.loc === "string") {
          const subBudget = unlimited ? budget : budget - collected.length;
          const sub = await fetchSitemap(child.loc, subBudget);
          for (const u of sub.urls) {
            collected.push(u);
            if (!unlimited && collected.length >= budget) break;
          }
        }
      }
      return { valid: true, urls: collected };
    }
    if (parsed.urlset?.url) {
      const entries = asArray(parsed.urlset.url);
      const all = entries
        .map((e) => (typeof e.loc === "string" ? e.loc : null))
        .filter((v): v is string => !!v);
      const collected = unlimited ? all : all.slice(0, budget);
      return { valid: true, urls: collected };
    }
    return { valid: false, urls: [] };
  } catch {
    return { valid: false, urls: [] };
  }
}

async function safeFetch(url: string) {
  try {
    return await fetchUrl(url, { timeoutMs: 10_000, retries: 0 });
  } catch {
    return null;
  }
}

function detectBlocksAll(body: string): boolean {
  const lines = body.split(/\r?\n/).map((l) => l.trim().toLowerCase());
  let currentAllAgent = false;
  for (const line of lines) {
    if (line.startsWith("user-agent:")) {
      currentAllAgent = line.endsWith("*");
    } else if (currentAllAgent && line.startsWith("disallow:")) {
      const val = line.slice("disallow:".length).trim();
      if (val === "/") return true;
    }
  }
  return false;
}

function extractSitemapDirectives(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(\S+)/i);
    if (m) out.push(m[1]);
  }
  return out;
}

function asArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

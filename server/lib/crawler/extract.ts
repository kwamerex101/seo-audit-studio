import * as cheerio from "cheerio";
import type { PageSignals, PageTypeGuess } from "./types";

const GENERIC_ANCHORS = new Set([
  "click here",
  "here",
  "read more",
  "learn more",
  "more",
  "link",
  "this",
  "visit",
]);

export function extractSignals(args: {
  url: string;
  status: number;
  html: string | null;
}): PageSignals {
  const { url, status } = args;
  const html = args.html ?? "";
  const $ = cheerio.load(html);

  const titleText = $("head > title").first().text().trim() || null;
  const metaDesc =
    $('meta[name="description"]').attr("content")?.trim() || null;
  const h1Elements = $("h1");
  const h1Text = h1Elements.first().text().trim() || null;
  const headings: Array<{ tag: string; text: string }> = [];
  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const tag = (el as cheerio.TagElement).tagName;
    headings.push({ tag, text: $(el).text().trim() });
  });

  const imagesTotal = $("img").length;
  let imagesMissingAlt = 0;
  const imagesNoAltSamples: string[] = [];
  $("img").each((_, el) => {
    const alt = $(el).attr("alt");
    if (!alt || alt.trim().length === 0) {
      imagesMissingAlt += 1;
      const src = $(el).attr("src");
      if (src && imagesNoAltSamples.length < 10) imagesNoAltSamples.push(src);
    }
  });

  const jsonLdRaw: unknown[] = [];
  const jsonLdTypes = new Set<string>();
  let orgPresent = false;
  let orgHasName = false;
  let orgHasUrl = false;
  let orgHasLogo = false;
  let orgHasSameAs = false;

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        jsonLdRaw.push(item);
        collectTypes(item, jsonLdTypes);
        const org = findOrganization(item);
        if (org) {
          orgPresent = true;
          if (typeof org.name === "string") orgHasName = true;
          if (typeof org.url === "string") orgHasUrl = true;
          if (org.logo) orgHasLogo = true;
          if (org.sameAs) orgHasSameAs = true;
        }
      }
    } catch {
      // skip malformed JSON-LD
    }
  });

  const canonical =
    $('link[rel="canonical"]').attr("href")?.trim() || null;
  const canonicalPresent = Boolean(canonical);
  const canonicalSelfRef = Boolean(
    canonical && normalizeUrl(canonical) === normalizeUrl(url),
  );

  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    const content = $(el).attr("content");
    if (prop && content) ogTags[prop] = content;
  });

  const twitterCard = Boolean($('meta[name="twitter:card"]').attr("content"));
  const viewport = Boolean($('meta[name="viewport"]').attr("content"));
  const charsetUtf8 = Boolean(
    $("meta[charset]")
      .attr("charset")
      ?.match(/utf-?8/i) ||
      $('meta[http-equiv="Content-Type" i]')
        .attr("content")
        ?.match(/utf-?8/i),
  );
  const lang = $("html").attr("lang")?.trim() || null;
  const hreflang: string[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hl = $(el).attr("hreflang");
    if (hl) hreflang.push(hl);
  });

  const mainText = extractMainText($);
  const words = mainText.split(/\s+/).filter(Boolean);
  const first200Words = words.slice(0, 200).join(" ");

  const faqSection = detectFaq($, mainText);

  const internal: string[] = [];
  const external: string[] = [];
  let genericAnchorCount = 0;
  const origin = safeOrigin(url);
  $("a[href]").each((_, el) => {
    const hrefRaw = $(el).attr("href");
    if (!hrefRaw) return;
    let abs: string;
    try {
      abs = new URL(hrefRaw, url).toString();
    } catch {
      return;
    }
    const anchor = $(el).text().trim().toLowerCase();
    if (anchor && GENERIC_ANCHORS.has(anchor)) genericAnchorCount += 1;
    if (safeOrigin(abs) === origin) internal.push(abs);
    else if (/^https?:/.test(abs)) external.push(abs);
  });

  const pageTypeGuess = guessPageType(url, headings, titleText, jsonLdTypes);

  return {
    url,
    http_status: status,
    fetched_at: new Date().toISOString(),
    title: titleText,
    title_length: titleText?.length ?? 0,
    meta_description: metaDesc,
    meta_description_length: metaDesc?.length ?? 0,
    h1: h1Text,
    has_h1: h1Elements.length > 0,
    h1_count: h1Elements.length,
    headings,
    heading_hierarchy_clean: isHierarchyClean(headings),
    images_total: imagesTotal,
    images_missing_alt: imagesMissingAlt,
    images_no_alt: imagesNoAltSamples,
    json_ld: jsonLdRaw,
    json_ld_types: Array.from(jsonLdTypes),
    organization_schema: {
      present: orgPresent,
      has_name: orgHasName,
      has_url: orgHasUrl,
      has_logo: orgHasLogo,
      has_sameAs: orgHasSameAs,
    },
    canonical,
    canonical_present: canonicalPresent,
    canonical_self_ref: canonicalSelfRef,
    og_tags: ogTags,
    twitter_card: twitterCard,
    viewport,
    charset_utf8: charsetUtf8,
    lang,
    hreflang,
    https: url.startsWith("https://"),
    first_200_words: first200Words,
    faq_section: faqSection,
    internal_links: internal,
    external_links: external,
    internal_anchor_generic_count: genericAnchorCount,
    word_count: words.length,
    page_type_guess: pageTypeGuess,
  };
}

function collectTypes(node: unknown, out: Set<string>) {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") out.add(t);
  if (Array.isArray(t)) {
    for (const v of t) if (typeof v === "string") out.add(v);
  }
  if (Array.isArray(obj["@graph"])) {
    for (const child of obj["@graph"] as unknown[]) collectTypes(child, out);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") collectTypes(v, out);
  }
}

function findOrganization(
  node: unknown,
): { name?: string; url?: string; logo?: unknown; sameAs?: unknown } | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const types = Array.isArray(t) ? t : [t];
  if (types.includes("Organization") || types.includes("LocalBusiness")) {
    return {
      name: typeof obj.name === "string" ? obj.name : undefined,
      url: typeof obj.url === "string" ? obj.url : undefined,
      logo: obj.logo,
      sameAs: obj.sameAs,
    };
  }
  if (Array.isArray(obj["@graph"])) {
    for (const child of obj["@graph"] as unknown[]) {
      const found = findOrganization(child);
      if (found) return found;
    }
  }
  return null;
}

function isHierarchyClean(headings: Array<{ tag: string }>): boolean {
  if (headings.length === 0) return false;
  const levels = headings.map((h) => Number(h.tag.slice(1)));
  let prev = levels[0];
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > prev + 1) return false;
    prev = levels[i];
  }
  return true;
}

function extractMainText($: cheerio.CheerioAPI): string {
  const clone = $.root().clone() as ReturnType<typeof $.root>;
  clone.find("script,style,noscript,header,footer,nav,svg").remove();
  const text = clone.text().replace(/\s+/g, " ").trim();
  return text;
}

function detectFaq($: cheerio.CheerioAPI, mainText: string): boolean {
  const lower = mainText.toLowerCase();
  if (/frequently asked questions|\bfaq\b/.test(lower)) return true;
  const hasQuestions =
    $("details").length >= 3 ||
    $('h2,h3,h4').filter((_, el) => $(el).text().trim().endsWith("?")).length >=
      3;
  return hasQuestions;
}

function guessPageType(
  url: string,
  headings: Array<{ tag: string; text: string }>,
  title: string | null,
  jsonLdTypes: Set<string>,
): PageTypeGuess {
  const path = safePath(url);
  if (path === "/" || path === "") return "homepage";
  if (jsonLdTypes.has("BlogPosting") || jsonLdTypes.has("Article"))
    return "blog_post";
  if (jsonLdTypes.has("FAQPage")) return "faq";
  if (jsonLdTypes.has("ContactPage") || /contact/i.test(path))
    return "contact";
  if (jsonLdTypes.has("AboutPage") || /about/i.test(path)) return "about";
  if (
    jsonLdTypes.has("Product") ||
    jsonLdTypes.has("SoftwareApplication") ||
    /product|pricing|plans/i.test(path)
  ) {
    return "product";
  }
  if (/blog\/?$/i.test(path)) return "blog_listing";
  if (/blog\//i.test(path)) return "blog_post";
  return "content";
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    url.search = "";
    let s = url.toString();
    if (s.endsWith("/") && url.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return u;
  }
}

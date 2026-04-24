import type { PageSignals, SiteSignals } from "../crawler/types";

export type CategoryKey =
  | "technical"
  | "on_page"
  | "content"
  | "links"
  | "schema"
  | "geo";

export type PageScore = {
  technical: number;
  on_page: number;
  content: number;
  links: number;
  schema: number;
  geo: number;
  overall: number;
  pending_ai_items: string[];
};

export type PageIssue = {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  category: CategoryKey;
};

export type PageScoreResult = {
  score: PageScore;
  issues: PageIssue[];
};

export function scorePageDeterministic(args: {
  page: PageSignals;
  site: SiteSignals;
  countries: string[];
}): PageScoreResult {
  const { page, site, countries } = args;
  const deductions: Record<CategoryKey, number> = {
    technical: 0,
    on_page: 0,
    content: 0,
    links: 0,
    schema: 0,
    geo: 0,
  };
  const issues: PageIssue[] = [];
  const pending: string[] = [];

  const deduct = (cat: CategoryKey, amount: number) => {
    deductions[cat] = Math.min(100, deductions[cat] + amount);
  };

  // --- Technical ---
  if (!page.https) {
    deduct("technical", 50);
    issues.push({
      id: "tech.https",
      severity: "critical",
      message: "Page is not served over HTTPS.",
      category: "technical",
    });
  }
  if (site.robots_txt.blocks_all) {
    deduct("technical", 50);
    issues.push({
      id: "tech.robots",
      severity: "critical",
      message: "robots.txt blocks all crawlers (Disallow: /).",
      category: "technical",
    });
  }
  if (page.http_status >= 400 || page.http_status === 0) {
    deduct("technical", 30);
    issues.push({
      id: "tech.status",
      severity: "critical",
      message: `Page returned HTTP ${page.http_status || "error"}.`,
      category: "technical",
    });
  }
  if (!site.sitemap.present || !site.sitemap.valid) {
    deduct("technical", 15);
    issues.push({
      id: "tech.sitemap",
      severity: "warning",
      message: "Sitemap missing or invalid.",
      category: "technical",
    });
  }

  const canonicalScore = page.canonical_present
    ? page.canonical_self_ref
      ? 10
      : 5
    : 0;
  deduct("technical", (10 - canonicalScore) * 1.5);
  if (canonicalScore < 10) {
    issues.push({
      id: "tech.canonical",
      severity: canonicalScore === 0 ? "warning" : "info",
      message:
        canonicalScore === 0
          ? "Canonical tag missing."
          : "Canonical tag does not self-reference this URL.",
      category: "technical",
    });
  }

  if (!page.viewport) {
    deduct("technical", 10);
    issues.push({
      id: "tech.viewport",
      severity: "warning",
      message: "Viewport meta tag missing.",
      category: "technical",
    });
  }
  if (!page.charset_utf8) {
    deduct("technical", 5);
    issues.push({
      id: "tech.charset",
      severity: "info",
      message: "Charset is not UTF-8.",
      category: "technical",
    });
  }
  if (!page.lang) {
    deduct("technical", 5);
    issues.push({
      id: "tech.lang",
      severity: "info",
      message: "<html lang> attribute missing.",
      category: "technical",
    });
  }

  const ogKeys = [
    "og:title",
    "og:description",
    "og:image",
    "og:url",
  ].filter((k) => typeof page.og_tags[k] === "string" && page.og_tags[k].length > 0);
  const ogScore = ogKeys.length === 4 ? 10 : ogKeys.length > 0 ? 5 : 0;
  deduct("technical", (10 - ogScore) * 1);
  if (ogScore < 10) {
    issues.push({
      id: "tech.og",
      severity: "info",
      message: `Open Graph tags: ${ogKeys.length}/4 present.`,
      category: "technical",
    });
  }

  const twitterScore = page.twitter_card ? 10 : 0;
  deduct("technical", (10 - twitterScore) * 0.5);
  if (!page.twitter_card) {
    issues.push({
      id: "tech.twitter",
      severity: "info",
      message: "Twitter Card meta missing.",
      category: "technical",
    });
  }

  const mobileScore = page.viewport ? 10 : 0;
  deduct("technical", (10 - mobileScore) * 1);

  // International (conditional)
  if (countries.length >= 2) {
    const hreflangScore = page.hreflang.length >= countries.length ? 10 : 0;
    deduct("technical", (10 - hreflangScore) * 2);
    if (hreflangScore < 10) {
      issues.push({
        id: "tech.hreflang",
        severity: "warning",
        message: "Missing hreflang annotations for all target countries.",
        category: "technical",
      });
    }
  }
  if (countries.length >= 1) {
    pending.push("tech.geo_targeting");
    pending.push("tech.lang_matches_target");
  }

  // --- On-Page ---
  if (!page.title) {
    deduct("on_page", 40);
    issues.push({
      id: "onpage.title_presence",
      severity: "critical",
      message: "No <title> tag.",
      category: "on_page",
    });
  }
  if (!page.has_h1) {
    deduct("on_page", 30);
    issues.push({
      id: "onpage.h1_presence",
      severity: "critical",
      message: "No H1 heading.",
      category: "on_page",
    });
  }

  let titleQualityScore = 0;
  if (!page.title) titleQualityScore = 0;
  else if (page.title_length >= 50 && page.title_length <= 60)
    titleQualityScore = 10;
  else if (page.title_length >= 30 && page.title_length < 50) titleQualityScore = 6;
  else titleQualityScore = 3;
  deduct("on_page", (10 - titleQualityScore) * 2);
  if (titleQualityScore < 10 && page.title) {
    issues.push({
      id: "onpage.title_quality",
      severity: "info",
      message: `Title length ${page.title_length} (target 50–60).`,
      category: "on_page",
    });
  }
  pending.push("onpage.title_quality");

  let metaDescScore = 0;
  if (!page.meta_description) metaDescScore = 0;
  else if (
    page.meta_description_length >= 150 &&
    page.meta_description_length <= 160
  )
    metaDescScore = 10;
  else metaDescScore = 5;
  deduct("on_page", (10 - metaDescScore) * 2);
  if (metaDescScore < 10) {
    issues.push({
      id: "onpage.meta_description",
      severity: page.meta_description ? "info" : "warning",
      message: page.meta_description
        ? `Meta description length ${page.meta_description_length} (target 150–160).`
        : "Meta description missing.",
      category: "on_page",
    });
  }
  pending.push("onpage.meta_description");
  pending.push("onpage.h1_keyword");

  const hierarchyScore = page.heading_hierarchy_clean ? 10 : 0;
  deduct("on_page", (10 - hierarchyScore) * 1);
  if (!page.heading_hierarchy_clean) {
    issues.push({
      id: "onpage.hierarchy",
      severity: "info",
      message: "Heading hierarchy skips levels.",
      category: "on_page",
    });
  }

  const altScore = (() => {
    if (page.images_total === 0) return 10;
    const ratio =
      (page.images_total - page.images_missing_alt) / page.images_total;
    if (ratio >= 1) return 10;
    if (ratio >= 0.75) return 7;
    if (ratio >= 0.5) return 5;
    if (ratio > 0) return 2;
    return 0;
  })();
  deduct("on_page", (10 - altScore) * 2);
  if (altScore < 10) {
    issues.push({
      id: "onpage.alt_coverage",
      severity: "info",
      message: `${page.images_missing_alt}/${page.images_total} images missing alt text.`,
      category: "on_page",
    });
  }

  // --- Content ---
  pending.push(
    "content.direct_answer",
    "content.eeat",
    "content.depth",
    "content.keywords",
  );
  let faqScore = 0;
  if (page.faq_section) {
    faqScore = page.json_ld_types.includes("FAQPage") ? 10 : 6;
  }
  deduct("content", (10 - faqScore) * 1.5);
  if (faqScore < 10 && page.faq_section) {
    issues.push({
      id: "content.faq",
      severity: "info",
      message: "FAQ content present but FAQPage schema missing.",
      category: "content",
    });
  } else if (!page.faq_section) {
    issues.push({
      id: "content.faq",
      severity: "info",
      message: "No FAQ section detected.",
      category: "content",
    });
  }

  // --- Links ---
  const internalScore = (() => {
    const n = page.internal_links.length;
    if (n >= 5) return 10;
    if (n >= 2) return 6;
    if (n === 1) return 3;
    return 0;
  })();
  deduct("links", (10 - internalScore) * 2.5);
  if (internalScore < 10) {
    issues.push({
      id: "links.internal",
      severity: "info",
      message: `${page.internal_links.length} internal links (target 5+).`,
      category: "links",
    });
  }

  const externalScore = (() => {
    const n = page.external_links.length;
    if (n >= 2) return 10;
    if (n === 1) return 5;
    return 0;
  })();
  deduct("links", (10 - externalScore) * 2);
  if (externalScore < 10) {
    issues.push({
      id: "links.external",
      severity: "info",
      message: `${page.external_links.length} external authority links (target 2+).`,
      category: "links",
    });
  }

  const anchorCrudeScore = page.internal_anchor_generic_count === 0 ? 10 : 3;
  deduct("links", (10 - anchorCrudeScore) * 2);
  pending.push("links.anchor");
  pending.push("links.broken");

  // --- Schema ---
  if (page.json_ld.length === 0) {
    deduct("schema", 40);
    issues.push({
      id: "schema.presence",
      severity: "warning",
      message: "No JSON-LD structured data.",
      category: "schema",
    });
  }
  const org = page.organization_schema;
  let orgScore = 0;
  if (org.present) {
    const complete =
      (org.has_name ? 1 : 0) +
      (org.has_url ? 1 : 0) +
      (org.has_logo ? 1 : 0) +
      (org.has_sameAs ? 1 : 0);
    orgScore = complete === 4 ? 10 : complete > 0 ? 5 : 0;
  }
  deduct("schema", (10 - orgScore) * 1.5);
  if (orgScore < 10) {
    issues.push({
      id: "schema.organization",
      severity: "info",
      message: org.present
        ? "Organization schema is partial (missing name/url/logo/sameAs)."
        : "No Organization schema.",
      category: "schema",
    });
  }
  pending.push("schema.page_types", "schema.missing");

  // --- GEO (mostly pending; hybrid "structured data for AI" deterministic) ---
  const geoStructured = (() => {
    const hasSchema = page.json_ld.length > 0;
    const hasLlms = site.llms_txt;
    const hasEeat = Boolean(
      /author|about|contact|team/i.test(page.first_200_words) ||
        page.json_ld_types.includes("Person"),
    );
    const n = [hasSchema, hasLlms, hasEeat].filter(Boolean).length;
    if (n === 3) return 25;
    if (n === 2) return 15;
    if (n === 1) return 5;
    return 0;
  })();
  // GEO is 4 sub-scores × 25, deduction from 100 base
  // Phase 2: structured_data_for_ai is known, others pending (no deduction, but flagged)
  deduct("geo", 25 - geoStructured);
  pending.push(
    "geo.direct_answer_potential",
    "geo.citation_readiness",
    "geo.information_gain",
  );

  const technical = Math.max(0, 100 - deductions.technical);
  const on_page = Math.max(0, 100 - deductions.on_page);
  const content = Math.max(0, 100 - deductions.content);
  const links = Math.max(0, 100 - deductions.links);
  const schema = Math.max(0, 100 - deductions.schema);
  const geo = Math.max(0, 100 - deductions.geo);

  const seo = (technical + on_page + content + links + schema) / 5;
  const overall = seo * 0.6 + geo * 0.4;

  return {
    score: {
      technical: Math.round(technical),
      on_page: Math.round(on_page),
      content: Math.round(content),
      links: Math.round(links),
      schema: Math.round(schema),
      geo: Math.round(geo),
      overall: Math.round(overall),
      pending_ai_items: pending,
    },
    issues,
  };
}

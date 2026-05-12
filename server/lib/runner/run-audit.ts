import { join } from "node:path";
import { discoverUrls } from "../crawler/sitemap";
import { extractSignals } from "../crawler/extract";
import { PoliteQueue, fetchUrl, sleep } from "../crawler/fetch-page";
import type { PageSignals, SiteSignals } from "../crawler/types";
import {
  scorePageDeterministic,
  type PageScoreResult,
} from "../scorer/deterministic";
import { aggregateSite } from "../scorer/aggregate";
import { enhancePageWithClaude } from "../scorer/claude";
import {
  aggregateEeatSignals,
  deriveGeoLabels,
  deriveMissingSchema,
} from "../scorer/geo-labels";
import { isClaudeAvailable } from "../ai/client";
import { generateNarrative } from "../ai/prompts/narrative";
import { auditDir, ensureDir, writeJson } from "../storage/fs";
import {
  createAudit,
  saveAuditReport,
  updateAuditMeta,
} from "../storage/audits";
import { getOrCreateCompany } from "../storage/companies";
import type { AuditReport } from "../report/schema";

export type JobStepName =
  | "queued"
  | "sitemap"
  | "crawl"
  | "score_deterministic"
  | "score_claude"
  | "narrative"
  | "persist"
  | "done"
  | "failed";

export type ProgressEvent = {
  step: JobStepName;
  pct: number;
  message: string;
};

export type RunAuditInput = {
  url: string;
  countries: string[];
  maxPages?: number;
  auditId?: string;
  companyOverride?: { name: string; slug: string; id: string };
  onProgress?: (e: ProgressEvent) => void;
  isCancelled?: () => boolean;
};

export type RunAuditResult = {
  company_slug: string;
  audit_id: string;
  site_overall_score: number;
  site_seo_score: number;
  site_geo_score: number;
  pages_audited: number;
  ai_scoring_status: "pending" | "complete";
};

export class JobCancelledError extends Error {
  constructor() {
    super("Job cancelled by user");
    this.name = "JobCancelledError";
  }
}

export async function runAudit(input: RunAuditInput): Promise<RunAuditResult> {
  const parsed = new URL(input.url);
  const origin = parsed.origin;
  const siteName = humanizeHost(parsed.hostname);
  const progress = input.onProgress ?? (() => {});
  const isCancelled = input.isCancelled ?? (() => false);
  const checkpoint = () => {
    if (isCancelled()) throw new JobCancelledError();
  };

  const company = await getOrCreateCompany({
    name: siteName,
    domain: parsed.hostname,
  });
  let auditId = input.auditId;
  if (!auditId) {
    const created = await createAudit({
      companyId: company.id,
      companySlug: company.slug,
      sourceUrl: origin,
      origin: "app",
    });
    auditId = created.id;
  }
  await updateAuditMeta(company.slug, auditId, { status: "running" });
  const audit = { id: auditId };

  try {
    const maxPages = input.maxPages; // undefined or 0 → uncapped sitemap; BFS fallback keeps its own safety
    progress({
      step: "sitemap",
      pct: 5,
      message: `Discovering pages for ${origin}`,
    });
    const { urls, site } = await discoverUrls(origin, {
      maxUrls: maxPages,
      bfsFallbackCap: 50,
    });
    progress({
      step: "sitemap",
      pct: 10,
      message: `Found ${urls.length} URL(s) to crawl`,
    });

    const queue = new PoliteQueue({ concurrency: 4, delayMs: 1500 });
    const pageResults: Array<{
      signals: PageSignals;
      score: PageScoreResult["score"];
      issues: PageScoreResult["issues"];
    }> = [];

    let crawled = 0;
    const crawlTotal = urls.length || 1;
    await Promise.all(
      urls.map((u) =>
        queue.run(u, async () => {
          try {
            const res = await fetchUrl(u, { timeoutMs: 15_000, retries: 2 });
            const signals = extractSignals({
              url: u,
              status: res.status,
              html: res.body,
            });
            const scored = scorePageDeterministic({
              page: signals,
              site,
              countries: input.countries,
            });
            pageResults.push({
              signals,
              score: scored.score,
              issues: scored.issues,
            });
          } catch (err) {
            const signals = extractSignals({ url: u, status: 0, html: null });
            const scored = scorePageDeterministic({
              page: signals,
              site,
              countries: input.countries,
            });
            pageResults.push({
              signals,
              score: scored.score,
              issues: [
                {
                  id: "crawl.error",
                  severity: "critical",
                  message: `Crawl error: ${err instanceof Error ? err.message : String(err)}`,
                  category: "technical",
                },
                ...scored.issues,
              ],
            });
          }
          crawled += 1;
          const pct = 10 + Math.round((crawled / crawlTotal) * 40);
          progress({
            step: "crawl",
            pct,
            message: `Crawled ${crawled}/${crawlTotal} page(s)`,
          });
        }),
      ),
    );
    checkpoint();
    progress({
      step: "score_deterministic",
      pct: 55,
      message: "Deterministic scoring complete",
    });

    const claudeEnabled = await isClaudeAvailable();
    const aiPerPageResults: Array<Record<string, unknown>> = [];
    const aiFailedUrls: string[] = [];
    if (claudeEnabled) {
      const n = pageResults.length;
      for (let i = 0; i < n; i += 1) {
        checkpoint();
        const p = pageResults[i];
        const enhanced = await enhancePageWithClaude({
          page: p.signals,
          site,
          deterministic: { score: p.score, issues: p.issues },
        });
        pageResults[i] = { ...p, score: enhanced.score };
        aiPerPageResults.push(enhanced.claude_item_results);
        if (enhanced.failed) aiFailedUrls.push(p.signals.url);
        const pct = 55 + Math.round(((i + 1) / n) * 25);
        const failedTag = aiFailedUrls.length
          ? ` (${aiFailedUrls.length} failed)`
          : "";
        progress({
          step: "score_claude",
          pct,
          message: `AI-scored ${i + 1}/${n} page(s)${failedTag}`,
        });
        // Throttle between pages so we don't burst the local Claude CLI.
        if (i < n - 1) await sleep(300);
      }
    } else {
      progress({
        step: "score_claude",
        pct: 80,
        message:
          "AI scoring skipped (no AI provider reachable: Osaurus :1337 / Claude CLI / cursor-api :7878)",
      });
    }

    const aggregates = aggregateSite(pageResults);
    let report = buildReport({
      url: origin,
      siteName,
      countries: input.countries,
      site,
      pages: pageResults,
      aggregates,
      aiScoringStatus: claudeEnabled
        ? aiFailedUrls.length === pageResults.length && pageResults.length > 0
          ? "pending"
          : "complete"
        : "pending",
      aiFailedUrls,
    });

    if (claudeEnabled) {
      progress({
        step: "narrative",
        pct: 85,
        message: "Generating Trinity review + keyword tiers",
      });
      try {
        const narrative = await generateNarrative(report);
        if (narrative) {
          report = {
            ...report,
            trinity_review: narrative.trinity_review,
            skill_based_summary: narrative.skill_based_summary,
            keyword_tiers: narrative.keyword_tiers,
            competitors: narrative.competitors,
            top_actions: narrative.top_actions,
          } as typeof report;
        }
      } catch (err) {
        console.warn("[claude] narrative generation failed:", err);
      }
    }

    progress({ step: "persist", pct: 95, message: "Saving report" });
    const dir = auditDir(company.slug, audit.id);
    await ensureDir(dir);
    await writeJson(
      join(dir, "crawl.json"),
      pageResults.map((p) => p.signals),
    );
    await saveAuditReport(company.slug, audit.id, report);
    await updateAuditMeta(company.slug, audit.id, {
      status: "completed",
      completed_at: new Date().toISOString(),
      site_overall_score: aggregates.site_overall_score,
      site_seo_score: aggregates.site_seo_score,
      site_geo_score: aggregates.site_geo_score,
      pages_audited: pageResults.length,
      report_path: "report.json",
    });
    progress({ step: "done", pct: 100, message: "Audit complete" });

    return {
      company_slug: company.slug,
      audit_id: audit.id,
      site_overall_score: aggregates.site_overall_score,
      site_seo_score: aggregates.site_seo_score,
      site_geo_score: aggregates.site_geo_score,
      pages_audited: pageResults.length,
      ai_scoring_status: claudeEnabled ? "complete" : "pending",
    };
  } catch (err) {
    await updateAuditMeta(company.slug, audit.id, {
      status: "failed",
      completed_at: new Date().toISOString(),
    });
    progress({
      step: "failed",
      pct: 100,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function auditIdFromRun(input: RunAuditInput): string {
  return input.auditId ?? "";
}

function buildReport(args: {
  url: string;
  siteName: string;
  countries: string[];
  site: SiteSignals;
  pages: Array<{
    signals: PageSignals;
    score: PageScoreResult["score"];
    issues: PageScoreResult["issues"];
  }>;
  aggregates: ReturnType<typeof aggregateSite>;
  aiScoringStatus: "pending" | "complete";
  aiFailedUrls: string[];
}): AuditReport {
  const {
    url,
    siteName,
    countries,
    site,
    pages,
    aggregates,
    aiScoringStatus,
    aiFailedUrls,
  } = args;

  const discoveredUrls = site.sitemap.urls;
  const allIssues = pages.flatMap((p) =>
    p.issues.map((i) => ({ ...i, url: p.signals.url })),
  );
  const todoGroups = new Map<
    string,
    { id: string; severity: string; message: string; count: number; category: string }
  >();
  for (const issue of allIssues) {
    const key = issue.id;
    const existing = todoGroups.get(key);
    if (existing) existing.count += 1;
    else
      todoGroups.set(key, {
        id: issue.id,
        severity: issue.severity,
        message: issue.message,
        count: 1,
        category: issue.category,
      });
  }
  const todo_list = Array.from(todoGroups.values())
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .map((g, idx) => ({
      id: `T-${String(idx + 1).padStart(2, "0")}`,
      issue: g.message,
      fix: suggestFix(g.id, g.message),
      importance: importanceFor(g.severity),
      status: "open",
      pages_affected: g.count,
      severity: g.severity,
      category: g.category,
    }));

  const top_actions = todo_list.slice(0, 5).map((t) => t.issue);

  const implementation_plan = todo_list.slice(0, 10).map((t, idx) => ({
    id: `IP-${String(idx + 1).padStart(2, "0")}`,
    action: t.fix,
    priority: t.importance === "High" ? "Critical" : t.importance,
    effort: "Medium",
    pages: String(t.pages_affected),
    expected_impact: "",
    completed: false,
  }));

  const jsonLdAll = new Set<string>();
  let anyFaq = false;
  let anyDirect = false;
  for (const p of pages) {
    for (const t of p.signals.json_ld_types) jsonLdAll.add(t);
    if (p.signals.faq_section) anyFaq = true;
    if (
      /is\s|are\s|provides|helps|offers/i.test(p.signals.first_200_words) &&
      p.signals.first_200_words.length > 50
    ) {
      anyDirect = true;
    }
  }
  const signals = pages.map((p) => p.signals);
  const labels = deriveGeoLabels({
    aiScoringStatus,
    pages: pages.map((p) => p.score),
    signals,
    site,
  });
  const geo_readiness = {
    llms_txt: site.llms_txt,
    structured_data: Array.from(jsonLdAll),
    missing_schema: deriveMissingSchema({ signals }),
    faq_section: anyFaq,
    direct_answer_potential: anyDirect,
    citation_readiness: labels.citation_readiness,
    information_gain: labels.information_gain,
    brand_authority: labels.brand_authority,
    eeat_signals: aggregateEeatSignals(signals),
  };

  const international = {
    hreflang_tags: Array.from(
      new Set(pages.flatMap((p) => p.signals.hreflang)),
    ),
    hreflang_valid: pages.some((p) => p.signals.hreflang.length > 0),
    geo_targeting: countries.length > 1 ? "pending_review" : "single-country",
    strategy: "",
    locale_signals: [] as string[],
    recommendations: [] as string[],
  };

  const pagesOut = pages.map((p) => ({
    url: p.signals.url,
    title: p.signals.title,
    title_length: p.signals.title_length,
    meta_description: p.signals.meta_description,
    meta_description_length: p.signals.meta_description_length,
    h1: p.signals.h1,
    has_h1: p.signals.has_h1,
    heading_hierarchy_clean: p.signals.heading_hierarchy_clean,
    images_total: p.signals.images_total,
    images_missing_alt: p.signals.images_missing_alt,
    images_no_alt: p.signals.images_missing_alt,
    json_ld_types: p.signals.json_ld_types,
    canonical_present: p.signals.canonical_present,
    canonical_self_ref: p.signals.canonical_self_ref,
    canonical: p.signals.canonical,
    og_tags: p.signals.og_tags,
    twitter_card: p.signals.twitter_card,
    viewport: p.signals.viewport,
    charset_utf8: p.signals.charset_utf8,
    lang: p.signals.lang,
    https: p.signals.https,
    direct_answer_first_200: false,
    faq_section: p.signals.faq_section,
    eeat_signals: [] as string[],
    internal_links_raw_count: p.signals.internal_links.length,
    technical: p.score.technical,
    on_page: p.score.on_page,
    content: p.score.content,
    links: p.score.links,
    schema: p.score.schema,
    geo: p.score.geo,
    score: p.score.overall,
    issues: p.issues.map((i) => i.message),
    type: p.signals.page_type_guess,
  }));

  return {
    generated_at: new Date().toISOString(),
    source_type: "url",
    source_value: url,
    site_name: siteName,
    site_overall_score: aggregates.site_overall_score,
    site_seo_score: aggregates.site_seo_score,
    site_geo_score: aggregates.site_geo_score,
    report_source: "seo-audit-studio/phase2",
    site_category_averages: aggregates.site_category_averages,
    pages_audited: pages.length,
    pages_discovered: discoveredUrls.length,
    discovered_urls: discoveredUrls,
    geo_readiness,
    keyword_tiers: { primary: [], secondary: [], tertiary: [] },
    competitors: [],
    countries,
    country_analysis: null,
    international,
    search_locale_note: "",
    trinity_review: {
      seo: "Deterministic pass only — AI narrative pending.",
      geo: "Deterministic pass only — AI narrative pending.",
      ux: "Deterministic pass only — AI narrative pending.",
    },
    skill_based_summary: {
      on_page: "Pending AI analysis.",
      content: "Pending AI analysis.",
      technical: "Pending AI analysis.",
      schema_geo: "Pending AI analysis.",
    },
    top_actions,
    todo_list,
    pages: pagesOut,
    implementation_plan,
    // extra fields allowed by .passthrough() schema
    ai_scoring_status: aiScoringStatus,
    ai_failed_urls: aiFailedUrls,
  } as AuditReport;
}

function humanizeHost(host: string): string {
  const base = host.replace(/^www\./, "").replace(/\.(com|net|org|io|dev|co|app|ai)$/i, "");
  return base
    .split(".")
    .join(" ")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();
}

function severityWeight(s: string): number {
  if (s === "critical") return 3;
  if (s === "warning") return 2;
  return 1;
}

function importanceFor(s: string): string {
  if (s === "critical") return "High";
  if (s === "warning") return "Medium";
  return "Low";
}

function suggestFix(id: string, message: string): string {
  const map: Record<string, string> = {
    "tech.https": "Deploy a valid TLS certificate and redirect HTTP → HTTPS.",
    "tech.robots": "Remove Disallow: / from robots.txt.",
    "tech.status": "Fix the failing page (404/5xx) or remove it from the sitemap.",
    "tech.sitemap": "Publish /sitemap.xml and reference it from robots.txt.",
    "tech.canonical": "Add a self-referencing <link rel='canonical'>.",
    "tech.viewport":
      "Add <meta name='viewport' content='width=device-width, initial-scale=1'>.",
    "tech.charset": "Declare <meta charset='utf-8'> in the document head.",
    "tech.lang": "Add lang attribute to <html> (e.g. lang='en').",
    "tech.og":
      "Add the four core Open Graph tags: og:title, og:description, og:image, og:url.",
    "tech.twitter":
      "Add <meta name='twitter:card' content='summary_large_image'>.",
    "tech.hreflang":
      "Add hreflang annotations for every target country, including x-default.",
    "onpage.title_presence": "Add a <title> tag to every page.",
    "onpage.h1_presence": "Add exactly one H1 per page.",
    "onpage.title_quality":
      "Rewrite the title to 50–60 characters with the target keyword near the start.",
    "onpage.meta_description":
      "Write a 150–160 character meta description that includes the keyword and a CTA.",
    "onpage.hierarchy":
      "Restructure headings so H2/H3 never skip levels under H1.",
    "onpage.alt_coverage":
      "Add descriptive alt text to every content image.",
    "content.faq":
      "Add a dedicated FAQ section with FAQPage JSON-LD schema.",
    "links.internal":
      "Add at least 5 relevant internal links from each content page.",
    "links.external":
      "Add 2+ outbound links to authoritative sources.",
    "schema.presence":
      "Add JSON-LD structured data (Organization, WebSite, page-appropriate types).",
    "schema.organization":
      "Complete Organization schema with name, url, logo, and sameAs.",
    "crawl.error": "Investigate network/server errors preventing the crawl.",
  };
  return map[id] ?? message;
}

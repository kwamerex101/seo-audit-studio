import { join } from "node:path";
import {
  findAuditById,
  getAuditReport,
  saveAuditReport,
  updateAuditMeta,
} from "../storage/audits";
import { auditDir, readJson } from "../storage/fs";
import type { PageSignals, SiteSignals } from "../crawler/types";
import { scorePageDeterministic } from "../scorer/deterministic";
import { enhancePageWithClaude } from "../scorer/claude";
import { aggregateSite } from "../scorer/aggregate";
import {
  aggregateEeatSignals,
  deriveGeoLabels,
  deriveMissingSchema,
} from "../scorer/geo-labels";
import { generateNarrative } from "../ai/prompts/narrative";
import { isClaudeAvailable } from "../ai/client";
import { sleep } from "../crawler/fetch-page";
import { JobCancelledError, type JobStepName, type ProgressEvent } from "./run-audit";
import type { AuditReport } from "../report/schema";

export type RescoreInput = {
  auditId: string;
  /**
   * If provided, only these URLs get AI-rescored. Other pages keep the
   * scores from the existing report (preserving prior AI adjustments).
   * Used by the "Retry failed pages" flow.
   */
  onlyUrls?: string[];
  onProgress?: (e: ProgressEvent) => void;
  isCancelled?: () => boolean;
};

export type RescoreResult = {
  audit_id: string;
  pages_rescored: number;
  ai_failed_urls: string[];
  site_overall_score: number;
};

export async function rescoreAudit(input: RescoreInput): Promise<RescoreResult> {
  const progress = input.onProgress ?? (() => {});
  const isCancelled = input.isCancelled ?? (() => false);
  const checkpoint = () => {
    if (isCancelled()) throw new JobCancelledError();
  };

  const audit = await findAuditById(input.auditId);
  if (!audit) throw new Error(`Audit not found: ${input.auditId}`);

  progress({ step: "sitemap", pct: 5, message: "Loading existing crawl data" });
  const dir = auditDir(audit.company_slug, audit.id);
  const crawl = await readJson<PageSignals[]>(join(dir, "crawl.json"));
  if (!crawl || crawl.length === 0) {
    throw new Error(
      "No crawl data on disk for this audit. Run a fresh audit instead.",
    );
  }
  const report = await getAuditReport(audit.company_slug, audit.id);
  if (!report) throw new Error("Report missing for this audit");

  if (!(await isClaudeAvailable())) {
    progress({
      step: "failed",
      pct: 100,
      message:
        "No AI provider reachable. Start Osaurus :1337, Claude CLI, or cursor-api :7878.",
    });
    throw new Error("No AI provider reachable");
  }

  // Synthesize a SiteSignals object from the existing report so the scorer
  // can re-derive site-level signals (sitemap presence, llms.txt, robots).
  const site: SiteSignals = {
    robots_txt: { present: false, blocks_all: false, sitemaps: [] },
    sitemap: {
      present: report.discovered_urls.length > 0,
      valid: report.discovered_urls.length > 0,
      urls: report.discovered_urls,
    },
    llms_txt: Boolean(report.geo_readiness?.llms_txt),
  };
  const countries = report.countries ?? [];

  await updateAuditMeta(audit.company_slug, audit.id, { status: "running" });

  // Targeted retry: when onlyUrls is set, only those pages get AI-rescored.
  // Other pages keep their existing report scores (which already include any
  // prior AI adjustments).
  const targetSet = input.onlyUrls
    ? new Set(input.onlyUrls.map((u) => u))
    : null;
  const targetMode = Boolean(targetSet);

  progress({
    step: "score_deterministic",
    pct: 10,
    message: targetMode
      ? `Targeting ${input.onlyUrls?.length ?? 0} page(s) for AI rescore`
      : "Re-running deterministic scoring",
  });

  const detResults = crawl.map((signals) => {
    if (targetSet && !targetSet.has(signals.url)) {
      // Reuse existing scored values for non-targeted pages.
      const existing = report.pages.find((p) => p.url === signals.url);
      if (existing) {
        return {
          signals,
          score: {
            technical: Number(existing.technical ?? 0),
            on_page: Number(existing.on_page ?? 0),
            content: Number(existing.content ?? 0),
            links: Number(existing.links ?? 0),
            schema: Number(existing.schema ?? 0),
            geo: Number(existing.geo ?? 0),
            overall: Number(existing.score ?? 0),
            pending_ai_items: [] as string[],
          },
          issues: [] as ReturnType<
            typeof scorePageDeterministic
          >["issues"],
        };
      }
    }
    const r = scorePageDeterministic({ page: signals, site, countries });
    return { signals, score: r.score, issues: r.issues };
  });

  // AI rescore — only the targeted pages (or all when targetSet is null).
  const aiFailedUrls: string[] = [];
  // Carry over previously-failed URLs that aren't being retried this round.
  const previousFailures =
    ((report as unknown as { ai_failed_urls?: string[] }).ai_failed_urls ?? []);
  if (targetSet) {
    for (const u of previousFailures) {
      if (!targetSet.has(u)) aiFailedUrls.push(u);
    }
  }
  const queue = detResults
    .map((p, idx) => ({ p, idx }))
    .filter((x) => !targetSet || targetSet.has(x.p.signals.url));
  const total = queue.length;
  for (let qi = 0; qi < queue.length; qi += 1) {
    checkpoint();
    const { p, idx } = queue[qi];
    const enhanced = await enhancePageWithClaude({
      page: p.signals,
      site,
      deterministic: { score: p.score, issues: p.issues },
    });
    detResults[idx] = { ...p, score: enhanced.score };
    if (enhanced.failed) aiFailedUrls.push(p.signals.url);
    const pct = 15 + Math.round(((qi + 1) / Math.max(1, total)) * 60);
    const failedNow = aiFailedUrls.filter((u) =>
      targetSet ? targetSet.has(u) : true,
    ).length;
    const failedTag = failedNow ? ` (${failedNow} still failing)` : "";
    progress({
      step: "score_claude" as JobStepName,
      pct,
      message: targetMode
        ? `AI-rescored ${qi + 1}/${total} target page(s)${failedTag}`
        : `AI-rescored ${qi + 1}/${total} page(s)${failedTag}`,
    });
    if (qi < queue.length - 1) await sleep(300);
  }

  // Aggregate fresh site scores from the new per-page numbers.
  const aggregates = aggregateSite(detResults);

  const aiScoringStatus =
    aiFailedUrls.length === detResults.length ? "pending" : "complete";
  const labels = deriveGeoLabels({
    aiScoringStatus,
    pages: detResults.map((d) => d.score),
    signals: crawl,
    site,
  });

  // Mutate the existing report in place — preserve todo_list, implementation_plan,
  // and other fields the user may have edited.
  const updated: AuditReport = {
    ...report,
    generated_at: new Date().toISOString(),
    site_overall_score: aggregates.site_overall_score,
    site_seo_score: aggregates.site_seo_score,
    site_geo_score: aggregates.site_geo_score,
    site_category_averages: aggregates.site_category_averages,
    geo_readiness: {
      ...(report.geo_readiness ?? {}),
      llms_txt: site.llms_txt,
      faq_section: report.geo_readiness?.faq_section ?? false,
      direct_answer_potential:
        report.geo_readiness?.direct_answer_potential ?? false,
      structured_data: report.geo_readiness?.structured_data ?? [],
      missing_schema: deriveMissingSchema({ signals: crawl }),
      citation_readiness: labels.citation_readiness,
      information_gain: labels.information_gain,
      brand_authority: labels.brand_authority,
      eeat_signals: aggregateEeatSignals(crawl),
    },
    pages: detResults.map((p, idx) => {
      // Keep existing extra fields on each page; just overwrite the scores.
      const existing = report.pages[idx] ?? { url: p.signals.url };
      return {
        ...existing,
        url: p.signals.url,
        technical: p.score.technical,
        on_page: p.score.on_page,
        content: p.score.content,
        links: p.score.links,
        schema: p.score.schema,
        geo: p.score.geo,
        score: p.score.overall,
        issues: p.issues.map((i) => i.message),
      };
    }),
  } as AuditReport;
  // Extra fields via passthrough()
  (updated as unknown as Record<string, unknown>).ai_failed_urls = aiFailedUrls;
  (updated as unknown as Record<string, unknown>).ai_scoring_status =
    aiScoringStatus;

  // Regenerate narrative from the updated scores.
  progress({
    step: "narrative",
    pct: 80,
    message: "Regenerating Trinity review + keyword tiers",
  });
  try {
    const narrative = await generateNarrative(updated);
    if (narrative) {
      updated.trinity_review = narrative.trinity_review;
      updated.skill_based_summary = narrative.skill_based_summary;
      updated.keyword_tiers = narrative.keyword_tiers;
      updated.competitors = narrative.competitors;
      updated.top_actions = narrative.top_actions;
    }
  } catch (err) {
    console.warn(
      "[rescore] narrative regeneration failed:",
      err instanceof Error ? err.message : String(err),
    );
  }

  progress({ step: "persist", pct: 95, message: "Saving updated report" });
  await saveAuditReport(audit.company_slug, audit.id, updated);
  await updateAuditMeta(audit.company_slug, audit.id, {
    status: "completed",
    completed_at: new Date().toISOString(),
    site_overall_score: aggregates.site_overall_score,
    site_seo_score: aggregates.site_seo_score,
    site_geo_score: aggregates.site_geo_score,
    pages_audited: detResults.length,
  });
  progress({ step: "done", pct: 100, message: "Rescore complete" });

  return {
    audit_id: audit.id,
    pages_rescored: detResults.length,
    ai_failed_urls: aiFailedUrls,
    site_overall_score: aggregates.site_overall_score,
  };
}

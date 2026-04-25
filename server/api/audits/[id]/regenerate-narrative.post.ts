import {
  findAuditById,
  getAuditReport,
  saveAuditReport,
} from "../../../lib/storage/audits";
import { generateNarrative } from "../../../lib/ai/prompts/narrative";

/**
 * Regenerate ONLY the narrative sections (Trinity review, skill summary,
 * keyword tiers, competitors, top actions). Skips re-scoring entirely.
 * One Claude call — completes in ~20-40 seconds vs hours for a full rescore
 * on a large site. Use when narrative came back empty/placeholder but the
 * page scores are fine.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });
  const report = await getAuditReport(audit.company_slug, audit.id);
  if (!report) throw createError({ statusCode: 404, message: "Report not found" });

  const narrative = await generateNarrative(report);
  if (!narrative) {
    throw createError({
      statusCode: 502,
      message:
        "Narrative regeneration failed (AI returned no parseable JSON). Try again, or rescore the audit.",
    });
  }

  report.trinity_review = narrative.trinity_review;
  report.skill_based_summary = narrative.skill_based_summary;
  report.keyword_tiers = narrative.keyword_tiers;
  report.competitors = narrative.competitors;
  report.top_actions = narrative.top_actions;
  await saveAuditReport(audit.company_slug, audit.id, report);

  return {
    ok: true,
    audit_id: audit.id,
    trinity_seo: narrative.trinity_review.seo.slice(0, 80),
    keyword_count:
      narrative.keyword_tiers.primary.length +
      narrative.keyword_tiers.secondary.length +
      narrative.keyword_tiers.tertiary.length,
    competitor_count: narrative.competitors.length,
    top_actions: narrative.top_actions.length,
  };
});

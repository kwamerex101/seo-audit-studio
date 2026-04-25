import { findAuditById, getAuditReport } from "../../../lib/storage/audits";
import { createRescoreJob } from "../../../lib/jobs/queue";

/**
 * Re-run AI scoring ONLY on the URLs currently in `report.ai_failed_urls`.
 * Other pages keep their existing scores. Much faster than a full rescore
 * for big audits where only a fraction of pages timed out.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });
  const report = await getAuditReport(audit.company_slug, audit.id);
  if (!report) throw createError({ statusCode: 404, message: "Report not found" });
  const failed =
    ((report as unknown as { ai_failed_urls?: string[] }).ai_failed_urls ??
      []).filter(Boolean);
  if (failed.length === 0) {
    throw createError({
      statusCode: 400,
      message: "No failed AI pages to retry",
    });
  }
  const { jobId, auditId, companySlug } = await createRescoreJob({
    auditId: id,
    onlyUrls: failed,
  });
  return {
    job_id: jobId,
    audit_id: auditId,
    company_slug: companySlug,
    targeted: failed.length,
  };
});

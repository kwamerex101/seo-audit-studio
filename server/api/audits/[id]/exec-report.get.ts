import { findAuditById, getAuditReport } from "~~/server/lib/storage/audits";
import { renderExecHtml } from "~~/server/lib/report/exec-export";

export default defineEventHandler(async (event) => {
  const auditId = getRouterParam(event, "id");
  if (!auditId) throw createError({ statusCode: 400, message: "Missing audit id" });

  const audit = await findAuditById(auditId);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });

  const report = await getAuditReport(audit.company_slug, audit.id);
  if (!report) throw createError({ statusCode: 404, message: "Report not found" });

  const q = getQuery(event);
  const autoPrint = q.print === "1";
  const download = q.download === "1";

  const html = renderExecHtml(report, autoPrint);

  setResponseHeader(event, "Content-Type", "text/html; charset=utf-8");
  if (download) {
    setResponseHeader(
      event,
      "Content-Disposition",
      `attachment; filename="${audit.company_slug}_${audit.id}_executive.html"`,
    );
  }
  return html;
});

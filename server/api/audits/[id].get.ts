import { join } from "node:path";
import { findAuditById, getAuditReport } from "../../lib/storage/audits";
import { auditDir, fileExists } from "../../lib/storage/fs";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });
  const report = await getAuditReport(audit.company_slug, audit.id);
  const has_html_report = await fileExists(
    join(auditDir(audit.company_slug, audit.id), "report.html"),
  );
  return { audit, report, has_html_report };
});

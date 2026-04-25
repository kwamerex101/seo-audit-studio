import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findAuditById, getAuditReport } from "../../../lib/storage/audits";
import { auditDir } from "../../../lib/storage/fs";
import { renderExecHtml } from "../../../lib/report/exec-export";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });

  const q = getQuery(event);
  const wantsPrint = q.print === "1" || q.print === "true";
  const wantsDownload = q.download === "1" || q.download === "true";

  const htmlPath = join(auditDir(audit.company_slug, audit.id), "report.html");

  let html: string;
  if (existsSync(htmlPath)) {
    html = await readFile(htmlPath, "utf8");
    if (wantsPrint) {
      const printSnippet = `<script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),300)});</script>`;
      html = html.includes("</body>")
        ? html.replace("</body>", `${printSnippet}</body>`)
        : html + printSnippet;
    }
  } else {
    // No pre-generated HTML — fall back to on-the-fly executive report.
    const report = await getAuditReport(audit.company_slug, audit.id);
    if (!report) throw createError({ statusCode: 404, message: "Report not found" });
    html = renderExecHtml(report, wantsPrint);
  }

  setHeader(event, "content-type", "text/html; charset=utf-8");
  if (wantsDownload) {
    const fname = `${audit.company_slug}_${audit.id}.html`;
    setHeader(event, "content-disposition", `attachment; filename="${fname}"`);
  }
  return html;
});

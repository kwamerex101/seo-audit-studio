import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findAuditById } from "../../../lib/storage/audits";
import { auditDir } from "../../../lib/storage/fs";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });

  const htmlPath = join(auditDir(audit.company_slug, audit.id), "report.html");
  if (!existsSync(htmlPath)) {
    throw createError({
      statusCode: 404,
      message:
        "No HTML report stored for this audit yet. Full HTML export lands in Phase 4.",
    });
  }

  const q = getQuery(event);
  const wantsPrint = q.print === "1" || q.print === "true";
  const wantsDownload = q.download === "1" || q.download === "true";

  let html = await readFile(htmlPath, "utf8");

  if (wantsPrint) {
    const printSnippet = `<script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),300)});</script>`;
    if (html.includes("</body>")) {
      html = html.replace("</body>", `${printSnippet}</body>`);
    } else {
      html += printSnippet;
    }
  }

  setHeader(event, "content-type", "text/html; charset=utf-8");
  if (wantsDownload) {
    const fname = `${audit.company_slug}_${audit.id}.html`;
    setHeader(event, "content-disposition", `attachment; filename="${fname}"`);
  }
  return html;
});

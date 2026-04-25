import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findAuditById } from "../../../../lib/storage/audits";
import { auditDir } from "../../../../lib/storage/fs";

/**
 * Serve a previously-exported session file (md or html). Path:
 *   /api/audits/{id}/sessions/{filename}.{md|html}?download=1
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const file = getRouterParam(event, "file");
  if (!id || !file)
    throw createError({ statusCode: 400, message: "Missing param" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });

  // Whitelist: only allow files in the sessions/ folder, .md or .html.
  if (!/^[\w.\-]+\.(md|html)$/.test(file)) {
    throw createError({ statusCode: 400, message: "Bad filename" });
  }
  const fullPath = join(
    auditDir(audit.company_slug, audit.id),
    "sessions",
    file,
  );
  if (!existsSync(fullPath)) {
    throw createError({ statusCode: 404, message: "Session file not found" });
  }
  const text = await readFile(fullPath, "utf8");
  const isHtml = file.endsWith(".html");
  setHeader(
    event,
    "content-type",
    isHtml ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8",
  );
  const q = getQuery(event);
  if (q.download === "1" || q.download === "true") {
    setHeader(event, "content-disposition", `attachment; filename="${file}"`);
  }
  return text;
});

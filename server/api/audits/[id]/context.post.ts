import { join } from "node:path";
import { findAuditById } from "../../../lib/storage/audits";
import { auditDir, writeJson } from "../../../lib/storage/fs";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });

  const body = await readBody(event);
  const text = String(body?.text ?? "").trim();

  const file = join(auditDir(audit.company_slug, audit.id), "context.json");
  await writeJson(file, { text });
  return { context: text };
});

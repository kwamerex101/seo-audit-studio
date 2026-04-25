import { join } from "node:path";
import { findAuditById } from "../../../lib/storage/audits";
import { auditDir, readJson } from "../../../lib/storage/fs";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });

  const file = join(auditDir(audit.company_slug, audit.id), "context.json");
  const data = await readJson<{ text: string }>(file);
  return { context: data?.text ?? "" };
});

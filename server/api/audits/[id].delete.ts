import { deleteAudit, findAuditById } from "../../lib/storage/audits";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });
  await deleteAudit(audit.company_slug, audit.id);
  return { deleted: id };
});

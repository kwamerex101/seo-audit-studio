import { findAuditById } from "../../../lib/storage/audits";
import { loadConversation } from "../../../lib/storage/conversations";
import { isClaudeAvailable } from "../../../lib/ai/client";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });
  const conversation = await loadConversation(audit.company_slug, audit.id);
  return {
    conversation,
    ai_configured: await isClaudeAvailable(),
  };
});

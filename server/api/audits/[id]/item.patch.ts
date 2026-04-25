import {
  findAuditById,
  getAuditReport,
  saveAuditReport,
} from "../../../lib/storage/audits";

/**
 * Toggle a TO-DO item or implementation-plan item completion state on an
 * audit. Body shape:
 *   { kind: "todo" | "plan", id: string|number, status: "open"|"done" }
 *
 * Persists straight to the report.json so the change survives reloads. Used
 * by the TO-DO and Implementation Plan tables.
 */
export default defineEventHandler(async (event) => {
  const auditId = getRouterParam(event, "id");
  if (!auditId)
    throw createError({ statusCode: 400, message: "Missing audit id" });
  const body = await readBody(event);
  const kind = String(body?.kind ?? "");
  const itemId = body?.id;
  const status = String(body?.status ?? "");
  if (kind !== "todo" && kind !== "plan") {
    throw createError({ statusCode: 400, message: "kind must be todo|plan" });
  }
  if (status !== "open" && status !== "done") {
    throw createError({
      statusCode: 400,
      message: "status must be open|done",
    });
  }

  const audit = await findAuditById(auditId);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });
  const report = await getAuditReport(audit.company_slug, audit.id);
  if (!report)
    throw createError({ statusCode: 404, message: "Report not found" });

  if (kind === "todo") {
    const list = report.todo_list ?? [];
    const i = list.findIndex(
      (t) => String(t.id) === String(itemId) || t.issue === itemId,
    );
    if (i === -1)
      throw createError({ statusCode: 404, message: "TO-DO not found" });
    list[i].status = status;
    report.todo_list = list;
  } else {
    const list = report.implementation_plan ?? [];
    const i = list.findIndex((p) => String(p.id) === String(itemId));
    if (i === -1)
      throw createError({ statusCode: 404, message: "Plan item not found" });
    list[i].completed = status === "done";
    report.implementation_plan = list;
  }

  await saveAuditReport(audit.company_slug, audit.id, report);
  return { ok: true, kind, id: itemId, status };
});

import { findAuditById } from "../../../lib/storage/audits";
import { findJobForAudit } from "../../../lib/jobs/queue";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });
  const job = await findJobForAudit(id);
  if (!job) return { job: null };

  // Successful completions are silent — the report itself is the success
  // indicator. Don't keep showing a "100% Done" panel after the user returns.
  if (job.step === "done") return { job: null };

  // Failures stay visible for 30 minutes so users returning right after a
  // crash see what happened.
  if (job.step === "failed") {
    const completedAt = job.completed_at ? new Date(job.completed_at) : null;
    if (
      completedAt &&
      Date.now() - completedAt.getTime() > 30 * 60 * 1000
    ) {
      return { job: null };
    }
  }
  return { job };
});

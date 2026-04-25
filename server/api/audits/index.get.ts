import { listAudits, updateAuditMeta } from "../../lib/storage/audits";
import { findJobForAudit } from "../../lib/jobs/queue";

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const company = typeof q.company === "string" ? q.company : undefined;
  const audits = await listAudits(company);

  // Reconcile stale "running"/"queued" statuses against the actual job state.
  // If a job ended (failed/done) but the audit meta was never updated (e.g.
  // server restart, force-stop, or hung runner), patch it here so the dashboard
  // doesn't keep showing "running" forever.
  const reconciled = await Promise.all(
    audits.map(async (a) => {
      if (a.status !== "running" && a.status !== "queued") return a;
      const job = await findJobForAudit(a.id);
      if (!job) return a;
      if (job.step === "done" && a.status !== "completed") {
        try {
          return await updateAuditMeta(a.company_slug, a.id, {
            status: "completed",
            completed_at: job.completed_at ?? new Date().toISOString(),
          });
        } catch {
          return a;
        }
      }
      if (job.step === "failed") {
        try {
          return await updateAuditMeta(a.company_slug, a.id, {
            status: "failed",
            completed_at: job.completed_at ?? new Date().toISOString(),
          });
        } catch {
          return a;
        }
      }
      return a;
    }),
  );

  return { audits: reconciled };
});

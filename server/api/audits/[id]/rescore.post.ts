import { createRescoreJob } from "../../../lib/jobs/queue";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  try {
    const { jobId, auditId, companySlug } = await createRescoreJob({
      auditId: id,
    });
    return { job_id: jobId, audit_id: auditId, company_slug: companySlug };
  } catch (err) {
    throw createError({
      statusCode: 400,
      message: err instanceof Error ? err.message : "Rescore failed to start",
    });
  }
});

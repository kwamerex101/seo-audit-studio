import { forceTerminateJob } from "~~/server/lib/jobs/queue";

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, "id");
  if (!jobId) throw createError({ statusCode: 400, message: "Missing job id" });

  const record = await forceTerminateJob(jobId);
  if (!record) throw createError({ statusCode: 404, message: "Job not found" });

  return { ok: true, step: record.step, message: record.message };
});

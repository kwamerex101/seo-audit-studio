import { getJob } from "../../lib/jobs/queue";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing id" });
  const job = await getJob(id);
  if (!job) throw createError({ statusCode: 404, message: "Job not found" });
  return job;
});

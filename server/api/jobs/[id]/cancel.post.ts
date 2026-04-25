import { cancelJob } from "../../../lib/jobs/queue";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing job id" });
  const updated = await cancelJob(id);
  if (!updated) throw createError({ statusCode: 404, message: "Job not found" });
  return updated;
});

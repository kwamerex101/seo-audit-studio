import { exportSession } from "../../../lib/report/session-export";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  try {
    const result = await exportSession(id);
    return result;
  } catch (err) {
    throw createError({
      statusCode: 400,
      message: err instanceof Error ? err.message : "Export failed",
    });
  }
});

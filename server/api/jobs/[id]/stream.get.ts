import { getJob, subscribeToJob } from "../../../lib/jobs/queue";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing id" });
  const current = await getJob(id);
  if (!current) throw createError({ statusCode: 404, message: "Job not found" });

  setHeader(event, "content-type", "text/event-stream; charset=utf-8");
  setHeader(event, "cache-control", "no-cache, no-transform");
  setHeader(event, "connection", "keep-alive");
  setHeader(event, "x-accel-buffering", "no");

  const res = event.node.res;

  function write(data: unknown) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  write(current);

  const stopped = { value: false };
  const unsubscribe = subscribeToJob(id, (rec) => {
    if (stopped.value) return;
    write(rec);
    if (rec.step === "done" || rec.step === "failed") {
      stopped.value = true;
      res.end();
    }
  });

  if (current.step === "done" || current.step === "failed") {
    res.end();
    unsubscribe();
    return;
  }

  const heartbeat = setInterval(() => {
    if (stopped.value) return;
    res.write(`: ping\n\n`);
  }, 15000);

  event.node.req.on("close", () => {
    stopped.value = true;
    clearInterval(heartbeat);
    unsubscribe();
  });

  return new Promise<void>(() => {
    // keep the connection open; heartbeats and unsubscribe handle lifecycle
  });
});

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { findAuditById, getAuditReport } from "../../../lib/storage/audits";
import {
  appendMessage,
  loadConversation,
} from "../../../lib/storage/conversations";
import { auditDir, readJson } from "../../../lib/storage/fs";
import { streamChatReply } from "../../../lib/ai/prompts/chat";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "Missing audit id" });
  const audit = await findAuditById(id);
  if (!audit) throw createError({ statusCode: 404, message: "Audit not found" });
  const report = await getAuditReport(audit.company_slug, audit.id);
  if (!report)
    throw createError({
      statusCode: 404,
      message: "Report not yet available for this audit",
    });

  const body = await readBody(event);
  const userText = String(body?.content ?? "").trim();
  if (!userText) throw createError({ statusCode: 400, message: "Empty message" });

  const conversation = await loadConversation(audit.company_slug, audit.id);
  const contextFile = join(auditDir(audit.company_slug, audit.id), "context.json");
  const contextData = await readJson<{ text: string }>(contextFile);
  const extraContext = contextData?.text ?? "";

  const userMessage = {
    id: randomUUID(),
    role: "user" as const,
    content: userText,
    created_at: new Date().toISOString(),
    citations: [],
  };
  await appendMessage(audit.company_slug, audit.id, userMessage);

  const history = [
    ...conversation.messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user" as const, content: userText },
  ];

  setHeader(event, "content-type", "text/event-stream; charset=utf-8");
  setHeader(event, "cache-control", "no-cache, no-transform");
  setHeader(event, "connection", "keep-alive");
  setHeader(event, "x-accel-buffering", "no");

  const res = event.node.res;
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const assistantId = randomUUID();
  send({ type: "start", message_id: assistantId });

  try {
    const finalText = await streamChatReply({
      report,
      history,
      extraContext,
      onDelta: (chunk) => {
        send({ type: "delta", text: chunk });
      },
    });
    const assistantMessage = {
      id: assistantId,
      role: "assistant" as const,
      content: finalText,
      created_at: new Date().toISOString(),
      citations: [],
    };
    await appendMessage(audit.company_slug, audit.id, assistantMessage);
    send({ type: "done", message: assistantMessage });
  } catch (err) {
    send({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    res.end();
  }
});

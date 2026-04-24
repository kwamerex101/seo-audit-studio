import { join } from "node:path";
import { auditDir, ensureDir, readJson, writeJson } from "./fs";
import { ChatMessage, Conversation } from "../report/schema";

const CONVERSATION_FILE = "conversation.json";

export async function loadConversation(
  companySlug: string,
  auditId: string,
): Promise<Conversation> {
  const raw = await readJson<Conversation>(
    join(auditDir(companySlug, auditId), CONVERSATION_FILE),
  );
  if (raw) return Conversation.parse(raw);
  return {
    audit_id: auditId,
    messages: [],
    updated_at: new Date().toISOString(),
  };
}

export async function appendMessage(
  companySlug: string,
  auditId: string,
  message: ChatMessage,
): Promise<Conversation> {
  const current = await loadConversation(companySlug, auditId);
  current.messages.push(message);
  current.updated_at = new Date().toISOString();
  const dir = auditDir(companySlug, auditId);
  await ensureDir(dir);
  await writeJson(join(dir, CONVERSATION_FILE), current);
  return current;
}

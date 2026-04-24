<script setup lang="ts">
import type { ChatMessage } from "~~/server/lib/report/schema";

const props = defineProps<{
  auditId: string;
}>();

const open = ref(false);
const input = ref("");
const sending = ref(false);
const messages = ref<ChatMessage[]>([]);
const aiConfigured = ref(true);
const streamingText = ref("");
const errorText = ref<string | null>(null);
const scroller = ref<HTMLElement | null>(null);

async function loadConversation() {
  try {
    const res = await $fetch<{
      conversation: { messages: ChatMessage[] };
      ai_configured: boolean;
    }>(`/api/audits/${props.auditId}/chat`);
    messages.value = res.conversation.messages;
    aiConfigured.value = res.ai_configured;
  } catch {
    // ignore — widget works as empty
  }
}

onMounted(loadConversation);

async function scrollToBottom() {
  await nextTick();
  if (scroller.value) {
    scroller.value.scrollTop = scroller.value.scrollHeight;
  }
}

async function send() {
  const text = input.value.trim();
  if (!text || sending.value) return;
  errorText.value = null;
  sending.value = true;
  streamingText.value = "";
  messages.value.push({
    id: `local-${Date.now()}`,
    role: "user",
    content: text,
    created_at: new Date().toISOString(),
    citations: [],
  });
  input.value = "";
  await scrollToBottom();

  try {
    const response = await fetch(`/api/audits/${props.auditId}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        let event: any;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        if (event.type === "delta") {
          streamingText.value += event.text ?? "";
          await scrollToBottom();
        } else if (event.type === "done") {
          messages.value.push(event.message);
          streamingText.value = "";
        } else if (event.type === "error") {
          errorText.value = event.message ?? "Stream error";
        }
      }
    }
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : String(err);
  } finally {
    sending.value = false;
    await scrollToBottom();
  }
}
</script>

<template>
  <div class="fixed bottom-5 right-5 z-50">
    <button
      v-if="!open"
      class="flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-bg shadow-lg hover:bg-accent/90"
      @click="open = true"
    >
      <span>💬</span>
      <span>Ask about this audit</span>
    </button>

    <div
      v-else
      class="flex h-[600px] w-[420px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
    >
      <div
        class="flex items-center justify-between border-b border-border bg-surface2 px-4 py-3"
      >
        <div>
          <div class="text-sm font-semibold">Audit Q&amp;A</div>
          <div class="text-xs text-mute">Claude-powered · report-aware</div>
        </div>
        <button
          class="rounded p-1 text-mute hover:bg-surface hover:text-text"
          @click="open = false"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div
        v-if="!aiConfigured"
        class="border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn"
      >
        Set <code>ANTHROPIC_API_KEY</code> in <code>.env</code> to enable Q&amp;A.
      </div>

      <div
        ref="scroller"
        class="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm"
      >
        <div
          v-if="messages.length === 0 && !streamingText"
          class="space-y-2 text-mute"
        >
          <p>Try asking:</p>
          <ul class="list-disc pl-5 text-xs">
            <li>Which page has the weakest GEO score and why?</li>
            <li>What keywords should the /services page target?</li>
            <li>Give me a Yoast-ready meta description for the homepage.</li>
            <li>What's the single most critical fix on this site?</li>
          </ul>
        </div>
        <div
          v-for="m in messages"
          :key="m.id"
          :class="[
            'max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2',
            m.role === 'user'
              ? 'ml-auto bg-accent/15 text-text'
              : 'bg-surface2 text-text',
          ]"
        >
          {{ m.content }}
        </div>
        <div
          v-if="streamingText"
          class="max-w-[90%] whitespace-pre-wrap rounded-lg bg-surface2 px-3 py-2 text-text"
        >
          {{ streamingText }}
          <span class="ml-0.5 inline-block animate-pulse">▍</span>
        </div>
        <div
          v-if="errorText"
          class="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad"
        >
          {{ errorText }}
        </div>
      </div>

      <form
        class="flex items-center gap-2 border-t border-border bg-surface2 px-3 py-3"
        @submit.prevent="send"
      >
        <input
          v-model="input"
          type="text"
          placeholder="Ask a question about this audit…"
          class="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          :disabled="sending || !aiConfigured"
        />
        <button
          type="submit"
          class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/40"
          :disabled="sending || !input.trim() || !aiConfigured"
        >
          Send
        </button>
      </form>
    </div>
  </div>
</template>
